# T03b: Search orchestrator, cancellation and races
**Reqs:** SS3, SS5 · **Interpretations:** I1, I3, I7

## Goal
Finish `SearchOrchestrator` (T03a): caller cancellation ends the search `Cancelled`, a consumer that stops early is cleaned up,
and the races around the deadline and the last write end as plan.md, "Concurrency model", steps 3-4 defines.

## Design
- A caller cancellation is not caught: the `OperationCanceledException` reaches the caller after the final write.
- After the loop, call `ct.ThrowIfCancellationRequested()` on the caller's token before writing `Completed`.
  This turns a caller cancellation during the last write into `Cancelled` (I7). Use `ct`, not the linked token:
  a timeout during the last write ends `Completed` (plan.md step 4).
- The `finally` from T03a also writes `Cancelled` (with `CancellationToken.None`) if no status was written yet. This covers a
  caller cancellation and a consumer that stops enumerating early without cancelling the token.

## Acceptance criteria
- The `OperationCanceledException` from the caller's token is never caught or swallowed.
- The final status is written exactly once in every path.

## Tests (component: the T03a fakes and call log)
Two tests use a fake that doesn't cancel its TCS on `ct` (the late-result test and the I7 disposal test). The test must complete
that TCS itself (see each test for the order), otherwise the `finally` waits forever.
- SS5, I7: caller cancels → enumeration throws `OperationCanceledException`, every supplier observed the token, and the
  `FinishAsync` calls are exactly `[Cancelled]`.
- SS5, I7: the caller cancels while the last result is being persisted (all other fakes already answered; the fake recorder
  cancels the caller's CTS inside `RecordAsync`) → enumeration throws `OperationCanceledException` and the `FinishAsync` calls
  are exactly `[Cancelled]`.
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
  disposes the enumerator) → disposal completes, every supplier observed cancellation, and the `FinishAsync` calls are exactly
  `[Cancelled]`. One fake only notes that `ct` fired and completes when the test releases it: the `DisposeAsync` task is not
  complete before the release and completes after it (the `finally` awaits the supplier tasks).
