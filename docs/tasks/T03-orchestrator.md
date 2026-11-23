# T03: Search orchestrator
**Reqs:** SS1, SS2, SS3, SS4, SS5 · **Interpretations:** I1, I2, I3, I7

## Goal
`SearchOrchestrator.RunAsync(SearchRequest, CancellationToken) : IAsyncEnumerable<SearchEvent>`.
It yields events as they happen and finishes with exactly one terminal outcome. It has no HTTP and no EF dependencies.
Persistence plugs in through `ISearchRecorder` (fake here, real in T04).

## Design (see plan.md, "Concurrency model")
- Timeout CTS = `new CancellationTokenSource(TimeSpan.FromSeconds(6), timeProvider)`, linked with the caller `ct`. Keep track of **which** one fired.
  Don't call `CancelAfter` on the linked CTS: it uses the system clock, so `FakeTimeProvider` can't trigger it.
- One task per supplier. Each task catches **all** exceptions except cancellation of the linked token, and returns one event.
- One loop: `await foreach (var task in Task.WhenEach(tasks).WithCancellation(linkedToken))` yields events in completion order.
  When the token fires, the loop exits at once (it doesn't wait for pending suppliers). It also checks the token before yielding,
  so a result that completes after the deadline is dropped.
- Each event is persisted first (`CancellationToken.None`), then yielded.
- `WithCancellation` makes the loop throw `OperationCanceledException`. If the timeout fired, catch it and end with `TimedOut`;
  if the caller's token fired, let it propagate after the final write.
- Outcome:
  - all done → `Completed`;
  - timeout → `TimedOut`;
  - caller cancelled → `Cancelled`, then the `OperationCanceledException` is rethrown.
  Pending suppliers are cancelled and produce no event and no record (I3).
- The final status is written once, with `CancellationToken.None`. On normal completion: write it, then yield `ended`.
- A `finally` block covers a consumer that stops enumerating early. It cancels the linked CTS (otherwise awaiting the hanging supplier
  never ends), awaits all supplier tasks with `Task.WhenAll(tasks).ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing)`
  (no fire-and-forget, and their cancellations don't hide the original exception), and writes `Cancelled` if no status was written yet.

## Acceptance criteria
- No `async void`, `.Result`, `.Wait()`, or fire-and-forget `Task.Run`.
- The final recorder call uses `CancellationToken.None`.

## Tests (component: FakeTimeProvider, fake suppliers backed by controllable TaskCompletionSource)
These tests pin exact timing. Behaviour visible over HTTP is tested again in T05.
- SS2: events are yielded in completion order, before the remaining suppliers finish.
- SS4: one supplier throws → the others still deliver, and a `SupplierFailed` event is emitted.
- SS3, I1, I2: hanging supplier + 6 s elapsed → `Ended(TimedOut)` with the results collected so far, `responded` counts quotes and failures,
  and the hanging task observed cancellation.
- SS3: all suppliers done before 6 s → `Ended(Completed)`.
- SS5, I7: caller cancels → enumeration throws `OperationCanceledException`, every supplier observed the token, recorder got `Cancelled`.
- SS1: only the selected suppliers are queried.
- SS3: a result that completes after the deadline is **not** yielded (the fake ignores `ct`; fire the timeout first, then complete its TCS).
- I7: the consumer stops enumerating mid-stream without cancelling the token (what the SSE writer does on disconnect)
  → disposal completes, every supplier observed cancellation, and the recorder gets `Cancelled` exactly once.
- `started` is yielded only after every supplier's call has been started (needed so integration tests can advance time safely).
