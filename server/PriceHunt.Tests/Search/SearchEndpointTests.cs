using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PriceHunt.Api.Data;
using PriceHunt.Api.Search;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Tests.Search;

public class SearchEndpointTests
{
    // From the factory's default random values, in delay order. Lantern hangs.
    private static readonly (string SupplierId, string Type, TimeSpan Delay)[] Answers =
    [
        ("harbor", "quote", TimeSpan.FromSeconds(1.0625)),
        ("comet", "quote", TimeSpan.FromSeconds(1.625)),
        ("granite", "supplier-failed", TimeSpan.FromSeconds(2.1875)),
        ("pelican", "quote", TimeSpan.FromSeconds(2.75)),
        ("nimbus", "quote", TimeSpan.FromSeconds(3.3125)),
        ("maple", "quote", TimeSpan.FromSeconds(3.875)),
    ];

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task SS2_StartedComesFirst_ThenEachResultAfterItsOwnDelay_InDelayOrder()
    {
        await using var factory = new PriceHuntApiFactory();
        using var client = factory.CreateClient();
        await using var events = await StartSearchAsync(client, Body(Guid.NewGuid()), Ct);

        // No time has passed yet, so no supplier has answered.
        var started = await events.NextAsync("started");
        Assert.Equal(
            SupplierCatalog.All,
            started.Data.GetProperty("suppliers").EnumerateArray()
                .Select(s => new SupplierInfo(s.GetProperty("id").GetString()!, s.GetProperty("name").GetString()!)));

        var elapsed = TimeSpan.Zero;
        foreach (var (supplierId, type, delay) in Answers)
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

        // Lantern is last in the catalog, so the others draw the same values as in a default search.
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
        Assert.All(quotes, q => Assert.True(q.Data.GetProperty("price").GetDecimal() > 0));

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
        await using var db = await factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync(Ct);
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

        Assert.Equal(8, all.Count);
        Assert.All(all, e => Assert.Equal(searchId, e.Data.GetProperty("searchId").GetGuid()));
    }

    private static object Body(Guid searchId, string[]? supplierIds = null) => new
    {
        searchId,
        fromLocation = "Berlin",
        toLocation = "Paris",
        fromDate = "2026-12-01",
        toDate = "2026-12-05",
        supplierIds,
    };

    private static async Task<SseReader> StartSearchAsync(HttpClient client, object body, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/search") { Content = JsonContent.Create(body) };
        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/event-stream", response.Content.Headers.ContentType?.MediaType);
        return new SseReader(await response.Content.ReadAsStreamAsync(ct), ct);
    }

    // Advances to 5 s, past every answering supplier's delay but not the 6 s deadline, and reads their six events.
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
