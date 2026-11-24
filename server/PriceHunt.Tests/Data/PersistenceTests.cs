using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PriceHunt.Api.Data;
using PriceHunt.Api.Search;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Tests.Data;

public class PersistenceTests
{
    private static readonly TimeSpan HarborDelay = TimeSpan.FromSeconds(1.0625);
    private static readonly TimeSpan GraniteDelay = TimeSpan.FromSeconds(2.1875);

    private static readonly SearchRequest Request =
        new(Guid.NewGuid(), "Berlin", "Paris", new DateOnly(2026, 12, 1), new DateOnly(2026, 12, 5), SupplierIds: null);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task P3_Migrations_CreateEveryTableOnAnEmptyDatabase()
    {
        await using var factory = new PriceHuntApiFactory();
        await using var db = await CreateDbAsync(factory);

        Assert.NotEmpty(await db.Database.GetAppliedMigrationsAsync(Ct));
        Assert.Empty(await db.Database.GetPendingMigrationsAsync(Ct));
        var tables = await SqliteMasterNamesAsync(db, "table");
        Assert.Superset(new HashSet<string> { "Suppliers", "Searches", "SearchSuppliers", "SupplierResponses" }, tables.ToHashSet());
        Assert.Contains("IX_Searches_CreatedAtUtc", await SqliteMasterNamesAsync(db, "index"));
        var suppliers = await db.Suppliers.Select(s => new { s.Id, s.Name }).ToListAsync(Ct);
        Assert.Equal(
            SupplierCatalog.All.Select(s => new { s.Id, s.Name }).OrderBy(s => s.Id),
            suppliers.OrderBy(s => s.Id));
    }

    [Fact]
    public async Task P1_P2_I3_FullSearch_PersistsSearchAndOneRowPerAnsweredSupplier()
    {
        await using var factory = new PriceHuntApiFactory();

        await RunFullSearchAsync(factory);

        await using var db = await CreateDbAsync(factory);
        var search = await db.Searches.SingleAsync(Ct);
        Assert.Equal(
            (Request.SearchId, "Berlin", "Paris", new DateOnly(2026, 12, 1), new DateOnly(2026, 12, 5), SearchStatus.TimedOut),
            (search.Id, search.FromLocation, search.ToLocation, search.FromDate, search.ToDate, search.Status));
        var selected = await db.SearchSuppliers.Where(ss => ss.SearchId == search.Id).Select(ss => ss.SupplierId).ToListAsync(Ct);
        Assert.Equal(SupplierCatalog.All.Select(s => s.Id).Order(), selected.Order());

        var responses = await db.SupplierResponses
            .Where(r => r.SearchId == search.Id)
            .Select(r => new { r.SupplierId, r.PriceMinor })
            .ToListAsync(Ct);
        // Lantern never answered, so it has no row (I3).
        var expected = new[]
        {
            new { SupplierId = "comet", PriceMinor = (long?)16250 },
            new { SupplierId = "granite", PriceMinor = (long?)null },
            new { SupplierId = "harbor", PriceMinor = (long?)44375 },
            new { SupplierId = "maple", PriceMinor = (long?)38750 },
            new { SupplierId = "nimbus", PriceMinor = (long?)10625 },
            new { SupplierId = "pelican", PriceMinor = (long?)27500 },
        };
        Assert.Equal(expected, responses.OrderBy(r => r.SupplierId));
    }

    [Fact]
    public async Task P1_I2_SubsetWithoutTheHangingSupplier_StoresOnlyTheSelectedSuppliers_AndEndsCompleted()
    {
        await using var factory = new PriceHuntApiFactory();
        // Values are drawn per selected supplier in catalog order: comet takes pelican's (2.75 s), harbor comet's (1.625 s).
        var request = Request with { SupplierIds = ["harbor", "comet"] };
        await using var events = Orchestrator(factory).RunAsync(request, Ct).GetAsyncEnumerator(Ct);
        await NextAsync<SearchStarted>(events);
        factory.Time.Advance(TimeSpan.FromSeconds(1.625));
        Assert.Equal("harbor", (await NextAsync<QuoteReceived>(events)).SupplierId);
        factory.Time.Advance(TimeSpan.FromSeconds(1.125));
        Assert.Equal("comet", (await NextAsync<QuoteReceived>(events)).SupplierId);
        Assert.Equal(SearchStatus.Completed, (await NextAsync<SearchEnded>(events)).Status);

        await using var db = await CreateDbAsync(factory);
        Assert.Equal(SearchStatus.Completed, (await db.Searches.SingleAsync(Ct)).Status);
        var selected = await db.SearchSuppliers.Select(ss => ss.SupplierId).ToListAsync(Ct);
        Assert.Equal(["comet", "harbor"], selected.Order());
    }

    [Fact]
    public async Task P2_Failure_IsStoredWithNullPriceAndItsResponseTime()
    {
        await using var factory = new PriceHuntApiFactory();

        await RunFullSearchAsync(factory);

        await using var db = await CreateDbAsync(factory);
        var failure = await db.SupplierResponses.SingleAsync(r => r.SupplierId == "granite", Ct);
        Assert.Null(failure.PriceMinor);
        Assert.Equal((long)GraniteDelay.TotalMilliseconds, failure.ResponseTimeMs);
    }

    [Fact]
    public async Task P1_P2_DuringSearch_RowIsRunningAndAResponseIsStoredBeforeItIsStreamed()
    {
        await using var factory = new PriceHuntApiFactory();
        await using var events = Orchestrator(factory).RunAsync(Request, Ct).GetAsyncEnumerator(Ct);
        await NextAsync<SearchStarted>(events);

        await using (var db = await CreateDbAsync(factory))
            Assert.Equal(SearchStatus.Running, (await db.Searches.SingleAsync(Ct)).Status);

        factory.Time.Advance(HarborDelay);
        Assert.Equal("harbor", (await NextAsync<QuoteReceived>(events)).SupplierId);
        await using (var db = await CreateDbAsync(factory))
        {
            Assert.Equal(SearchStatus.Running, (await db.Searches.SingleAsync(Ct)).Status);
            Assert.Equal(["harbor"], await db.SupplierResponses.Select(r => r.SupplierId).ToListAsync(Ct));
        }

        // Run to the deadline, so the search ends before the factory is disposed.
        factory.Time.Advance(TimeSpan.FromSeconds(5) - HarborDelay);
        for (var i = 0; i < 5; i++)
            Assert.True(await events.MoveNextAsync());
        factory.Time.Advance(TimeSpan.FromSeconds(1));
        Assert.Equal(SearchStatus.TimedOut, (await NextAsync<SearchEnded>(events)).Status);
    }

    [Fact]
    public async Task I7_CallerCancelsMidSearch_StatusIsCancelledAndPendingSuppliersHaveNoRows()
    {
        await using var factory = new PriceHuntApiFactory();
        using var caller = CancellationTokenSource.CreateLinkedTokenSource(Ct);
        await using var events = Orchestrator(factory).RunAsync(Request, caller.Token).GetAsyncEnumerator(caller.Token);
        await NextAsync<SearchStarted>(events);
        factory.Time.Advance(HarborDelay);
        Assert.Equal("harbor", (await NextAsync<QuoteReceived>(events)).SupplierId);

        caller.Cancel();

        // The orchestrator's finally has written the status by the time the exception reaches the caller.
        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () => await events.MoveNextAsync());
        await using var db = await CreateDbAsync(factory);
        Assert.Equal(SearchStatus.Cancelled, (await db.Searches.SingleAsync(Ct)).Status);
        Assert.Equal(["harbor"], await db.SupplierResponses.Select(r => r.SupplierId).ToListAsync(Ct));
    }

    [Fact]
    public async Task P1_P2_TimesReadBack_AreTheUtcTimesThatWereWritten()
    {
        await using var factory = new PriceHuntApiFactory();
        var startedAt = factory.Time.GetUtcNow().UtcDateTime;

        await RunFullSearchAsync(factory);

        // A new context, so the values go through the converter. Both checks are needed: DateTime equality ignores Kind,
        // and ToUniversalTime() also returns Utc but shifts the value by the machine's offset (CI sets TZ for this).
        await using var db = await CreateDbAsync(factory);
        var search = await db.Searches.SingleAsync(Ct);
        Assert.Equal(startedAt, search.CreatedAtUtc);
        Assert.Equal(DateTimeKind.Utc, search.CreatedAtUtc.Kind);
        var failure = await db.SupplierResponses.SingleAsync(r => r.SupplierId == "granite", Ct);
        Assert.Equal(startedAt + GraniteDelay, failure.ReceivedAtUtc);
        Assert.Equal(DateTimeKind.Utc, failure.ReceivedAtUtc.Kind);
    }

    private static SearchOrchestrator Orchestrator(PriceHuntApiFactory factory) =>
        factory.Services.GetRequiredService<SearchOrchestrator>();

    private static Task<AppDbContext> CreateDbAsync(PriceHuntApiFactory factory) =>
        factory.Services.GetRequiredService<IDbContextFactory<AppDbContext>>().CreateDbContextAsync(Ct);

    private static Task<List<string>> SqliteMasterNamesAsync(AppDbContext db, string type) =>
        db.Database.SqlQuery<string>($"SELECT name AS Value FROM sqlite_master WHERE type = {type}").ToListAsync(Ct);

    private static async Task<T> NextAsync<T>(IAsyncEnumerator<SearchEvent> events) where T : SearchEvent
    {
        Assert.True(await events.MoveNextAsync());
        return Assert.IsType<T>(events.Current);
    }

    // All 7 suppliers. Stops at granite's delay so its response time is exact, then runs to the 6 s deadline.
    // Delays in order: harbor, comet, granite, then pelican, nimbus, maple (all under 5 s). Lantern hangs.
    private static async Task RunFullSearchAsync(PriceHuntApiFactory factory)
    {
        await using var events = Orchestrator(factory).RunAsync(Request, Ct).GetAsyncEnumerator(Ct);
        await NextAsync<SearchStarted>(events);

        factory.Time.Advance(GraniteDelay);
        await NextAsync<QuoteReceived>(events);
        await NextAsync<QuoteReceived>(events);
        await NextAsync<SupplierFailed>(events);

        factory.Time.Advance(TimeSpan.FromSeconds(5) - GraniteDelay);
        for (var i = 0; i < 3; i++)
            await NextAsync<QuoteReceived>(events);

        factory.Time.Advance(TimeSpan.FromSeconds(1));
        Assert.Equal(SearchStatus.TimedOut, (await NextAsync<SearchEnded>(events)).Status);
        Assert.False(await events.MoveNextAsync());
    }
}
