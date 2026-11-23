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
- `StartAsync` runs before any supplier starts, so response rows always have their search row.

## Design (see plan.md, "Concurrency model")
- Timeout CTS = `new CancellationTokenSource(TimeSpan.FromSeconds(6), timeProvider)`, linked with the caller `ct`. Keep track of **which** one fired.
  Don't call `CancelAfter` on the linked CTS: it uses the system clock, so `FakeTimeProvider` can't trigger it.
- One task per supplier. Each task catches **all** exceptions except cancellation of the linked token, and returns one event.
- `RunAsync` marks `ct` with `[EnumeratorCancellation]`, so a token passed through `WithCancellation` by the SSE writer arrives
  (without it, CS8425 fails the `-warnaserror` build).
- One loop over `Task.WhenEach(tasks)` with the linked token yields events in completion order. When the token fires, the loop
  exits at the next `MoveNextAsync` (it doesn't wait for pending suppliers).
- C# doesn't allow `yield return` inside a `try` that has a `catch` (CS1626). So enumerate by hand: `GetAsyncEnumerator(linkedToken)`,
  wrap only `MoveNextAsync()` in `try/catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested && !ct.IsCancellationRequested)`
  to end with `TimedOut`, and `yield` outside that `try`. A caller cancellation is not caught: it propagates after the final write.
- No token check is needed inside the loop. While a task has not been handed out yet, `MoveNextAsync` throws as soon as the
  token has fired, even if that task already completed. So after the deadline no result is handed out: a late one is dropped,
  and so is one that completed in time but was queued behind a write (I3). After the last task `MoveNextAsync` returns `false`
  without looking at the token. Every result then arrived in time, so a timeout that fired during the last write still ends
  `Completed` (owner's decision). Both behaviours were checked on .NET 10; the tests below pin them.
- After the loop, call `ct.ThrowIfCancellationRequested()` on the caller's token before writing `Completed`. A caller that
  cancelled during the last write gets `Cancelled` (I7), not `Completed` (owner's decision).
- For each completed task: persist it (`CancellationToken.None`), then yield it. Once persisted, a result is always yielded and
  counted, so the DB rows always match `ended.responded`.
- Outcome:
  - all done → `Completed` (also when the timeout fired during the last write);
  - timeout with a supplier still outstanding → `TimedOut`;
  - caller cancelled, also during the last write → `Cancelled` (written in the `finally`), and the `OperationCanceledException` propagates.
  Pending suppliers are cancelled and produce no event and no record (I3).
- The final status is written once, with `CancellationToken.None`. On normal completion: write it, then yield `ended`.
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
The late-result test is the only exception: its fake ignores `ct`, so the test completes that TCS itself (see the test for the order).
These tests pin exact timing. Behaviour visible over HTTP is tested again in T05a.
A test that checks `ResponseTimeMs` advances exactly to that supplier's completion (see `AGENTS.md` on `Advance`).
- SS2: events are yielded in completion order, before the remaining suppliers finish.
- SS4: one supplier throws → the others still deliver, and a `SupplierFailed` event is emitted.
- SS3, I1, I2: hanging supplier + 6 s elapsed → `Ended(TimedOut)` with the results collected so far, `responded` counts quotes and failures,
  and the hanging task observed cancellation.
- SS3: all suppliers done before 6 s → `Ended(Completed)`.
- SS5, I7: caller cancels → enumeration throws `OperationCanceledException`, every supplier observed the token, recorder got `Cancelled`.
- SS5, I7: the caller cancels while the last result is being persisted (all other fakes already answered; the fake recorder
  cancels the caller's CTS inside `RecordAsync`) → enumeration throws `OperationCanceledException` and the recorder got `Cancelled`, not `Completed`.
- SS1: only the selected suppliers are queried, in catalog order, and a repeated id starts one call; `StartAsync` and
  `SearchStarted.Suppliers` get the same distinct list.
- SS3, I3: the deadline passes while a result is being persisted (the fake recorder advances time inside `RecordAsync`) → that
  result is still yielded and counted, and `responded` equals the number of `RecordAsync` calls. Two cases:
  another supplier is still outstanding → `Ended(TimedOut)`; it was the last result (all other fakes already answered) → `Ended(Completed)`.
- SS3, I3: a result that completes after the deadline is **not** yielded and not recorded. The late fake is the only one
  pending (it ignores `ct`). In this order: read every other event, advance past the deadline, complete the late TCS, then
  call `MoveNextAsync` → `Ended(TimedOut)` and `RecordAsync` was not called for it. The late result is already queued when the
  loop asks for it, so this also proves that a completed task is not handed out after the deadline.
- I7: the consumer stops enumerating mid-stream without cancelling the token (e.g. a write to a closed response throws and the writer
  disposes the enumerator)
  → disposal completes, every supplier observed cancellation, and the recorder gets `Cancelled` exactly once.
- `started` is yielded only after every supplier's call has been started (needed so integration tests can advance time safely).
