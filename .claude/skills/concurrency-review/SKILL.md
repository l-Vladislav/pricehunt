---
name: concurrency-review
description: Checklist review of streaming, timeout and cancellation code in PriceHunt (server Search/ and Suppliers/, client stream client and search store). Use after changing any of those, or when asked to check for races, leaks or cancellation bugs.
paths: server/PriceHunt.Api/Search/**, server/PriceHunt.Api/Suppliers/**, client/src/app/features/search/**, client/src/app/core/**
---

# Concurrency & cancellation review

Read the changed files, then answer **every** item with ✅, ❌ + file:line, or N/A. Fix the ❌ items or report them.

## Server
- [ ] The 6 s timeout is its own CTS created with `TimeProvider` (`new CancellationTokenSource(timeout, timeProvider)`), linked with
      `RequestAborted`. No `CancelAfter` on the linked CTS. The code can tell which one fired.
- [ ] Every supplier call receives the linked token. The hanging supplier ends only through that token.
- [ ] Each supplier task isolates its own exceptions. One failure can't fault the whole search (SS4).
- [ ] Cancellation of the linked token is not reported as a supplier failure.
- [ ] The loop enumerates `Task.WhenEach(...)` with the linked token and exits at the next `MoveNextAsync` after the token fires.
- [ ] Every DB write goes through the recorder's `SemaphoreSlim(1, 1)` (SQLite has one writer).
- [ ] Only `MoveNextAsync` sits in the `try/catch` that turns a timeout into `TimedOut`. A late result is neither stored nor
      streamed. Each result is persisted (with `CancellationToken.None`), then yielded; a stored one is always streamed.
- [ ] A caller cancellation writes `Cancelled` (in the `finally`) and its `OperationCanceledException` propagates uncaught,
      also during the last write: the caller's token is checked after the loop, before `Completed` is written.
      A timeout with a supplier still outstanding ends as `TimedOut`; one that fires during the last write ends as `Completed`.
- [ ] A `finally` block cancels the linked CTS and awaits all supplier tasks (`SuppressThrowing`) before the method returns,
      also when the consumer stops enumerating early. No unobserved task exceptions.
- [ ] `DbContext` is touched by one consumer only. The final status write uses `CancellationToken.None`.
- [ ] Terminal status is exactly one of Completed / TimedOut / Cancelled, written exactly once, in every path (including exceptions).
- [ ] `CancellationTokenSource` instances are disposed.
- [ ] No `async void`, `.Result`, `.Wait()`, `Thread.Sleep`, fire-and-forget.
- [ ] The SSE response isn't buffered or compressed.

## Client
- [ ] A new search aborts the previous `fetch` (switchMap + AbortController).
- [ ] The client creates `searchId` before the request. Every event, `started` included, is checked against it before it changes state (SC6).
- [ ] Stream errors and completion leave the UI in a final state, never stuck on "running".
- [ ] No subscription leaks on component destroy.
- [ ] Progress counts quotes + failures (I1).

## Proof
For each ✅ on a behavioural item, name the test that proves it. A ✅ without a test is a ❌.
