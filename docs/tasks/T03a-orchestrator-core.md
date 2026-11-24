# T03a: Search orchestrator, core
**Reqs:** SS1, SS2, SS3, SS4, P2 · **Interpretations:** I1, I2, I3

## Goal
`SearchOrchestrator.RunAsync(SearchRequest, CancellationToken) : IAsyncEnumerable<SearchEvent>`.
It yields events as they happen and ends `Completed` or `TimedOut`. It has no HTTP and no EF dependencies.
Persistence plugs in through `ISearchRecorder` (fake here, real in T04). Caller cancellation and the races around the
last write come in T03b.

## Types (defined here, used unchanged by T03b, T04 and T05a)
```csharp
public record SearchRequest(Guid SearchId, string FromLocation, string ToLocation,
    DateOnly? FromDate, DateOnly? ToDate, IReadOnlyList<string>? SupplierIds);   // nullable so T05b can require them

public enum SearchStatus { Running, Completed, TimedOut, Cancelled }

public abstract record SearchEvent(Guid SearchId);
public record SearchStarted(Guid SearchId, IReadOnlyList<SupplierInfo> Suppliers) : SearchEvent(SearchId);
public record QuoteReceived(Guid SearchId, string SupplierId, decimal Price, long ResponseTimeMs) : SearchEvent(SearchId);
public record SupplierFailed(Guid SearchId, string SupplierId, long ResponseTimeMs) : SearchEvent(SearchId);
public record SearchEnded(Guid SearchId, SearchStatus Status, int Responded, int Total) : SearchEvent(SearchId);

public record SupplierResult(string SupplierId, decimal? Price, long ResponseTimeMs, DateTime ReceivedAtUtc); // Price null = failed

public interface ISearchRecorder {
    Task StartAsync(SearchRequest request, IReadOnlyList<string> supplierIds, DateTime createdAtUtc, CancellationToken ct);
    Task RecordAsync(Guid searchId, SupplierResult result, CancellationToken ct);
    Task FinishAsync(Guid searchId, SearchStatus status, CancellationToken ct);
}
```
- `SupplierInfo(string Id, string Name)` is the catalog's type (T01).
- The dates are nullable only for validation (T05b). Past the endpoint they are always set, and the orchestrator builds `SearchCriteria` from them.
- Empty or null `SupplierIds` means all suppliers. Otherwise the orchestrator filters the registered suppliers by the ids, so the
  selection is in catalog order (T02's fake random sequence relies on it) and a repeated id counts once. `StartAsync` gets this
  resolved list, not `request.SupplierIds`, so `SearchSuppliers` never sees a duplicate key. T05a passes the request through as is.
- The orchestrator measures `ResponseTimeMs` with `TimeProvider.GetElapsedTime` from a timestamp taken after `StartAsync`, right
  before the supplier calls start (a slow start write doesn't count as response time), and sets `ReceivedAtUtc` and `createdAtUtc` from `TimeProvider.GetUtcNow()`.
- Create the timeout CTS first, then await `StartAsync` with `CancellationToken.None`, so the start write (which can wait on the
  recorder's gate, T04) counts toward the 6 s (SS3), and a client that leaves during it still gets a search row (P1, T03b).
- `StartAsync` is awaited before any supplier starts and before the `try/finally`, so response rows always have their search row,
  and a failed start (e.g. a duplicate `searchId`) starts no supplier and writes no status over another search's row.
- The supplier tasks are created right before the `try`, and `started` is yielded inside it: a consumer that stops at `started`
  still runs the `finally` (T03b's I7 test).

## Design (see plan.md, "Concurrency model")
- Timeout CTS = `new CancellationTokenSource(TimeSpan.FromSeconds(6), timeProvider)`, linked with the caller `ct`. Keep track of **which** one fired.
  Don't call `CancelAfter` on the linked CTS: it uses the system clock, so `FakeTimeProvider` can't trigger it.
- One task per supplier. Each task catches **all** exceptions except cancellation of the linked token, and returns one
  `SupplierResult`. The task stamps `ResponseTimeMs` and `ReceivedAtUtc` when the supplier answers, not the loop: a write can wait
  on the recorder's gate (T04), and the stored time must be the time of the answer (P2).
- `RunAsync` marks `ct` with `[EnumeratorCancellation]`, so a token passed through `WithCancellation` by the SSE writer arrives
  (without it, CS8425 fails the `-warnaserror` build).
- One loop over `Task.WhenEach(tasks)` with the linked token takes the results in completion order. Which results it takes and
  which status the search ends with is defined once in plan.md, "Concurrency model", steps 3-4. This section says how to build it.
- C# doesn't allow `yield return` inside a `try` that has a `catch` (CS1626). So enumerate by hand: `GetAsyncEnumerator(linkedToken)`,
  wrap only `MoveNextAsync()` in `try/catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested && !ct.IsCancellationRequested)`
  to end with `TimedOut`, and `yield` outside that `try`. A caller cancellation is not caught (T03b).
- No token check inside the loop: `MoveNextAsync` already throws once the token fired, and returns `false` after the last task
  (plan.md step 3). The tests below and in T03b pin both behaviours.
- For each result: persist it (`CancellationToken.None`), then map it to `QuoteReceived` or `SupplierFailed` and yield it.
  Once persisted, a result is always yielded. Only a price counts toward `responded` (I1), so `ended.responded` always matches
  the DB rows that have a price.
- After the loop, write `Completed` and yield `ended`.
- Pending suppliers are cancelled and produce no event and no record (I3).
- The final status is written once, with `CancellationToken.None`, before `ended` is yielded.
- A `finally` block cancels the linked CTS (otherwise awaiting the hanging supplier never ends) and awaits all supplier tasks.
  Await the supplier tasks with `((Task)Task.WhenAll(tasks)).ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing)`: no fire-and-forget, and their
  cancellations don't hide the original exception. The cast matters: on `Task<T>`, `SuppressThrowing` throws
  `ArgumentOutOfRangeException` (CA2261). T03b adds the `Cancelled` write to this block.
  Cancel with `Cancel()`, not `CancelAsync()`: `Cancel()` runs the suppliers' callbacks before it returns. With `CancelAsync()`
  they run on the thread pool, and the T03b disposal test no longer fails when the `finally` skips the await (checked in a spike).

## Acceptance criteria
- No `async void`, `.Result`, `.Wait()`, or fire-and-forget `Task.Run`.
- Every recorder write, `StartAsync` included, uses `CancellationToken.None`.

## Tests (component: FakeTimeProvider, fake suppliers backed by controllable TaskCompletionSource)
These fakes are shared with T03b.
- Fake suppliers cancel their TCS when `ct` fires (`ct.Register(() => tcs.TrySetCanceled(ct))`), otherwise the `finally` waits forever.
  Test TCSs use the default options, without `RunContinuationsAsynchronously`, so a completed fake is queued in `Task.WhenEach`
  before `TrySetResult` returns.
- The fake recorder calls `ct.ThrowIfCancellationRequested()` on entry to every method and again after the test's hook ran (the hook
  may advance time or cancel the caller's CTS), as EF does. A write that gets the caller's or the linked token instead of
  `CancellationToken.None` then fails the tests here and in T03b.
- The fake recorder and the fake suppliers append to one call log. When a test reads a `QuoteReceived` or `SupplierFailed`, the log
  already has that supplier's `RecordAsync` (persist, then yield). When it reads `Ended`, the `FinishAsync` calls are exactly
  `[that status]` (written before `ended`, and only once).

These tests pin exact timing. Behaviour visible over HTTP is tested again in T05a.
A test that checks `ResponseTimeMs` advances exactly to that supplier's completion (see `AGENTS.md` on `Advance`).
- SS2: events are yielded in completion order, before the remaining suppliers finish.
- P2: the stored time is the time of the answer. The fake recorder holds A's `RecordAsync` until the test releases it.
  B answers at 1.2 s while A's write is held, the test advances to 1.5 s and then releases A → B's `RecordAsync` gets
  `ResponseTimeMs = 1200` and `ReceivedAtUtc` = start + 1.2 s, not 1.5 s.
- SS4, I1: one supplier throws → the others still deliver, a `SupplierFailed` event is emitted, and `responded` doesn't count it.
- I1: every supplier throws → `Ended(Completed)` with `responded: 0`.
- SS3, I1, I2, I3: hanging supplier + 6 s elapsed → `Ended(TimedOut)` with the results collected so far, `responded` counts the quotes only,
  the hanging task observed cancellation, and there is no `RecordAsync` for it.
- SS3: all suppliers done before 6 s → `Ended(Completed)`.
- SS1: only the selected suppliers are queried, in catalog order, and a repeated id starts one call; `StartAsync` and
  `SearchStarted.Suppliers` get the same distinct list.
- `started` is yielded only after every supplier's call has been started (needed so integration tests can advance time safely),
  and the call log has `StartAsync` before the first supplier call.
- SS3: the start write counts toward the 6 s. The fake recorder advances 5 s inside `StartAsync`. After `started` the test
  advances 1 s, then completes A's TCS with `TrySetResult` (the timeout already cancelled it) → `Ended(TimedOut)` with `responded: 0` and no `RecordAsync`. If the CTS were created
  after `StartAsync`, A would be yielded and the search would end `Completed`.
- P2: the fake recorder advances 2 s inside `StartAsync`, A answers 1 s after `started` → `ResponseTimeMs = 1000`.
- `StartAsync` throws (e.g. a duplicate `searchId`) → the exception reaches the caller, no supplier was called, and there are no
  `FinishAsync` calls.
