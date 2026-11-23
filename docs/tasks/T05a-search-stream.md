# T05a: SSE search endpoint, streaming
**Reqs:** SS2, SS3, SS4, SS5, SC6 · **Interpretations:** I1, I2, I7 · ADR-0001

## Goal
`POST /api/search` streams the orchestrator's events as SSE. Validation comes in T05b.

## Design
- Use `TypedResults.ServerSentEvents(...)` (.NET 10) with `SseItem<object>` and `eventType` set per event
  (`started`, `quote`, `supplier-failed`, `ended`, see plan.md). `object` makes the serializer write the runtime type,
  so the derived fields are included (checked in the spike).
- JSON is camelCase, enums included (`JsonStringEnumConverter` with camelCase), so `ended.status` is `"completed"` or `"timedOut"`.
- The orchestrator gets `HttpContext.RequestAborted`. No response buffering or compression on this endpoint.

## Acceptance criteria
- `started` reaches the client before any time is advanced.
- Client disconnect → orchestrator token cancelled → DB status `Cancelled`.

## Tests (integration: `PriceHuntApiFactory`)
Extend the factory (T01, T04): wrap `ISearchRecorder` in a small decorator that completes a `TaskCompletionSource` in `FinishAsync`.
Tests await it instead of polling. Read the response with `HttpCompletionOption.ResponseHeadersRead` and parse SSE events
incrementally with a small helper in the test project. Advance time only after `started` is read, and read the expected events
before advancing again. Every test waits for its search to end before the factory is disposed (see `AGENTS.md`).
- SS2: `started` arrives before any supplier completes. Advancing step by step, each supplier's event arrives after its own delay and in delay order.
- SS3, I1, I2: default search (all 7), advance 5 s and read 6 results, then advance 1 s → `ended { status: "timedOut", responded: 6, total: 7 }`, then the stream closes.
- SS3: hanging supplier deselected → `ended { status: "completed" }`.
- SS4: flaky supplier fails → `supplier-failed` event, the others still send `quote`.
- SS5, I7: abort the request mid-stream, await the recorder decorator → the search row is `Cancelled`.
- SC6: every event carries the `searchId` the client sent.
