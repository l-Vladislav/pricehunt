# T05: SSE search endpoint
**Reqs:** S1, SS1, SS2, SS3, SS4, SS5, SC6 · **Interpretations:** I1, I2, I6, I7 · ADR-0001

## Goal
`POST /api/search` validates input and streams the orchestrator's events as SSE.
Use `TypedResults.ServerSentEvents(...)` (.NET 10) with `SseItem<object>` and `eventType` set per event (`started`, `quote`, ...).
`object` makes the serializer use the runtime type; a base `SearchEvent` type would drop the derived fields. JSON is camelCase.

## Validation (400 with ProblemDetails)
Use the built-in Minimal API validation (`builder.Services.AddValidation()`), not hand-written checks.
- `searchId`: a non-empty GUID. An id that already exists → 400, checked in the handler.
- Locations: `[Required]` (rejects empty and whitespace-only strings).
- `fromDate <= toDate` via `IValidatableObject` on the request. Dates are `DateOnly`.
- `supplierIds` empty/null → all suppliers. An unknown id → 400, checked in the handler because it needs the supplier catalog.
- Locations are trimmed before the search is recorded, so the history filter (I6) matches.

## Acceptance criteria
- No response buffering or compression on this endpoint: `started` reaches the client before any time is advanced.
- Client disconnect → orchestrator token cancelled → DB status `Cancelled`.

## Tests (integration: `PriceHuntApiFactory`)
Create `PriceHuntApiFactory : WebApplicationFactory<Program>` in the test project; T06 reuses it.
Each test creates its own factory, so the database, the clock and the random sequence are never shared between tests.
It swaps in SQLite in-memory (kept-open connection, real migrations), `FakeTimeProvider` and a sequence `IRandomSource` (see T02 for the draw order).
It also wraps `ISearchRecorder` in a small decorator that completes a `TaskCompletionSource` when the final status is written. Tests await it instead of polling.
Read the response with `HttpCompletionOption.ResponseHeadersRead` and parse SSE events incrementally. Advance time only after `started` is read.
- SS2: `started` arrives before any supplier completes. Advancing step by step, each supplier's event arrives after its own delay and in delay order.
- SS3, I1, I2: default search (all 7), advance 5 s and read 6 results, then advance 1 s → `ended { status: "timedOut", responded: 6, total: 7 }`, then the stream closes.
- SS3: hanging supplier deselected → `ended { status: "completed" }`.
- SS4: flaky supplier fails → `supplier-failed` event, the others still send `quote`.
- SS5, I7: abort the request mid-stream, await the recorder decorator → the search row is `Cancelled`.
- I6: locations with surrounding spaces are stored trimmed.
- SS1: invalid requests → 400 ProblemDetails (missing location, fromDate > toDate, unknown supplier id, empty or reused `searchId`). Empty `supplierIds` → all 7.
- SC6: every event carries the `searchId` the client sent.
- S1: `GET /api/suppliers` returns the 7 suppliers.
