# T06: History endpoint
**Reqs:** HS1, HS2 · **Interpretations:** I4, I5, I6

## Goal
`GET /api/history`: server-side filtering, sorting and paging over supplier responses joined with their searches.

## Design
- All filters are optional:
  - `startDate`/`endDate`: the search timestamp, inclusive whole UTC days (I4);
  - `supplierIds`: 0..n, empty = all;
  - `fromLocation`/`toLocation`: trimmed, then case-insensitive equality (I6). Empty after trimming = no filter. SQLite `lower()` folds ASCII only, which is fine here.
- `sortBy` whitelist: `date|route|supplier|price|responseTime`, `sortDir`: `asc|desc`. Default: `date desc`, newest first. `date` is the search timestamp (I4), `route` is from then to location, `supplier` is the supplier name. Failed rows (null price) sort last for both directions of `price`. Add a stable secondary sort by `Id`.
- `startDate > endDate` → 400.
- `page` starts at 1. `pageSize` is 1..100, default 20.
- Validation uses the same built-in Minimal API validation as T05b (`[AsParameters]` with `[AllowedValues]` and `[Range]`). Invalid input → 400.
- `HistoryQuery` is a record whose optional parameters have default values (`int Page = 1`). On a class, a non-nullable property
  with an initializer still counts as required, so `/api/history` without `page` would return 400.
- Project to a DTO inside the query (`Select`). No entity is returned.

## Tests (integration: `PriceHuntApiFactory`, `GET /api/history` over HTTP)
Seed rows through `AppDbContext` in the factory's database, then call the endpoint. Assert on the JSON DTOs, not on entities.
- HS1, I4: start/end date filter applies to the search timestamp, inclusive whole UTC days.
- HS1: one, several and no `supplierIds`.
- HS2, I6: from/to location filter is case-insensitive and trims input; `fromLocation=%20%20` returns the same rows as no `fromLocation`.
- HS1, HS2: filters combined.
- I5: failed rows are returned with a null price and sort last by price, asc and desc.
- Sorting by every column, asc and desc, returns the right order (runs in SQLite, so client-side evaluation or a translation error fails the test).
- Paging: `total` is correct, pages don't overlap, the last page is partial.
- No query string at all → 200 with the defaults (`date desc`, page 1, 20 items).
- Invalid `sortBy`, `page < 1`, `pageSize` out of range, `startDate > endDate` → 400.
- I4: `date` in the JSON is UTC and ends with `Z`.
- End to end: run a search through `POST /api/search` (advance time to the end), then the same search's rows appear in `GET /api/history`.
