# PriceHunt: architecture and plan

Requirements: [spec.md](spec.md). Tasks: [tasks/](tasks/). Decisions: [adr/](adr/).

## Architecture

```
client (Angular 22)                         server (ASP.NET Core 10, Minimal API)
┌──────────────────────┐  POST /api/search   ┌──────────────────────────────────────────┐
│ SearchPage           │ ──────────────────► │ SearchEndpoint → SSE (text/event-stream) │
│  SearchStore(signals)│ ◄── SSE events ──── │   SearchOrchestrator                     │
│  SearchStreamClient  │   abort = cancel    │     linked CTS: RequestAborted + 6s      │
│   (fetch+AbortCtrl)  │                     │     Task per supplier → Task.WhenEach    │
├──────────────────────┤                     │     one loop: yield + persist            │
│ HistoryPage          │  GET /api/history   │   ISupplier ×7 (simulated)               │
│  table/sort/paging   │ ──────────────────► │ HistoryEndpoint → EF Core → SQLite       │
└──────────────────────┘                     └──────────────────────────────────────────┘
```

### Server layout (`server/PriceHunt.Api`)
- `Suppliers/`: `ISupplier`, `SimulatedSupplier`, `SupplierBehavior` (Normal / Flaky / Hanging), `SupplierCatalog`.
- `Search/`: `SearchRequest`, `SearchEvent` types, `SearchOrchestrator`, `SearchEndpoints`.
- `History/`: `HistoryQuery`, `HistoryEndpoints`.
- `Data/`: `AppDbContext`, entities, migrations.
- `Program.cs`: wiring only.

### Concurrency model
1. Create a 6 s timeout CTS with `new CancellationTokenSource(TimeSpan.FromSeconds(6), timeProvider)` and link it to `HttpContext.RequestAborted`.
   The timer must belong to the timeout CTS: `CancelAfter` on a linked CTS runs on the system clock and ignores `FakeTimeProvider`.
2. Start one task per selected supplier. A task returns one event (`Quote` or `SupplierFailed`), or ends cancelled when the token fires first.
3. One loop runs `await foreach` over `Task.WhenEach(tasks).WithCancellation(linkedToken)`, which returns tasks in completion order.
   For each event it persists first (with `CancellationToken.None`, so a received response is never lost), then yields it to the HTTP stream.
   This is the only place that touches `DbContext`. When the token fires, the loop exits at once, without waiting for pending suppliers,
   and a result that completes after that is dropped.
4. Ending the search: all suppliers finished → `Completed`. Timeout fired → `TimedOut`. `RequestAborted` fired → `Cancelled`, then the
   `OperationCanceledException` is rethrown to the caller (never swallowed). Suppliers that never answered get no response row (I3).
5. The final status is written once, with `CancellationToken.None`. On normal completion it is written before `ended` is yielded,
   so the DB is final when the stream closes. A `finally` block also covers a consumer that stops enumerating early: it cancels
   the linked CTS, awaits all supplier tasks and writes `Cancelled` if no status was written yet.

### Streaming contract (SSE over `fetch`, see ADR-0001)
`POST /api/search` with body `{ searchId, fromLocation, toLocation, fromDate, toDate, supplierIds?: string[] }`.
The client creates `searchId` (`crypto.randomUUID()`) and the server uses it as the search's Id. So the client knows the id
before any event arrives and can drop events of an older search, `started` included (SC6).
The response is `text/event-stream`. Every payload carries a `searchId`. JSON is camelCase, enums included (`JsonStringEnumConverter` with camelCase).

| event | data |
|-------|------|
| `started` | `{ searchId, suppliers: [{id, name}] }` |
| `quote` | `{ searchId, supplierId, price, responseTimeMs }` (price in USD) |
| `supplier-failed` | `{ searchId, supplierId, responseTimeMs }` |
| `ended` | `{ searchId, status: "completed" \| "timedOut", responded, total }` |

The server never sends `Cancelled`, because the client is gone by then. That status exists only in the DB.

`GET /api/suppliers` returns `[{ id, name }]`.
`GET /api/history?startDate&endDate&supplierIds=a&supplierIds=b&fromLocation&toLocation&sortBy&sortDir&page&pageSize`
returns `{ items: [...], total, page, pageSize }`. An item is
`{ id, date, fromLocation, toLocation, supplierName, price, responseTimeMs }`: `date` is the search timestamp (I4), `price` is USD or `null` for a failure (I5). `sortBy` is one of `date|route|supplier|price|responseTime` (whitelist).

### Data model (SQLite)
- `Suppliers` (Id PK text, Name). Seeded with `HasData`.
- `Searches` (Id PK guid, FromLocation, ToLocation, FromDate, ToDate, CreatedAtUtc, Status). Status: `Running` while streaming, then `Completed`/`TimedOut`/`Cancelled`.
- `SearchSuppliers` (SearchId FK, SupplierId FK, PK both). Records the selected suppliers.
- `SupplierResponses` (Id PK, SearchId FK, SupplierId FK, Outcome `Success`/`Failed`, PriceMinor? (USD cents, null on failure), ResponseTimeMs, ReceivedAtUtc).
  Indexes: EF's default ones on the foreign keys, plus `Searches(CreatedAtUtc)` for the history date filter (I4).

## Tasks

Status: `[ ]` todo · `[~]` in progress · `[x]` done. Tasks go in order, one PR each. A task too big for one PR is split into subtasks (see `AGENTS.md`).

| ID | Task | Reqs | Status |
|----|------|------|--------|
| [T01](tasks/T01-foundation.md) | Foundation: run commands, CORS, suppliers endpoint | D1, D3 | [ ] |
| [T02](tasks/T02-suppliers.md) | Simulated suppliers | S1–S4 | [ ] |
| [T03](tasks/T03-orchestrator.md) | Search orchestrator (stream, timeout, isolation, cancellation) | SS1–SS5, I1–I3, I7 | [ ] |
| [T04](tasks/T04-persistence.md) | EF Core model, auto-migrate, recording searches and responses | P1–P3, I3, I5, I7 | [ ] |
| [T05](tasks/T05-search-endpoint.md) | SSE search endpoint + integration tests | S1, SS1–SS5, SC6, I1, I2, I6, I7 | [ ] |
| [T06](tasks/T06-history-endpoint.md) | History endpoint: filters, sorting, paging | HS1, HS2, I4–I6 | [ ] |
| [T07](tasks/T07-client-stream.md) | Client SSE-over-fetch stream client | SC2, SC6 | [ ] |
| [T08](tasks/T08-search-page.md) | Search page: form, sorted results, progress, stale guard | SC1–SC3, SC5, SC6, I1 | [ ] |
| [T09](tasks/T09-no-flicker.md) | Smooth re-ordering (FLIP) | SC4 | [ ] |
| [T10](tasks/T10-history-page.md) | History page: filters, sortable paged table | HC1, HC2, I5 | [ ] |
| [T11](tasks/T11-readme-release.md) | README, clean-clone verification | SS6, D1, D2, D4 | [ ] |
