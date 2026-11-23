# T05b: SSE search endpoint, validation
**Reqs:** SS1 · **Interpretations:** I6

## Goal
`POST /api/search` rejects bad input with 400 ProblemDetails before the stream starts, and stores clean locations.

## Design
Use the built-in Minimal API validation (`builder.Services.AddValidation()`), not hand-written checks.
- `searchId`: `Guid.Empty` is rejected in `IValidatableObject`. An id that already exists → 400, checked in the handler with the DB.
- Locations: `[Required]` (rejects empty and whitespace-only strings). Trimmed before the search is recorded, so the history filter (I6) matches.
- Dates are `[Required] DateOnly?`. A plain `DateOnly` would bind a missing date as `0001-01-01` and pass validation.
  `fromDate <= toDate` in `IValidatableObject`.
- `supplierIds` empty/null → all suppliers. An unknown id → 400, checked in the handler because it needs the supplier catalog.
- The handler's own 400s (reused `searchId`, unknown supplier) use `TypedResults.ValidationProblem` with the C# property name
  as the key (`nameof`), the same shape as the built-in validation, so the client shows the message (T07).
  The built-in validation in .NET 10.0 ignores the JSON naming policy, so its keys are `FromLocation`, not `fromLocation`.

## Tests (integration: `PriceHuntApiFactory`)
- SS1: each invalid request → 400 ProblemDetails: missing location, whitespace-only location, missing date, `fromDate > toDate`, unknown supplier id, empty `searchId`, reused `searchId`.
- SS1: empty `supplierIds` → `started` lists all 7 suppliers. Two ids → only those two.
- I6: locations with surrounding spaces are stored trimmed.
