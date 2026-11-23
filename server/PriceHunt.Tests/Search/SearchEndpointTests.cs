using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PriceHunt.Api.Data;
using PriceHunt.Api.Search;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Tests.Search;

public class SearchEndpointTests
{
    // From the factory's default random values, in delay order. Lantern hangs.
    private static readonly (string SupplierId, string Type, TimeSpan Delay, decimal? Price)[] Answers =
    [
        ("harbor", "quote", TimeSpan.FromSeconds(1.0625), 443.75m),
        ("comet", "quote", TimeSpan.FromSeconds(1.625), 162.50m),
        ("granite", "supplier-failed", TimeSpan.FromSeconds(2.1875), null),
        ("pelican", "quote", TimeSpan.FromSeconds(2.75), 275.00m),
        ("nimbus", "quote", TimeSpan.FromSeconds(3.3125), 106.25m),
        ("maple", "quote", TimeSpan.FromSeconds(3.875), 387.50m),
    ];

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task SS2_StartedComesFirst_ThenEachResultAfterItsOwnDelay_InDelayOrder()
    {
        await using var factory = new PriceHuntApiFactory();
        using var client = factory.CreateClient();
        await using var events = await StartSearchAsync(client, Body(Guid.NewGuid()), Ct);

        var started = await events.NextAsync("started");
        Assert.Equal(
            SupplierCatalog.All,
            started.Data.GetProperty("suppliers").EnumerateArray()
                .Select(s => new SupplierInfo(s.GetProperty("id").GetString()!, s.GetProperty("name").GetString()!)));

        var elapsed = TimeSpan.Zero;
        foreach (var (supplierId, type, delay, _) in Answers)
        {
            // Exactly to this supplier's delay: the later ones are still pending when its event is read.
            factory.Time.Advance(delay - elapsed);
            elapsed = delay;
            var answer = await events.NextAsync(type);
            Assert.Equal(supplierId, answer.Data.GetProperty("supplierId").GetString());
            Assert.Equal((long)delay.TotalMilliseconds, answer.Data.GetProperty("responseTimeMs").GetInt64());
        }

        factory.Time.Advance(TimeSpan.FromSeconds(6) - elapsed);
        await events.NextAsync("ended");
        await events.AssertClosedAsync();
    }

    [Fact]
    public async Task SS3_I1_I2_DefaultSearch_EndsTimedOutAtSixSeconds_WithSixOfSevenResponded()
    {
        await using var factory = new PriceHuntApiFactory();
        using var client = factory.CreateClient();
        await using var events = await StartSearchAsync(client, Body(Guid.NewGuid()), Ct);
        await events.NextAsync("started");

        await ReadAllAnswersAsync(factory, events);
        factory.Time.Advance(TimeSpan.FromSeconds(1));

        var ended = await events.NextAsync("ended");
        Assert.Equal("timedOut", ended.Data.GetProperty("status").GetString());
        Assert.Equal(6, ended.Data.GetProperty("responded").GetInt32());
        Assert.Equal(7, ended.Data.GetProperty("total").GetInt32());
        await events.AssertClosedAsync();
    }

    [Fact]
    public async Task SS3_I2_HangingSupplierDeselected_EndsCompletedBeforeTheDeadline()
    {
        await using var factory = new PriceHuntApiFactory();
        using var client = factory.CreateClient();
        var allButLantern = SupplierCatalog.All.Select(s => s.Id).Where(id => id != "lantern").ToArray();
        await using var events = await StartSearchAsync(client, Body(Guid.NewGuid(), allButLantern), Ct);
        await events.NextAsync("started");

        // Lantern draws no random values, so the others get the same values as in a default search.
        await ReadAllAnswersAsync(factory, events);

        var ended = await events.NextAsync("ended");
        Assert.Equal("completed", ended.Data.GetProperty("status").GetString());
        Assert.Equal(6, ended.Data.GetProperty("responded").GetInt32());
        Assert.Equal(6, ended.Data.GetProperty("total").GetInt32());
        await events.AssertClosedAsync();
    }

    [Fact]
    public async Task SS4_FlakySupplierFails_TheOthersStillSendQuotes()
    {
        await using var factory = new PriceHuntApiFactory();
        using var client = factory.CreateClient();
        await using var events = await StartSearchAsync(client, Body(Guid.NewGuid()), Ct);
        await events.NextAsync("started");

        var answers = await ReadAllAnswersAsync(factory, events);

        var failed = Assert.Single(answers, a => a.Type == "supplier-failed");
        Assert.Equal("granite", failed.Data.GetProperty("supplierId").GetString());
        Assert.False(failed.Data.TryGetProperty("price", out _));
        var quotes = answers.Where(a => a.Type == "quote").ToList();
        Assert.Equal(
            ["comet", "harbor", "maple", "nimbus", "pelican"],
            quotes.Select(q => q.Data.GetProperty("supplierId").GetString()).Order());
        Assert.All(quotes, q => Assert.Equal(
            Answers.Single(a => a.SupplierId == q.Data.GetProperty("supplierId").GetString()).Price,
            q.Data.GetProperty("price").GetDecimal()));

        factory.Time.Advance(TimeSpan.FromSeconds(1));
        await events.NextAsync("ended");
    }

    [Fact]
    public async Task SS5_I7_ClientAbortsMidStream_SearchIsStoredAsCancelled()
    {
        await using var factory = new PriceHuntApiFactory();
        using var client = factory.CreateClient();
        var searchId = Guid.NewGuid();
        var events = await StartSearchAsync(client, Body(searchId), Ct);
        await events.NextAsync("started");
        factory.Time.Advance(Answers[0].Delay);
        await events.NextAsync("quote");

        // Closing the response stream aborts the request, like fetch's AbortController in the browser.
        await events.DisposeAsync();

        await factory.SearchFinished.WaitAsync(Ct);
        await using var db = await CreateDbAsync(factory);
        Assert.Equal(SearchStatus.Cancelled, (await db.Searches.SingleAsync(s => s.Id == searchId, Ct)).Status);
    }

    [Fact]
    public async Task SC6_EveryEvent_CarriesTheSearchIdTheClientSent()
    {
        await using var factory = new PriceHuntApiFactory();
        using var client = factory.CreateClient();
        var searchId = Guid.NewGuid();
        await using var events = await StartSearchAsync(client, Body(searchId), Ct);

        List<SseEvent> all = [await events.NextAsync("started"), .. await ReadAllAnswersAsync(factory, events)];
        factory.Time.Advance(TimeSpan.FromSeconds(1));
        all.Add(await events.NextAsync("ended"));
        await events.AssertClosedAsync();

        Assert.All(all, e => Assert.Equal(searchId, e.Data.GetProperty("searchId").GetGuid()));
    }

    [Theory]
    [InlineData("fromLocation", null, nameof(SearchRequest.FromLocation))]
    [InlineData("toLocation", "   ", nameof(SearchRequest.ToLocation))]
    [InlineData("fromDate", null, nameof(SearchRequest.FromDate))]
    [InlineData("toDate", null, nameof(SearchRequest.ToDate))]
    [InlineData("fromDate", "2026-12-06", nameof(SearchRequest.FromDate))]
    [InlineData("supplierIds", new[] { "harbor", "nope" }, nameof(SearchRequest.SupplierIds))]
    [InlineData("searchId", "00000000-0000-0000-0000-000000000000", nameof(SearchRequest.SearchId))]
    public async Task SS1_InvalidRequest_Returns400ProblemDetails_AndStoresNothing(string field, object? value, string errorKey)
    {
        await using var factory = new PriceHuntApiFactory();
        using var client = factory.CreateClient();
        var body = Body(Guid.NewGuid());
        if (value is null)
            body.Remove(field); // missing from the JSON
        else
            body[field] = value;

        using var response = await PostHeadersAsync(client, body);

        await AssertValidationProblemAsync(response, errorKey);
        await using var db = await CreateDbAsync(factory);
        Assert.False(await db.Searches.AnyAsync(Ct));
    }

    [Fact]
    public async Task SS1_SameFromAndToDate_IsAccepted()
    {
        await using var factory = new PriceHuntApiFactory();
        using var client = factory.CreateClient();
        var body = Body(Guid.NewGuid());
        body["toDate"] = body["fromDate"];

        await AbortAfterStartedAsync(factory, await StartSearchAsync(client, body, Ct));
    }

    [Fact]
    public async Task SS1_ReusedSearchId_Returns400ProblemDetails()
    {
        await using var factory = new PriceHuntApiFactory();
        using var client = factory.CreateClient();
        var searchId = Guid.NewGuid();
        await AbortAfterStartedAsync(factory, await StartSearchAsync(client, Body(searchId), Ct));

        using var response = await PostHeadersAsync(client, Body(searchId));

        await AssertValidationProblemAsync(response, nameof(SearchRequest.SearchId));
    }

    [Fact]
    public async Task SS1_EmptySupplierIds_StartsEverySupplier()
    {
        await using var factory = new PriceHuntApiFactory();
        using var client = factory.CreateClient();
        var events = await StartSearchAsync(client, Body(Guid.NewGuid(), []), Ct);

        var started = await AbortAfterStartedAsync(factory, events);

        Assert.Equal(SupplierCatalog.All.Select(s => s.Id), SupplierIds(started));
    }

    [Fact]
    public async Task SS1_TwoSupplierIds_StartOnlyThoseTwo()
    {
        await using var factory = new PriceHuntApiFactory();
        using var client = factory.CreateClient();
        var events = await StartSearchAsync(client, Body(Guid.NewGuid(), ["lantern", "comet"]), Ct);

        var started = await AbortAfterStartedAsync(factory, events);

        Assert.Equal(["comet", "lantern"], SupplierIds(started));
    }

    [Fact]
    public async Task I6_LocationsWithSurroundingSpaces_AreStoredTrimmed()
    {
        await using var factory = new PriceHuntApiFactory();
        using var client = factory.CreateClient();
        var searchId = Guid.NewGuid();
        var body = Body(searchId);
        body["fromLocation"] = "  Berlin ";
        body["toLocation"] = "\tNew York  ";

        await AbortAfterStartedAsync(factory, await StartSearchAsync(client, body, Ct));

        await using var db = await CreateDbAsync(factory);
        var search = await db.Searches.SingleAsync(s => s.Id == searchId, Ct);
        Assert.Equal(("Berlin", "New York"), (search.FromLocation, search.ToLocation));
    }

    private static Dictionary<string, object?> Body(Guid searchId, string[]? supplierIds = null) => new()
    {
        ["searchId"] = searchId,
        ["fromLocation"] = "Berlin",
        ["toLocation"] = "Paris",
        ["fromDate"] = "2026-12-01",
        ["toDate"] = "2026-12-05",
        ["supplierIds"] = supplierIds,
    };

    // Headers only: a request that wrongly starts a stream fails on the status code instead of waiting for the stream to end.
    private static async Task<HttpResponseMessage> PostHeadersAsync(HttpClient client, object body)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/search") { Content = JsonContent.Create(body) };
        return await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, Ct);
    }

    private static async Task<SseReader> StartSearchAsync(HttpClient client, object body, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/search") { Content = JsonContent.Create(body) };
        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/event-stream", response.Content.Headers.ContentType?.MediaType);
        return new SseReader(response, await response.Content.ReadAsStreamAsync(ct), ct);
    }

    // The built-in validation keys errors by the C# property name, not the camelCase JSON name.
    private static async Task AssertValidationProblemAsync(HttpResponseMessage response, string errorKey)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = JsonElement.Parse(await response.Content.ReadAsStringAsync(Ct));
        Assert.True(
            problem.GetProperty("errors").TryGetProperty(errorKey, out _),
            $"Expected an error for '{errorKey}', got: {problem.GetProperty("errors")}");
    }

    // Reads `started`, then aborts and waits for the Cancelled status, so the search is over before the factory is disposed.
    private static async Task<SseEvent> AbortAfterStartedAsync(PriceHuntApiFactory factory, SseReader events)
    {
        var started = await events.NextAsync("started");
        await events.DisposeAsync();
        await factory.SearchFinished.WaitAsync(Ct);
        return started;
    }

    private static IEnumerable<string?> SupplierIds(SseEvent started) =>
        started.Data.GetProperty("suppliers").EnumerateArray().Select(s => s.GetProperty("id").GetString());

    private static Task<AppDbContext> CreateDbAsync(PriceHuntApiFactory factory) =>
        factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync(Ct);

    // 5 s: every answering supplier is done, the 6 s deadline hasn't passed.
    private static async Task<List<SseEvent>> ReadAllAnswersAsync(PriceHuntApiFactory factory, SseReader events)
    {
        factory.Time.Advance(TimeSpan.FromSeconds(5));
        List<SseEvent> answers = [];
        for (var i = 0; i < Answers.Length; i++)
            answers.Add(await events.NextAsync());
        Assert.All(answers, a => Assert.Contains(a.Type, new[] { "quote", "supplier-failed" }));
        return answers;
    }
}
