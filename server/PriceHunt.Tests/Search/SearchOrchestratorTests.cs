using Microsoft.Extensions.Time.Testing;
using PriceHunt.Api.Search;
using PriceHunt.Api.Suppliers;

namespace PriceHunt.Tests.Search;

public class SearchOrchestratorTests
{
    private static readonly Guid SearchId = Guid.NewGuid();

    private readonly FakeTimeProvider _time = new();
    private readonly CallLog _log = new();
    private readonly FakeSearchRecorder _recorder;
    private readonly DateTime _t0;

    public SearchOrchestratorTests()
    {
        _recorder = new FakeSearchRecorder(_log);
        _t0 = _time.GetUtcNow().UtcDateTime;
    }

    private FakeSupplier[] Suppliers(params string[] ids) => [.. ids.Select(id => new FakeSupplier(id, _log))];

    private static readonly SearchRequest Request =
        new(SearchId, "Berlin", "Paris", new DateOnly(2026, 12, 1), new DateOnly(2026, 12, 5), SupplierIds: null);

    private IAsyncEnumerator<SearchEvent> Start(FakeSupplier[] suppliers, IReadOnlyList<string>? supplierIds = null) =>
        Start(suppliers, Request with { SupplierIds = supplierIds });

    private IAsyncEnumerator<SearchEvent> Start(FakeSupplier[] suppliers, SearchRequest request) =>
        Run(suppliers, request, TestContext.Current.CancellationToken);

    // For tests that play the caller and cancel its token themselves.
    private IAsyncEnumerator<SearchEvent> Start(FakeSupplier[] suppliers, CancellationToken callerToken) =>
        Run(suppliers, Request, callerToken);

    private IAsyncEnumerator<SearchEvent> Run(FakeSupplier[] suppliers, SearchRequest request, CancellationToken ct)
    {
        var orchestrator = new SearchOrchestrator(suppliers, _recorder, _time);
        return orchestrator.RunAsync(request, ct).GetAsyncEnumerator(ct);
    }

    private static async Task AssertCallerCancellationPropagates(IAsyncEnumerator<SearchEvent> events) =>
        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () => await events.MoveNextAsync());

    // Reads the next event and checks what holds whenever such an event is read: a result was persisted before
    // it was yielded, and the final status was written exactly once, before `ended`.
    private async Task<T> Next<T>(IAsyncEnumerator<SearchEvent> events) where T : SearchEvent
    {
        Assert.True(await events.MoveNextAsync());
        var e = Assert.IsType<T>(events.Current);
        Assert.Equal(SearchId, e.SearchId);
        switch (e)
        {
            case QuoteReceived quote:
                Assert.Contains($"record:{quote.SupplierId}", _log.Entries);
                break;
            case SupplierFailed failed:
                Assert.Contains($"record:{failed.SupplierId}", _log.Entries);
                break;
            case SearchEnded ended:
                Assert.Equal([ended.Status], _recorder.Statuses);
                break;
        }
        return e;
    }

    private async Task AssertEnded(IAsyncEnumerator<SearchEvent> events, SearchStatus status, int responded, int total)
    {
        Assert.Equal(new SearchEnded(SearchId, status, responded, total), await Next<SearchEnded>(events));
        Assert.False(await events.MoveNextAsync());
        Assert.Equal([status], _recorder.Statuses); // the finally ran and wrote nothing more
    }

    // Ends a search whose suppliers never answered, so no test leaves one running.
    private async Task EndByTimeout(IAsyncEnumerator<SearchEvent> events)
    {
        _time.Advance(TimeSpan.FromSeconds(6));
        Assert.Equal(SearchStatus.TimedOut, (await Next<SearchEnded>(events)).Status);
    }

    [Fact]
    public async Task SS2_EventsAreYieldedInCompletionOrder_BeforeTheOthersFinish()
    {
        var suppliers = Suppliers("a", "b", "c");
        var (a, b, c) = (suppliers[0], suppliers[1], suppliers[2]);
        await using var events = Start(suppliers);
        await Next<SearchStarted>(events);

        _time.Advance(TimeSpan.FromSeconds(1));
        c.Answer(30m);
        Assert.Equal(new QuoteReceived(SearchId, "c", 30m, 1000), await Next<QuoteReceived>(events));

        _time.Advance(TimeSpan.FromSeconds(1));
        a.Answer(10m);
        Assert.Equal(new QuoteReceived(SearchId, "a", 10m, 2000), await Next<QuoteReceived>(events));

        _time.Advance(TimeSpan.FromSeconds(1));
        b.Answer(20m);
        Assert.Equal(new QuoteReceived(SearchId, "b", 20m, 3000), await Next<QuoteReceived>(events));

        await AssertEnded(events, SearchStatus.Completed, responded: 3, total: 3);
    }

    [Fact]
    public async Task P2_StoredTimeIsTheTimeOfTheAnswer_NotOfTheWrite()
    {
        var suppliers = Suppliers("a", "b");
        var (a, b) = (suppliers[0], suppliers[1]);
        var releaseA = new TaskCompletionSource();
        _recorder.OnRecord = result => result.SupplierId == "a" ? releaseA.Task : Task.CompletedTask;
        await using var events = Start(suppliers);
        await Next<SearchStarted>(events);

        var quoteA = events.MoveNextAsync().AsTask();
        _time.Advance(TimeSpan.FromSeconds(1));
        a.Answer(10m); // A's write is now held
        _time.Advance(TimeSpan.FromMilliseconds(200));
        b.Answer(20m);
        _time.Advance(TimeSpan.FromMilliseconds(300));
        releaseA.SetResult();

        Assert.True(await quoteA);
        Assert.Equal(new QuoteReceived(SearchId, "a", 10m, 1000), events.Current);
        Assert.Equal(new QuoteReceived(SearchId, "b", 20m, 1200), await Next<QuoteReceived>(events));
        Assert.Equal(new SupplierResult("b", 20m, 1200, _t0.AddMilliseconds(1200)), _recorder.Results[1]);
        await AssertEnded(events, SearchStatus.Completed, responded: 2, total: 2);
    }

    [Fact]
    public async Task SS4_I1_OneSupplierThrows_TheOthersStillDeliver_AndAFailureIsEmitted()
    {
        var suppliers = Suppliers("a", "b");
        var (a, b) = (suppliers[0], suppliers[1]);
        await using var events = Start(suppliers);
        await Next<SearchStarted>(events);

        _time.Advance(TimeSpan.FromSeconds(1));
        a.Fail(new InvalidOperationException("boom"));
        Assert.Equal(new SupplierFailed(SearchId, "a", 1000), await Next<SupplierFailed>(events));
        Assert.Equal(new SupplierResult("a", null, 1000, _t0.AddSeconds(1)), _recorder.Results[0]);

        _time.Advance(TimeSpan.FromSeconds(1));
        b.Answer(20m);
        Assert.Equal(new QuoteReceived(SearchId, "b", 20m, 2000), await Next<QuoteReceived>(events));

        await AssertEnded(events, SearchStatus.Completed, responded: 1, total: 2);
    }

    [Fact]
    public async Task SS4_I1_ASupplierCancellingOnItsOwn_IsAFailure_NotTheEndOfTheSearch()
    {
        // E.g. an HTTP client timeout inside the supplier: an OperationCanceledException while the search's token is live.
        var suppliers = Suppliers("a", "b");
        await using var events = Start(suppliers);
        await Next<SearchStarted>(events);

        _time.Advance(TimeSpan.FromSeconds(1));
        suppliers[0].Fail(new OperationCanceledException());
        Assert.Equal(new SupplierFailed(SearchId, "a", 1000), await Next<SupplierFailed>(events));

        suppliers[1].Answer(20m);
        await Next<QuoteReceived>(events);

        await AssertEnded(events, SearchStatus.Completed, responded: 1, total: 2);
    }

    [Fact]
    public async Task I1_EverySupplierFails_EndsCompletedWithNoneResponded()
    {
        var suppliers = Suppliers("a", "b");
        await using var events = Start(suppliers);
        await Next<SearchStarted>(events);

        suppliers[0].Fail(new SupplierUnavailableException("a"));
        await Next<SupplierFailed>(events);
        suppliers[1].Fail(new SupplierUnavailableException("b"));
        await Next<SupplierFailed>(events);

        await AssertEnded(events, SearchStatus.Completed, responded: 0, total: 2);
    }

    [Fact]
    public async Task SS3_I1_I2_I3_HangingSupplier_EndsTimedOutAtSixSeconds_WithWhatWasCollected()
    {
        var suppliers = Suppliers("a", "b", "hanging");
        var (a, b, hanging) = (suppliers[0], suppliers[1], suppliers[2]);
        await using var events = Start(suppliers);
        await Next<SearchStarted>(events);

        _time.Advance(TimeSpan.FromSeconds(1));
        a.Answer(10m);
        await Next<QuoteReceived>(events);

        _time.Advance(TimeSpan.FromSeconds(1));
        b.Fail(new SupplierUnavailableException("b"));
        await Next<SupplierFailed>(events);

        _time.Advance(TimeSpan.FromSeconds(4));
        await AssertEnded(events, SearchStatus.TimedOut, responded: 1, total: 3);
        Assert.True(hanging.WasCancelled);
        Assert.Equal(["a", "b"], _recorder.Results.Select(r => r.SupplierId));
    }

    [Fact]
    public async Task SS3_AllSuppliersDoneBeforeSixSeconds_EndsCompleted()
    {
        var suppliers = Suppliers("a", "b");
        await using var events = Start(suppliers);
        await Next<SearchStarted>(events);

        _time.Advance(TimeSpan.FromMilliseconds(5999));
        suppliers[0].Answer(10m);
        await Next<QuoteReceived>(events);
        suppliers[1].Answer(20m);
        await Next<QuoteReceived>(events);

        await AssertEnded(events, SearchStatus.Completed, responded: 2, total: 2);
    }

    [Fact]
    public async Task SS1_OnlySelectedSuppliersAreQueried_InCatalogOrder_EachOnce()
    {
        await using var events = Start(Suppliers("a", "b", "c"), supplierIds: ["c", "a", "c"]);

        var started = await Next<SearchStarted>(events);

        Assert.Equal([new SupplierInfo("a", "Supplier a"), new SupplierInfo("c", "Supplier c")], started.Suppliers);
        Assert.Equal(["a", "c"], _recorder.StartedSupplierIds);
        Assert.Equal(["start", "call:a", "call:c"], _log.Entries);
        await EndByTimeout(events);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task SS1_NoSelection_QueriesAllSuppliers(bool emptyList)
    {
        await using var events = Start(Suppliers("a", "b", "c"), supplierIds: emptyList ? [] : null);

        var started = await Next<SearchStarted>(events);

        Assert.Equal(["a", "b", "c"], started.Suppliers.Select(s => s.Id));
        Assert.Equal(["a", "b", "c"], _recorder.StartedSupplierIds);
        await EndByTimeout(events);
    }

    [Fact]
    public async Task Started_IsYieldedAfterTheStartWriteAndEverySupplierCall()
    {
        await using var events = Start(Suppliers("a", "b", "c"));

        await Next<SearchStarted>(events);

        Assert.Equal(["start", "call:a", "call:b", "call:c"], _log.Entries);
        Assert.Equal(_t0, _recorder.CreatedAtUtc);
        await EndByTimeout(events);
    }

    [Fact]
    public async Task SS3_TheStartWriteCountsTowardTheSixSeconds()
    {
        var a = Suppliers("a")[0];
        _recorder.OnStart = () => _time.Advance(TimeSpan.FromSeconds(5));
        await using var events = Start([a]);
        await Next<SearchStarted>(events);

        _time.Advance(TimeSpan.FromSeconds(1));
        a.Answer(10m); // too late: the timeout already cancelled the call

        await AssertEnded(events, SearchStatus.TimedOut, responded: 0, total: 1);
        Assert.Empty(_recorder.Results);
    }

    [Fact]
    public async Task P2_TheStartWriteDoesNotCountAsResponseTime()
    {
        var a = Suppliers("a")[0];
        _recorder.OnStart = () => _time.Advance(TimeSpan.FromSeconds(2));
        await using var events = Start([a]);
        await Next<SearchStarted>(events);

        _time.Advance(TimeSpan.FromSeconds(1));
        a.Answer(10m);

        Assert.Equal(new QuoteReceived(SearchId, "a", 10m, 1000), await Next<QuoteReceived>(events));
        Assert.Equal(_t0, _recorder.CreatedAtUtc);
        Assert.Equal(DateTimeKind.Utc, _recorder.CreatedAtUtc?.Kind);
        Assert.Equal(_t0.AddSeconds(3), _recorder.Results[0].ReceivedAtUtc);
        Assert.Equal(DateTimeKind.Utc, _recorder.Results[0].ReceivedAtUtc.Kind);
        await AssertEnded(events, SearchStatus.Completed, responded: 1, total: 1);
    }

    [Fact]
    public async Task SS3_AStartWriteThatOutlastsTheDeadline_StillCompletes_AndTheSearchEndsTimedOut()
    {
        // The fake recorder throws if its token fired, so a start write with the linked token fails here.
        _recorder.OnStart = () => _time.Advance(TimeSpan.FromSeconds(6));
        await using var events = Start(Suppliers("a"));

        await Next<SearchStarted>(events);

        await AssertEnded(events, SearchStatus.TimedOut, responded: 0, total: 1);
        Assert.Empty(_recorder.Results);
    }

    [Fact]
    public async Task StartWriteFails_TheErrorReachesTheCaller_AndNoSupplierIsCalled()
    {
        _recorder.OnStart = () => throw new InvalidOperationException("duplicate search id");
        await using var events = Start(Suppliers("a", "b"));

        await Assert.ThrowsAsync<InvalidOperationException>(async () => await events.MoveNextAsync());

        Assert.Empty(_log.Entries);
        Assert.Empty(_recorder.Statuses);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task MissingDate_IsRejectedBeforeAnythingIsWritten(bool missingFromDate)
    {
        var request = missingFromDate ? Request with { FromDate = null } : Request with { ToDate = null };
        await using var events = Start(Suppliers("a"), request);

        await Assert.ThrowsAsync<ArgumentException>(async () => await events.MoveNextAsync());

        Assert.Empty(_log.Entries);
    }

    [Fact]
    public async Task SS5_I7_CallerCancels_EndsCancelled_AndEverySupplierObservedIt()
    {
        using var caller = new CancellationTokenSource();
        var suppliers = Suppliers("a", "b");
        await using var events = Start(suppliers, caller.Token);
        await Next<SearchStarted>(events);

        caller.Cancel();

        // Checked before awaiting: if the cancellation didn't reach the suppliers, MoveNextAsync would never return.
        Assert.All(suppliers, s => Assert.True(s.WasCancelled));
        await AssertCallerCancellationPropagates(events);
        Assert.Equal([SearchStatus.Cancelled], _recorder.Statuses);
    }

    [Fact]
    public async Task P1_SS5_I7_CallerLeavesDuringTheStartWrite_TheSearchIsStillRecorded_AndEndsCancelled()
    {
        // The fake recorder throws if its token fired, so a start write with the caller's or the linked token fails here.
        using var caller = new CancellationTokenSource();
        _recorder.OnStart = () =>
        {
            _time.Advance(TimeSpan.FromSeconds(6));
            caller.Cancel();
        };
        await using var events = Start(Suppliers("a"), caller.Token);

        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () =>
        {
            while (await events.MoveNextAsync()) { }
        });

        Assert.Contains("start", _log.Entries);
        Assert.Equal([SearchStatus.Cancelled], _recorder.Statuses);
    }

    [Fact]
    public async Task SS5_I7_CallerCancelsDuringTheLastWrite_TheResultIsYielded_ThenTheSearchEndsCancelled()
    {
        using var caller = new CancellationTokenSource();
        var suppliers = Suppliers("a", "b");
        _recorder.OnRecord = result =>
        {
            if (result.SupplierId == "b")
                caller.Cancel();
            return Task.CompletedTask;
        };
        await using var events = Start(suppliers, caller.Token);
        await Next<SearchStarted>(events);
        suppliers[0].Answer(10m);
        await Next<QuoteReceived>(events);

        suppliers[1].Answer(20m);

        Assert.Equal("b", (await Next<QuoteReceived>(events)).SupplierId);
        await AssertCallerCancellationPropagates(events);
        Assert.Equal([SearchStatus.Cancelled], _recorder.Statuses);
    }

    [Fact]
    public async Task SS5_I7_TimeoutAndCallerBothFireDuringAWrite_EndsCancelled()
    {
        using var caller = new CancellationTokenSource();
        var suppliers = Suppliers("a", "b");
        _recorder.OnRecord = _ =>
        {
            _time.Advance(TimeSpan.FromSeconds(6));
            caller.Cancel();
            return Task.CompletedTask;
        };
        await using var events = Start(suppliers, caller.Token);
        await Next<SearchStarted>(events);

        suppliers[0].Answer(10m);

        Assert.Equal("a", (await Next<QuoteReceived>(events)).SupplierId);
        await AssertCallerCancellationPropagates(events);
        Assert.Equal([SearchStatus.Cancelled], _recorder.Statuses);
    }

    [Fact]
    public async Task SS3_I3_DeadlinePassesDuringAWrite_AnotherSupplierPending_ResultIsKept_AndEndsTimedOut()
    {
        var suppliers = Suppliers("a", "b");
        _recorder.OnRecord = _ =>
        {
            _time.Advance(TimeSpan.FromSeconds(6));
            return Task.CompletedTask;
        };
        await using var events = Start(suppliers);
        await Next<SearchStarted>(events);

        suppliers[0].Answer(10m);

        Assert.Equal("a", (await Next<QuoteReceived>(events)).SupplierId);
        await AssertEnded(events, SearchStatus.TimedOut, responded: 1, total: 2);
        Assert.Single(_recorder.Results);
    }

    [Fact]
    public async Task SS3_I3_DeadlinePassesDuringTheLastWrite_ResultIsKept_AndEndsCompleted()
    {
        var suppliers = Suppliers("a", "b");
        _recorder.OnRecord = result =>
        {
            if (result.SupplierId == "b")
                _time.Advance(TimeSpan.FromSeconds(6));
            return Task.CompletedTask;
        };
        await using var events = Start(suppliers);
        await Next<SearchStarted>(events);
        suppliers[0].Answer(10m);
        await Next<QuoteReceived>(events);

        suppliers[1].Answer(20m);

        Assert.Equal("b", (await Next<QuoteReceived>(events)).SupplierId);
        await AssertEnded(events, SearchStatus.Completed, responded: 2, total: 2);
        Assert.Equal(2, _recorder.Results.Count);
    }

    [Fact]
    public async Task SS3_I1_I3_AResultQueuedBehindAWrite_IsDroppedWhenTheDeadlinePasses()
    {
        var suppliers = Suppliers("a", "b");
        var (a, b) = (suppliers[0], suppliers[1]);
        _recorder.OnRecord = result =>
        {
            if (result.SupplierId == "a")
            {
                b.Answer(20m); // in time, but the loop is still saving A
                _time.Advance(TimeSpan.FromSeconds(6));
            }
            return Task.CompletedTask;
        };
        await using var events = Start(suppliers);
        await Next<SearchStarted>(events);

        a.Answer(10m);

        Assert.Equal("a", (await Next<QuoteReceived>(events)).SupplierId);
        await AssertEnded(events, SearchStatus.TimedOut, responded: 1, total: 2);
        Assert.Equal(["a"], _recorder.Results.Select(r => r.SupplierId));
    }

    [Fact]
    public async Task SS3_I3_AResultAfterTheDeadline_IsNotYieldedOrRecorded()
    {
        var a = new FakeSupplier("a", _log);
        var late = new FakeSupplier("late", _log, ignoresCancellation: true);
        // No await using: if an assertion failed before `late` answers, disposal would wait for it forever.
        // AssertEnded runs the enumerator to its end, finally included.
        var events = Start([a, late]);
        await Next<SearchStarted>(events);
        a.Answer(10m);
        await Next<QuoteReceived>(events);

        _time.Advance(TimeSpan.FromSeconds(6));
        late.Answer(20m);

        await AssertEnded(events, SearchStatus.TimedOut, responded: 1, total: 2);
        Assert.Equal(["a"], _recorder.Results.Select(r => r.SupplierId));
    }

    [Fact]
    public async Task I7_ConsumerStopsEarlyWithoutCancelling_SuppliersAreCancelledAndAwaited_AndTheSearchEndsCancelled()
    {
        var a = new FakeSupplier("a", _log);
        var slow = new FakeSupplier("slow", _log, ignoresCancellation: true);
        var events = Start([a, slow]);
        await Next<SearchStarted>(events);

        var disposal = events.DisposeAsync().AsTask();

        Assert.False(disposal.IsCompleted); // the finally waits for the slow supplier to end
        Assert.True(a.WasCancelled);
        Assert.True(slow.WasCancelled);
        slow.Answer(20m);
        await disposal;
        Assert.Empty(_recorder.Results);
        Assert.Equal([SearchStatus.Cancelled], _recorder.Statuses);
    }
}
