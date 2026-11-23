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
2. Start one task per selected supplier. Each task catches its own exceptions and returns exactly one event (`Quote` or `SupplierFailed`).
3. One loop runs `await foreach` over `Task.WhenEach(tasks)`, which returns tasks in completion order. It yields each event to the HTTP stream and persists it. This is the only place that touches `DbContext`.
4. Ending the search: all suppliers finished → `Completed`. Timeout fired → `TimedOut`. `RequestAborted` fired → `Cancelled`. Suppliers that never answered get no response row (I3).
5. The final DB write uses `CancellationToken.None`, because the request token may already be cancelled.

### Streaming contract (SSE over `fetch`, see ADR-0001)
`POST /api/search` with body `{ fromLocation, toLocation, fromDate, toDate, supplierIds?: string[] }`.
The response is `text/event-stream`. Every payload carries a `searchId`.

| event | data |
|-------|------|
| `started` | `{ searchId, suppliers: [{id, name}] }` |
| `quote` | `{ searchId, supplierId, price, responseTimeMs }` (price in USD) |
| `supplier-failed` | `{ searchId, supplierId, responseTimeMs }` |
| `ended` | `{ searchId, status: "Completed" \| "TimedOut", responded, total }` |

The server never sends `Cancelled`, because the client is gone by then. That status exists only in the DB.

`GET /api/suppliers` returns `[{ id, name }]`.
`GET /api/history?startDate&endDate&supplierIds=a&supplierIds=b&fromLocation&toLocation&sortBy&sortDir&page&pageSize`
returns `{ items: [...], total, page, pageSize }`. `sortBy` is one of `date|route|supplier|price|responseTime` (whitelist).

### Data model (SQLite)
- `Suppliers` (Id PK text, Name). Seeded with `HasData`.
- `Searches` (Id PK guid, FromLocation, ToLocation, FromDate, ToDate, CreatedAtUtc, Status). Status: `Running` while streaming, then `Completed`/`TimedOut`/`Cancelled`.
- `SearchSuppliers` (SearchId FK, SupplierId FK, PK both). Records the selected suppliers.
- `SupplierResponses` (Id PK, SearchId FK, SupplierId FK, Outcome `Success`/`Failed`, PriceMinor? (USD cents, null on failure), ResponseTimeMs, ReceivedAtUtc).
  Indexes: (ReceivedAtUtc), (SupplierId), (SearchId).

## Tasks

Status: `[ ]` todo · `[~]` in progress · `[x]` done. Tasks go in order, one PR each. A task too big for one PR is split into subtasks (see `AGENTS.md`).

| ID | Task | Reqs | Status |
|----|------|------|--------|
| [T01](tasks/T01-foundation.md) | Foundation: run commands, CORS, suppliers endpoint | D1, D3 | [ ] |
| [T02](tasks/T02-suppliers.md) | Simulated suppliers | S1–S4 | [ ] |
| [T03](tasks/T03-orchestrator.md) | Search orchestrator (stream, timeout, isolation, cancellation) | SS1–SS5 | [ ] |
| [T04](tasks/T04-persistence.md) | EF Core model, auto-migrate, recording searches and responses | P1–P3, I3, I5, I7 | [ ] |
| [T05](tasks/T05-search-endpoint.md) | SSE search endpoint + integration tests | SS1–SS5 | [ ] |
| [T06](tasks/T06-history-endpoint.md) | History endpoint: filters, sorting, paging | HS1, HS2 | [ ] |
| [T07](tasks/T07-client-stream.md) | Client SSE-over-fetch stream client | SC2, SC6 | [ ] |
| [T08](tasks/T08-search-page.md) | Search page: form, sorted results, progress, stale guard | SC1–SC3, SC5, SC6 | [ ] |
| [T09](tasks/T09-no-flicker.md) | Smooth re-ordering (FLIP) | SC4 | [ ] |
| [T10](tasks/T10-history-page.md) | History page: filters, sortable paged table | HC1, HC2 | [ ] |
| [T11](tasks/T11-readme-release.md) | README, clean-clone verification | SS6, D1, D2, D4 | [ ] |
