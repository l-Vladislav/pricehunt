---
name: concurrency-review
description: Checklist review of streaming, timeout and cancellation code in PriceHunt (server Search/ and Suppliers/, client stream client and search store). Use after changing any of those, or when asked to check for races, leaks or cancellation bugs.
paths: server/PriceHunt.Api/Search/**, server/PriceHunt.Api/Suppliers/**, client/src/app/features/search/**, client/src/app/core/**
---

# Concurrency & cancellation review

Read the changed files, then answer **every** item with ✅, ❌ + file:line, or N/A. Fix the ❌ items or report them.

## Server
- [ ] Linked CTS combines `RequestAborted` + 6 s timeout via `TimeProvider`. The code can tell which one fired.
- [ ] Every supplier call receives the linked token. The hanging supplier ends only through that token.
- [ ] Each supplier task isolates its own exceptions. One failure can't fault the whole search (SS4).
- [ ] Cancellation of the linked token is not reported as a supplier failure.
- [ ] Results arriving after the deadline are not yielded or streamed.
- [ ] All supplier tasks are awaited/observed before the method returns. No unobserved task exceptions.
- [ ] `DbContext` is touched by one consumer only. The final status write uses `CancellationToken.None`.
- [ ] Terminal status is exactly one of Completed / TimedOut / Cancelled, and it is persisted in every path (including exceptions).
- [ ] `CancellationTokenSource` instances are disposed.
- [ ] No `async void`, `.Result`, `.Wait()`, `Thread.Sleep`, fire-and-forget.
- [ ] The SSE response isn't buffered or compressed.

## Client
- [ ] A new search aborts the previous `fetch` (switchMap + AbortController).
- [ ] Every event is checked against the current `searchId` before it changes state (SC6).
- [ ] Stream errors and completion leave the UI in a final state, never stuck on "running".
- [ ] No subscription leaks on component destroy.
- [ ] Progress counts quotes + failures (I1).

## Proof
For each ✅ on a behavioural item, name the test that proves it. A ✅ without a test is a ❌.
