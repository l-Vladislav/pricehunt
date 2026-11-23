# T03: Search orchestrator
**Reqs:** SS1, SS2, SS3, SS4, SS5 · **Interpretations:** I1, I2, I3

## Goal
`SearchOrchestrator.RunAsync(SearchRequest, CancellationToken) : IAsyncEnumerable<SearchEvent>`.
It yields events as they happen and finishes with exactly one terminal outcome. It has no HTTP and no EF dependencies.
Persistence plugs in through `ISearchRecorder` (fake here, real in T04).

## Design (see plan.md, "Concurrency model")
- Timeout CTS = `new CancellationTokenSource(TimeSpan.FromSeconds(6), timeProvider)`, linked with the caller `ct`. Keep track of **which** one fired.
  Don't call `CancelAfter` on the linked CTS: it uses the system clock, so `FakeTimeProvider` can't trigger it.
- One task per supplier. Each task catches **all** exceptions except cancellation of the linked token, and returns one event.
- One loop: `await foreach (var task in Task.WhenEach(tasks))` yields events in completion order. It stops when every task is done or the linked token fires.
- Outcome:
  - all done → `Completed`;
  - timeout → `TimedOut`;
  - caller cancelled → `Cancelled`.
  Pending suppliers are cancelled and produce no event and no record (I3).
- After the loop, `await` all supplier tasks (observed, no fire-and-forget) before the final record.

## Acceptance criteria
- No `async void`, `.Result`, `.Wait()`, or fire-and-forget `Task.Run`.
- The final recorder call uses `CancellationToken.None`.

## Tests (component: FakeTimeProvider, fake suppliers backed by controllable TaskCompletionSource)
These tests pin exact timing. Behaviour visible over HTTP is tested again in T05.
- SS2: events are yielded in completion order, before the remaining suppliers finish.
- SS4: one supplier throws → the others still deliver, and a `SupplierFailed` event is emitted.
- SS3: hanging supplier + 6 s elapsed → `Ended(TimedOut)` with the results collected so far, and the hanging task observed cancellation.
- SS3: all suppliers done before 6 s → `Ended(Completed)`.
- SS5: caller cancels → enumeration stops, every supplier observed the token, recorder got `Cancelled`.
- SS1: only the selected suppliers are queried.
- SS3: a result that completes after the deadline is **not** yielded (race: complete the TCS and fire the timeout in the same step).
- `started` is yielded only after every supplier's call has been started (needed so integration tests can advance time safely).
