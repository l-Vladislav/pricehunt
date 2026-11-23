# T05: SSE search endpoint
**Reqs:** SS1, SS2, SS5, SS6 · ADR-0001

## Goal
`POST /api/search` validates input and streams the orchestrator's events as SSE.
Use `TypedResults.ServerSentEvents(...)` (.NET 10) with typed payloads and camelCase JSON.

## Validation (400 with ProblemDetails)
- Locations are required (non-empty after trimming).
- `fromDate <= toDate`. Dates are `DateOnly`.
- `supplierIds` empty/null → all suppliers. An unknown id → 400.

## Acceptance criteria
- No response buffering or compression on this endpoint. The first event reaches the client before 500 ms.
- Client disconnect → orchestrator token cancelled → DB status `Cancelled`.

## Tests (integration: `PriceHuntApiFactory`)
Create `PriceHuntApiFactory : WebApplicationFactory<Program>` in the test project; T06 reuses it.
It swaps in SQLite in-memory (kept-open connection, real migrations), `FakeTimeProvider` and a fixed `IRandomSource` (known delays per supplier).
Read the response with `HttpCompletionOption.ResponseHeadersRead` and parse SSE events incrementally. Advance time only after `started` is read.
- SS2: `started` arrives before any supplier completes. After each `Advance`, exactly the suppliers whose delay has passed have sent `quote`, before the rest.
- SS3, I1, I2: default search (all 7), advance 6 s → `ended { status: TimedOut, responded: 6, total: 7 }`, then the stream closes.
- SS3: hanging supplier deselected → `ended { status: Completed }`.
- SS4: flaky supplier fails → `supplier-failed` event, the others still send `quote`.
- SS5, I7: abort the request mid-stream → the search row ends `Cancelled`.
- P1, P2: after a completed stream the DB contains the search, its selected suppliers, and one row per supplier that answered.
- SS1: invalid requests → 400 ProblemDetails (missing location, fromDate > toDate, unknown supplier id). Empty `supplierIds` → all 7.
- `GET /api/suppliers` returns the 7 suppliers.
