# T03: Search orchestrator
**Reqs:** SS1, SS2, SS3, SS4, SS5 · **Interpretations:** I1, I2, I3, I7

## Goal
`SearchOrchestrator.RunAsync(SearchRequest, CancellationToken) : IAsyncEnumerable<SearchEvent>`.
It yields events as they happen and finishes with exactly one terminal outcome. It has no HTTP and no EF dependencies.
Persistence plugs in through `ISearchRecorder` (fake here, real in T04).

## Types (defined here, used unchanged by T04 and T05a)
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
- `SupplierInfo(string Id, string Name)` comes from the catalog (T01).
- The dates are nullable only for validation (T05b). Past the endpoint they are always set, and the orchestrator builds `SearchCriteria` from them.
- Empty or null `SupplierIds` means all suppliers. Otherwise the orchestrator filters the registered suppliers by the ids, so the
  selection is in catalog order (T02's fake random sequence relies on it) and a repeated id counts once. `StartAsync` gets this
  resolved list, not `request.SupplierIds`, so `SearchSuppliers` never sees a duplicate key. T05a passes the request through as is.
- The orchestrator measures `ResponseTimeMs` with `TimeProvider.GetElapsedTime` and sets `ReceivedAtUtc` and `createdAtUtc` from `TimeProvider.GetUtcNow()`.
- `StartAsync` is awaited before any supplier starts and before the `try/finally`, so response rows always have their search row,
  and a failed start (e.g. a duplicate `searchId`) starts no supplier and writes no status over another search's row.

## Design (see plan.md, "Concurrency model")
- Timeout CTS = `new CancellationTokenSource(TimeSpan.FromSeconds(6), timeProvider)`, linked with the caller `ct`. Keep track of **which** one fired.
  Don't call `CancelAfter` on the linked CTS: it uses the system clock, so `FakeTimeProvider` can't trigger it.
- One task per supplier. Each task catches **all** exceptions except cancellation of the linked token, and returns one event.
- `RunAsync` marks `ct` with `[EnumeratorCancellation]`, so a token passed through `WithCancellation` by the SSE writer arrives
  (without it, CS8425 fails the `-warnaserror` build).
- One loop over `Task.WhenEach(tasks)` with the linked token yields events in completion order. Which results it takes and
  which status the search ends with is defined once in plan.md, "Concurrency model", steps 3-4. This section says how to build it.
- C# doesn't allow `yield return` inside a `try` that has a `catch` (CS1626). So enumerate by hand: `GetAsyncEnumerator(linkedToken)`,
  wrap only `MoveNextAsync()` in `try/catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested && !ct.IsCancellationRequested)`
  to end with `TimedOut`, and `yield` outside that `try`. A caller cancellation is not caught: it propagates after the final write.
- No token check inside the loop: `MoveNextAsync` already throws once the token fired, and returns `false` after the last task
  (plan.md step 3). The tests below pin both behaviours.
- For each task: persist it (`CancellationToken.None`), then yield it. Once persisted, a result is always yielded and
  counted, so the DB rows always match `ended.responded`.
- After the loop, call `ct.ThrowIfCancellationRequested()` on the caller's token, then write `Completed` and yield `ended`.
  This check turns a caller cancellation during the last write into `Cancelled` (I7). Use `ct`, not the linked token:
  a timeout during the last write ends `Completed` (plan.md step 4).
- Pending suppliers are cancelled and produce no event and no record (I3).
- The final status is written once, with `CancellationToken.None`.
- A `finally` block covers a consumer that stops enumerating early. It cancels the linked CTS (otherwise awaiting the hanging supplier
  never ends), awaits all supplier tasks, and writes `Cancelled` if no status was written yet.
  Await them with `((Task)Task.WhenAll(tasks)).ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing)`: no fire-and-forget, and their
  cancellations don't hide the original exception. The cast matters: on `Task<T>`, `SuppressThrowing` throws
  `ArgumentOutOfRangeException` (CA2261).

## Acceptance criteria
- No `async void`, `.Result`, `.Wait()`, or fire-and-forget `Task.Run`.
- The final recorder call uses `CancellationToken.None`.

## Tests (component: FakeTimeProvider, fake suppliers backed by controllable TaskCompletionSource)
Fake suppliers cancel their TCS when `ct` fires (`ct.Register(() => tcs.TrySetCanceled(ct))`), otherwise the `finally` waits forever.
Two tests use a fake that doesn't cancel its TCS on `ct` (the late-result test and the I7 disposal test). The test must complete that TCS itself
(see each test for the order), otherwise the `finally` waits forever. Test TCSs use the default options, without
`RunContinuationsAsynchronously`, so a completed fake is queued in `Task.WhenEach` before `TrySetResult` returns.
The fake recorder calls `ct.ThrowIfCancellationRequested()` after any time it advances, as EF does. A write that gets the linked
token instead of `CancellationToken.None` then fails the tests below.
The fake recorder and the fake suppliers append to one call log. When a test reads a `QuoteReceived` or `SupplierFailed`, the log
already has that supplier's `RecordAsync` (persist, then yield). When it reads `Ended`, the `FinishAsync` calls are exactly
`[that status]` (written before `ended`, and only once).
These tests pin exact timing. Behaviour visible over HTTP is tested again in T05a.
A test that checks `ResponseTimeMs` advances exactly to that supplier's completion (see `AGENTS.md` on `Advance`).
- SS2: events are yielded in completion order, before the remaining suppliers finish.
- SS4: one supplier throws → the others still deliver, and a `SupplierFailed` event is emitted.
- SS3, I1, I2: hanging supplier + 6 s elapsed → `Ended(TimedOut)` with the results collected so far, `responded` counts quotes and failures,
  and the hanging task observed cancellation.
- SS3: all suppliers done before 6 s → `Ended(Completed)`.
- SS5, I7: caller cancels → enumeration throws `OperationCanceledException`, every supplier observed the token, and the
  `FinishAsync` calls are exactly `[Cancelled]`.
- SS5, I7: the caller cancels while the last result is being persisted (all other fakes already answered; the fake recorder
  cancels the caller's CTS inside `RecordAsync`) → enumeration throws `OperationCanceledException` and the `FinishAsync` calls
  are exactly `[Cancelled]`.
- SS1: only the selected suppliers are queried, in catalog order, and a repeated id starts one call; `StartAsync` and
  `SearchStarted.Suppliers` get the same distinct list.
- SS3, I3: the deadline passes while a result is being persisted (the fake recorder advances time inside `RecordAsync`) → that
  result is still yielded and counted, and `responded` equals the number of `RecordAsync` calls. Two cases:
  another supplier is still pending → `Ended(TimedOut)`; it was the last result (all other fakes already answered) → `Ended(Completed)`.
- SS3, I1, I3: a result that completed in time but is queued behind a write of the same search is dropped. Two fakes, A and B. A answers; inside
  A's `RecordAsync` the fake recorder completes B, then advances past the deadline → A is yielded, then `Ended(TimedOut)` with
  `responded: 1`, and B is neither yielded nor recorded.
- SS3, I3: a result that completes after the deadline is **not** yielded and not recorded. The late fake is the only one
  pending (it ignores `ct`). In this order: read every other event, advance past the deadline, complete the late TCS, then
  call `MoveNextAsync` → `Ended(TimedOut)` and `RecordAsync` was not called for it.
- I7: the consumer stops enumerating mid-stream without cancelling the token (e.g. a write to a closed response throws and the writer
  disposes the enumerator)
  → disposal completes, every supplier observed cancellation, and the `FinishAsync` calls are exactly `[Cancelled]`.
  One fake only notes that `ct` fired and completes when the test releases it: the `DisposeAsync` task is not complete before
  the release and completes after it (the `finally` awaits the supplier tasks).
- `started` is yielded only after every supplier's call has been started (needed so integration tests can advance time safely),
  and the call log has `StartAsync` before the first supplier call.
