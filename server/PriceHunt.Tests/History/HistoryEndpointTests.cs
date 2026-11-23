using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PriceHunt.Api.Data;
using PriceHunt.Api.Search;
using PriceHunt.Tests.Search;

namespace PriceHunt.Tests.History;

public class HistoryEndpointTests
{
    private static readonly DateTime Noon = new(2026, 11, 20, 12, 0, 0, DateTimeKind.Utc);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Theory]
    [InlineData("?startDate=2026-11-22T22:00:00Z&endDate=2026-11-23T22:00:00Z", 1, 2)]
    [InlineData("?startDate=2026-11-23T00:00:00%2B02:00&endDate=2026-11-24T00:00:00%2B02:00", 1, 2)]
    [InlineData("?startDate=2026-11-22T22:00:00Z", 1, 3)]
    [InlineData("?endDate=2026-11-23T22:00:00Z", 0, 2)]
    public async Task HS1_I4_DateFilter_AppliesToTheSearchTimestamp_StartInclusive_EndExclusive(string query, int first, int last)
    {
        await using var factory = new PriceHuntApiFactory();
        DateTime[] timestamps =
        [
            new(2026, 11, 22, 21, 59, 59, DateTimeKind.Utc),
            new(2026, 11, 22, 22, 0, 0, DateTimeKind.Utc),
            new(2026, 11, 23, 21, 59, 59, DateTimeKind.Utc),
            new(2026, 11, 23, 22, 0, 0, DateTimeKind.Utc),
        ];
        await SeedAsync(factory, [.. timestamps.Select(t => Row() with { CreatedAtUtc = t })]);

        var page = await GetPageAsync(factory, query);

        Assert.Equal(
            timestamps[first..(last + 1)].Reverse(),
            page.Items.Select(i => i.GetProperty("date").GetDateTime()));
    }

    [Fact]
    public async Task HS1_ResponsesOfEverySearchStatus_AreReturned()
    {
        await using var factory = new PriceHuntApiFactory();
        var ids = await SeedAsync(factory, [.. Enum.GetValues<SearchStatus>().Select(s => Row($"{s}") with { Status = s })]);

        var page = await GetPageAsync(factory, "");

        Assert.Equal(ids.Values.Order(), page.Ids.Order());
    }

    [Theory]
    [InlineData("?supplierIds=comet", new[] { "comet" })]
    [InlineData("?supplierIds=comet&supplierIds=lantern&supplierIds=pelican", new[] { "comet", "lantern", "pelican" })]
    [InlineData("", new[] { "comet", "granite", "harbor", "lantern", "maple", "nimbus", "pelican" })]
    public async Task HS1_SupplierFilter_OneSeveralOrAll(string query, string[] expectedSupplierIds)
    {
        await using var factory = new PriceHuntApiFactory();
        var ids = await SeedAsync(factory,
            [.. new[] { "pelican", "comet", "maple", "harbor", "nimbus", "granite", "lantern" }.Select(s => Row(s) with { SupplierId = s })]);

        var page = await GetPageAsync(factory, query);

        Assert.Equal(expectedSupplierIds.Select(s => ids[s]).Order(), page.Ids.Order());
    }

    [Theory]
    [InlineData("?fromLocation=%20bERLIN%20", new[] { "berlin-paris", "berlin-rome" })]
    [InlineData("?toLocation=PARIS%09", new[] { "berlin-paris", "madrid-paris" })]
    [InlineData("?fromLocation=berlin&toLocation=paris", new[] { "berlin-paris" })]
    [InlineData("?fromLocation=%20%20", new[] { "berlin-paris", "berlin-rome", "madrid-paris" })]
    [InlineData("?toLocation=", new[] { "berlin-paris", "berlin-rome", "madrid-paris" })]
    public async Task HS2_I6_LocationFilter_IsTrimmedAndCaseInsensitive(string query, string[] expected)
    {
        await using var factory = new PriceHuntApiFactory();
        var ids = await SeedAsync(factory,
            Row("berlin-paris") with { FromLocation = "Berlin", ToLocation = "Paris" },
            Row("berlin-rome") with { FromLocation = "BERLIN", ToLocation = "Rome" },
            Row("madrid-paris") with { FromLocation = "Madrid", ToLocation = "paris" });

        var page = await GetPageAsync(factory, query);

        Assert.Equal(expected.Select(k => ids[k]).Order(), page.Ids.Order());
    }

    [Theory]
    [InlineData("from", "Österreich")]
    [InlineData("from", "ÖSTERREICH")]
    [InlineData("to", "Österreich")]
    [InlineData("to", "ÖSTERREICH")]
    public async Task HS2_I6_LocationFilter_MatchesANonAsciiLocation(string side, string location)
    {
        await using var factory = new PriceHuntApiFactory();
        var ids = await SeedAsync(factory,
            Row("match") with { FromLocation = "Österreich", ToLocation = "Österreich" },
            Row("other"));

        var page = await GetPageAsync(factory, $"?{side}Location={Uri.EscapeDataString(location)}");

        Assert.Equal([ids["match"]], page.Ids);
    }

    [Fact]
    public async Task HS1_HS2_FiltersCombined_ReturnOnlyRowsMatchingAll()
    {
        await using var factory = new PriceHuntApiFactory();
        var match = Row("match") with { CreatedAtUtc = Noon, SupplierId = "comet", FromLocation = "Berlin", ToLocation = "Paris" };
        var ids = await SeedAsync(factory,
            match,
            match with { Key = "too-early", CreatedAtUtc = Noon.AddDays(-1) },
            match with { Key = "other-supplier", SupplierId = "maple" },
            match with { Key = "other-from", FromLocation = "Madrid" },
            match with { Key = "other-to", ToLocation = "Rome" });

        var page = await GetPageAsync(factory,
            "?startDate=2026-11-20T00:00:00Z&endDate=2026-11-21T00:00:00Z&supplierIds=comet&supplierIds=harbor" +
            "&fromLocation=berlin&toLocation=paris");

        Assert.Equal([ids["match"]], page.Ids);
        Assert.Equal(1, page.Total);
    }

    [Theory]
    [InlineData("asc")]
    [InlineData("desc")]
    public async Task I5_FailedRows_HaveANullPrice_AndSortLastByPrice(string sortDir)
    {
        await using var factory = new PriceHuntApiFactory();
        var ids = await SeedAsync(factory,
            Row("failed") with { PriceMinor = null },
            Row("cheap") with { PriceMinor = 10_025 },
            Row("dear") with { PriceMinor = 30_000 });

        var page = await GetPageAsync(factory, $"?sortBy=price&sortDir={sortDir}");

        string[] expected = sortDir == "asc" ? ["cheap", "dear", "failed"] : ["dear", "cheap", "failed"];
        Assert.Equal(expected.Select(k => ids[k]), page.Ids);
        Assert.Equal(JsonValueKind.Null, page.Items[2].GetProperty("price").ValueKind);
        Assert.Equal(100.25m, page.Items.Single(i => i.GetProperty("id").GetInt64() == ids["cheap"]).GetProperty("price").GetDecimal());
    }

    // A, C and E share the from location, and their id order differs from both directions of the to location.
    [Theory]
    [InlineData("date", "asc", "E,D,A,C,B")]
    [InlineData("date", "desc", "B,C,A,D,E")]
    [InlineData("route", "asc", "B,C,E,A,D")]
    [InlineData("route", "desc", "D,A,E,C,B")]
    [InlineData("supplier", "asc", "B,A,D,E,C")]
    [InlineData("supplier", "desc", "C,E,D,A,B")]
    [InlineData("price", "asc", "B,D,A,E,C")]
    [InlineData("price", "desc", "E,A,D,B,C")]
    [InlineData("responseTime", "asc", "C,A,B,D,E")]
    [InlineData("responseTime", "desc", "E,D,B,A,C")]
    public async Task HS1_SortByEveryColumn_InBothDirections(string sortBy, string sortDir, string expected)
    {
        await using var factory = new PriceHuntApiFactory();
        var ids = await SeedAsync(factory,
            new SeedRow("A", Noon.AddHours(-2), "Berlin", "Rome", "harbor", 30_000, 2000),
            new SeedRow("B", Noon, "Amsterdam", "Paris", "comet", 10_000, 3000),
            new SeedRow("C", Noon.AddHours(-1), "Berlin", "Madrid", "pelican", null, 1000),
            new SeedRow("D", Noon.AddHours(-3), "Cairo", "Oslo", "maple", 20_000, 4000),
            new SeedRow("E", Noon.AddHours(-4), "Berlin", "Naples", "nimbus", 40_000, 5000));

        var page = await GetPageAsync(factory, $"?sortBy={sortBy}&sortDir={sortDir}");

        Assert.Equal(expected.Split(',').Select(k => ids[k]), page.Ids);
    }

    [Theory]
    [InlineData("date", "asc")]
    [InlineData("date", "desc")]
    [InlineData("price", "asc")]
    [InlineData("price", "desc")]
    public async Task HS1_TiedRows_AreOrderedById_InBothDirections(string sortBy, string sortDir)
    {
        await using var factory = new PriceHuntApiFactory();
        // SQLite reads filtered rows in supplier order, so without the sort by id they come back in reverse.
        // The response times differ, so a date sort by ReceivedAtUtc also fails.
        var ids = await SeedAsync(factory,
            Row("first") with { SupplierId = "pelican", ResponseTimeMs = 2000 },
            Row("second") with { SupplierId = "maple", ResponseTimeMs = 3000 },
            Row("third") with { SupplierId = "comet", ResponseTimeMs = 1000 });

        var page = await GetPageAsync(factory,
            $"?supplierIds=comet&supplierIds=maple&supplierIds=pelican&sortBy={sortBy}&sortDir={sortDir}");

        Assert.Equal([ids["first"], ids["second"], ids["third"]], page.Ids);
    }

    [Theory]
    [InlineData("asc", "A,B,C,D")]
    [InlineData("desc", "D,C,B,A")]
    public async Task I6_SortByRoute_IgnoresCase(string sortDir, string expected)
    {
        await using var factory = new PriceHuntApiFactory();
        var ids = await SeedAsync(factory,
            Row("D") with { FromLocation = "Zurich", ToLocation = "Paris" },
            Row("C") with { FromLocation = "berlin", ToLocation = "Rome" },
            Row("A") with { FromLocation = "amsterdam", ToLocation = "Paris" },
            Row("B") with { FromLocation = "Berlin", ToLocation = "oslo" });

        var page = await GetPageAsync(factory, $"?sortBy=route&sortDir={sortDir}");

        Assert.Equal(expected.Split(',').Select(k => ids[k]), page.Ids);
    }

    [Fact]
    public async Task HS1_SortBySupplier_UsesTheName_NotTheId()
    {
        await using var factory = new PriceHuntApiFactory();
        var ids = await SeedAsync(factory, Row("comet") with { SupplierId = "comet" }, Row("maple") with { SupplierId = "maple" });
        // In the catalog, names and ids sort the same way.
        await using (var db = await CreateDbAsync(factory))
            await db.Suppliers.Where(s => s.Id == "comet").ExecuteUpdateAsync(u => u.SetProperty(s => s.Name, "Zebra"), Ct);

        var page = await GetPageAsync(factory, "?sortBy=supplier&sortDir=asc");

        Assert.Equal([ids["maple"], ids["comet"]], page.Ids);
    }

    [Fact]
    public async Task HS1_Paging_TotalIsCorrect_PagesDontOverlap_LastPageIsPartial()
    {
        await using var factory = new PriceHuntApiFactory();
        await SeedAsync(factory, [.. Enumerable.Range(0, 25).Select(i => Row($"{i}") with { CreatedAtUtc = Noon.AddMinutes(i) })]);

        var pages = new List<HistoryPage>();
        for (var p = 1; p <= 4; p++)
            pages.Add(await GetPageAsync(factory, $"?page={p}&pageSize=10"));

        Assert.Equal([10, 10, 5, 0], pages.Select(p => p.Items.Count));
        Assert.All(pages, p => Assert.Equal((25, 10), (p.Total, p.PageSize)));
        Assert.Equal([1, 2, 3, 4], pages.Select(p => p.Page));
        Assert.Equal(25, pages.SelectMany(p => p.Ids).Distinct().Count());
    }

    [Fact]
    public async Task HS1_NoQueryString_ReturnsTheFirst20RowsNewestFirst()
    {
        await using var factory = new PriceHuntApiFactory();
        var ids = await SeedAsync(factory,
            [.. Enumerable.Range(0, 25).Select(i => Row($"{i}") with { CreatedAtUtc = Noon.AddMinutes(i) })]);

        var page = await GetPageAsync(factory, "");

        Assert.Equal((1, 20, 25), (page.Page, page.PageSize, page.Total));
        Assert.Equal(Enumerable.Range(5, 20).Reverse().Select(i => ids[$"{i}"]), page.Ids);
    }

    [Theory]
    [InlineData("?sortBy=name")]
    [InlineData("?sortDir=up")]
    [InlineData("?page=0")]
    [InlineData("?page=1000001")]
    [InlineData("?pageSize=0")]
    [InlineData("?pageSize=101")]
    [InlineData("?startDate=2026-11-23T00:00:00Z&endDate=2026-11-23T00:00:00Z")]
    [InlineData("?startDate=2026-11-24T00:00:00Z&endDate=2026-11-23T00:00:00Z")]
    [InlineData("?startDate=yesterday")]
    public async Task HS1_InvalidQuery_Returns400(string query)
    {
        await using var factory = new PriceHuntApiFactory();
        using var client = factory.CreateClient();

        using var response = await client.GetAsync($"/api/history{query}", Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("?page=1000000&pageSize=100")]
    [InlineData("?pageSize=1")]
    public async Task HS1_EdgeOfTheValidRange_Returns200(string query)
    {
        await using var factory = new PriceHuntApiFactory();

        var page = await GetPageAsync(factory, query);

        Assert.Empty(page.Items);
    }

    [Fact]
    public async Task I4_Item_HasTheResponseTime_AndAUtcDateEndingWithZ()
    {
        await using var factory = new PriceHuntApiFactory();
        await SeedAsync(factory, Row() with { CreatedAtUtc = new DateTime(2026, 11, 22, 22, 30, 15, DateTimeKind.Utc) });

        var page = await GetPageAsync(factory, "");

        var item = Assert.Single(page.Items);
        Assert.Equal("2026-11-22T22:30:15Z", item.GetProperty("date").GetString());
        Assert.Equal(1000, item.GetProperty("responseTimeMs").GetInt64());
    }

    [Fact]
    public async Task HS1_I5_SearchRunThroughTheStream_AppearsInHistory()
    {
        await using var factory = new PriceHuntApiFactory();
        using var client = factory.CreateClient();
        var searchId = Guid.NewGuid();
        await using (var events = await SearchEndpointTests.StartSearchAsync(client, SearchEndpointTests.Body(searchId), Ct))
        {
            await events.NextAsync("started");
            await SearchEndpointTests.ReadAllAnswersAsync(factory, events);
            factory.Time.Advance(TimeSpan.FromSeconds(1));
            await events.NextAsync("ended");
        }

        var page = await GetPageAsync(factory, "");

        Assert.Equal(6, page.Total);
        Assert.All(page.Items, i => Assert.Equal(
            ("Berlin", "Paris"), (i.GetProperty("fromLocation").GetString(), i.GetProperty("toLocation").GetString())));
        var prices = page.Items.ToDictionary(
            i => i.GetProperty("supplierName").GetString()!,
            i => i.GetProperty("price").ValueKind == JsonValueKind.Null ? (decimal?)null : i.GetProperty("price").GetDecimal());
        Assert.Equal(
            new Dictionary<string, decimal?>
            {
                ["Pelican Parcel"] = 275.00m,
                ["Comet Cargo"] = 162.50m,
                ["Maple Freight"] = 387.50m,
                ["Harbor Hop"] = 443.75m,
                ["Nimbus Shipping"] = 106.25m,
                ["Granite Logistics"] = null,
            },
            prices);
    }

    private sealed record HistoryPage(List<JsonElement> Items, int Total, int Page, int PageSize)
    {
        public IEnumerable<long> Ids => Items.Select(i => i.GetProperty("id").GetInt64());
    }

    private sealed record SeedRow(
        string Key, DateTime CreatedAtUtc, string FromLocation, string ToLocation, string SupplierId, long? PriceMinor, long ResponseTimeMs,
        SearchStatus Status = SearchStatus.Completed);

    private static SeedRow Row(string key = "row") => new(key, Noon, "Berlin", "Paris", "comet", 10_000, 1000);

    private static async Task<Dictionary<string, long>> SeedAsync(PriceHuntApiFactory factory, params SeedRow[] rows)
    {
        await using var db = await CreateDbAsync(factory);
        var ids = new Dictionary<string, long>();
        foreach (var row in rows)
        {
            var search = new SearchRecord
            {
                Id = Guid.NewGuid(),
                FromLocation = row.FromLocation,
                ToLocation = row.ToLocation,
                FromDate = new DateOnly(2026, 12, 1),
                ToDate = new DateOnly(2026, 12, 5),
                CreatedAtUtc = row.CreatedAtUtc,
                Status = row.Status,
            };
            var response = new SupplierResponse
            {
                SearchId = search.Id,
                SupplierId = row.SupplierId,
                PriceMinor = row.PriceMinor,
                ResponseTimeMs = row.ResponseTimeMs,
                ReceivedAtUtc = row.CreatedAtUtc.AddMilliseconds(row.ResponseTimeMs),
            };
            db.AddRange(search, response);
            await db.SaveChangesAsync(Ct);
            ids[row.Key] = response.Id;
        }
        return ids;
    }

    private static Task<AppDbContext> CreateDbAsync(PriceHuntApiFactory factory) =>
        factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync(Ct);

    private static async Task<HistoryPage> GetPageAsync(PriceHuntApiFactory factory, string query)
    {
        using var client = factory.CreateClient();
        using var response = await client.GetAsync($"/api/history{query}", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<HistoryPage>(JsonSerializerOptions.Web, Ct))!;
    }
}
