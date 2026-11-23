# AGENTS.md

PriceHunt: a take-home assignment. Shipping-price search across 7 simulated suppliers, streamed to an Angular client, with saved history.
The hard part is concurrency and cancellation on the server.

## Read first
- `docs/spec.md`: requirements from the assignment PDF, with IDs (S*, SS*, SC*, P*, H*, D*), and my interpretations (I*).
- `docs/plan.md`: architecture, streaming contract, data model, task list with status.
- `docs/tasks/Txx-*.md`: the task you are working on. Work on **one task at a time**.
- `docs/adr/`: decisions already made. Don't reopen them without asking.

## Commands
```bash
# server (.NET 10, from repo root)
dotnet tool restore                               # local dotnet-ef 10.x
dotnet build server/PriceHunt.sln
dotnet test --solution server/PriceHunt.sln        # Microsoft.Testing.Platform (set in global.json)
dotnet run --project server/PriceHunt.Api        # http://localhost:5080

# client (Angular 22, from client/)
npm start                                         # http://localhost:4200, runs npm install first
npx ng test --watch=false                         # Vitest (npm test also re-runs npm install, slower)
npx ng build
npx ng lint                                       # angular-eslint
npx prettier --write .                            # formatting: double quotes, tabs
```

## Workflow for every task
1. Start from an up-to-date `main`: `git switch main && git pull`, then `git switch -c tNN-short-slug`.
2. Read the task file and the requirement IDs it references. If something is ambiguous, stop and ask.
3. Write the failing tests listed in the task first. Run them and confirm they fail for the right reason.
4. Implement the smallest change that makes them pass. Stay inside the task's scope.
5. Run the full test suite for the affected project(s) and a build. All must be green.
6. Update the task status in `docs/plan.md` and add a row to `docs/ai-usage.md`.
7. Show the owner what will be committed (files + message `Txx: <summary> (<req IDs>)`) and **wait for approval**.
   Only then commit on the task branch, push it and open a PR with `gh pr create` using the template.

## Git & PR rules
- Commit, push, create repos or open PRs only when the owner approves. Approval for one commit doesn't cover the next.
- `main` is protected. All changes go through a PR with green CI. Never commit or push to `main`, never force-push a shared branch.
- One task = one branch = one PR. Non-task work uses `chore/…`, `fix/…` or `docs/…` branches.
- One PR is one logical change. Aim for at most ~20 files and ~400 changed lines, not counting generated files
  (lock files, EF migrations, CLI scaffold output). If a task will be bigger, split it into subtasks (`T04a`, `T04b`, …)
  before writing code and add them to `docs/plan.md`. Each subtask is a PR that is green on its own.
  Tests always go in the same PR as the code they test.
- Generated files are marked `linguist-generated` in `.gitattributes`, so GitHub collapses them in the diff. Add new generated paths there.
- Delete template placeholders (demo pages, sample tests, CLI READMEs) as soon as real code replaces them.
- Small, meaningful commits. The history is part of the deliverable.
- Never merge a PR. The owner reviews and merges.

## Server rules (C#)
- Minimal APIs, feature folders (`Suppliers/`, `Search/`, `History/`, `Data/`). `Program.cs` contains wiring only.
- Inject `TimeProvider` for every delay or timeout, and `IRandomSource` for randomness. Tests use `FakeTimeProvider`, never real sleeps.
- Every async method that can wait accepts a `CancellationToken` and passes it to everything below.
- Forbidden: `async void`, `.Result`, `.Wait()`, `Thread.Sleep`, fire-and-forget `Task.Run`, swallowing `OperationCanceledException` that came from the caller's token.
- `DbContext` is never used from more than one thread. Concurrent producers write to a `Channel<T>`, and one consumer touches the DB.
- The final status write after cancellation uses `CancellationToken.None`.
- SQLite/EF: store money as `long` minor units and time as UTC `DateTime` (SQLite can't ORDER BY `decimal` or `DateTimeOffset`). Never return entities from endpoints, return DTOs.
- Schema changes go through EF migrations: `dotnet ef migrations add <Name> --project server/PriceHunt.Api`.
- Nullable enabled, warnings are bugs. Records for DTOs and events.

## Client rules (Angular 22)
- Standalone components, signals for state, `inject()`, the new control flow (`@if`, `@for` with `track`), `OnPush`, zoneless.
- No `EventSource`. Streaming goes through `SearchStreamClient` (fetch + AbortController), see ADR-0001.
- Every streamed event is checked against the current `searchId` before it touches state.
- No `any`. No subscriptions without teardown (`takeUntilDestroyed` / `toSignal` / `async`).
- Feature folders: `core/`, `features/search/`, `features/history/`.
- Formatting is Prettier's job (double quotes, tabs, see `client/.prettierrc`). ESLint checks code, not style.

## Testing rules
Integration tests are the default. Isolated tests are used only where an integration test can't control timing.

| Layer | What it proves | Setup |
|-------|----------------|-------|
| **Integration** (most tests) | The real path works: HTTP → orchestrator → SSE → SQLite, and history over real data. Validation, SSE framing, abort → `Cancelled`, SQL translation of sorting. | `PriceHuntApiFactory` (`WebApplicationFactory`), in-memory SQLite with real migrations, `FakeTimeProvider`, fixed `IRandomSource`. |
| **Orchestrator** (component) | Exact interleavings that HTTP can't pin down: completion order, timeout vs. late result, which token fired. | `SearchOrchestrator` with `FakeTimeProvider` and fake suppliers backed by `TaskCompletionSource`. No HTTP, no DB. |
| **Supplier** (component) | What can't be seen from above: the hanging supplier ends only through `ct`, the flaky threshold. A few tests. | `SimulatedSupplier` with `FakeTimeProvider` and fake random. |

- No mocking libraries. Fakes are small hand-written classes. Never mock `DbContext` or EF: use real SQLite.
- Time moves only through `FakeTimeProvider.Advance`. No real sleeps, no `Task.Delay` in tests, no polling with timeouts as a sync mechanism.
  Integration tests advance time only after reading the `started` event (the server starts every supplier's delay before sending it).
- A flaky concurrency test is a bug. Fix the synchronisation, don't add retries or longer timeouts.
- Every testable requirement ID in a task maps to at least one test that names it, e.g. `// SS3` or `it('SS3: ...')`.
  For ones that can't be automated (e.g. SC4 visual smoothness, D2 README), state in the PR how they were verified.
- Test behaviour through public APIs. No tests that only assert mocks were called.
- Don't delete, skip or weaken a failing test to get green. Report it instead.

## Dependencies
Pre-approved, add them when a task needs them:
- Server: `Microsoft.EntityFrameworkCore.Sqlite`, `Microsoft.EntityFrameworkCore.Design` (10.x), `Microsoft.Extensions.TimeProvider.Testing`, `Microsoft.AspNetCore.Mvc.Testing` (tests only).
- Client: none beyond what is installed (angular-eslint, Prettier). Build UI pieces (table, sort, pager, FLIP) by hand.

Anything else needs the owner's approval.

## Done means
- `dotnet build -warnaserror` and `dotnet test` are green. If the client changed: `npx ng test --watch=false`, `npx ng build`, `npx ng lint` and `npx prettier --check .` are green.
- The task's acceptance criteria are met, and `docs/plan.md` + `docs/ai-usage.md` are updated.
- A PR is open with the template filled in and CI green. The real command output is quoted, not paraphrased.

## Boundaries
- **Ask first:** adding a dependency that isn't pre-approved, changing the streaming contract or the DB schema outside the current task, editing `docs/spec.md` or an ADR.
- **Never:** commit secrets or `pricehunt.db`, change `global.json`/target frameworks, rewrite unrelated code, or mark a task done with failing or skipped tests.
