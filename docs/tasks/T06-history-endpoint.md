# T06: History endpoint
**Reqs:** HS1, HS2 · **Interpretations:** I4, I5, I6

## Goal
`GET /api/history`: server-side filtering, sorting and paging over supplier responses joined with their searches.

## Design
- All filters are optional:
  - `startDate`/`endDate`: ISO 8601 UTC instants, `startDate <= search timestamp < endDate` (I4). The client turns the user's
    local days into these instants (T10a). Bind them as `DateTimeOffset?` and compare `.UtcDateTime` with the stored UTC values,
    so the result never depends on the server's time zone;
  - `supplierIds`: 0..n, empty = all;
  - `fromLocation`/`toLocation`: trimmed, then case-insensitive equality (I6). Empty after trimming = no filter. SQLite `lower()` folds ASCII only, which is fine here.
- `sortBy` whitelist: `date|route|supplier|price|responseTime`, `sortDir`: `asc|desc`. Default: `date desc`, newest first. `date` is the search timestamp (I4), `route` is from then to location, `supplier` is the supplier name. Failed rows (null price) sort last for both directions of `price`. Add a stable secondary sort by `Id` ascending, for both directions.
- `startDate >= endDate` → 400.
- `page` is 1..1,000,000 (the cap keeps `(page - 1) * pageSize` inside `int`). `pageSize` is 1..100, default 20.
- Validation uses the same built-in Minimal API validation as T05b (`[AsParameters]` with `[AllowedValues]` and `[Range]`). Invalid input → 400.
- `HistoryQuery` is a record whose optional parameters have default values (`int Page = 1`). On a class, a non-nullable property
  with an initializer still counts as required, so `/api/history` without `page` would return 400.
- Project to a DTO inside the query (`Select`). No entity is returned.

## Tests (integration: `PriceHuntApiFactory`, `GET /api/history` over HTTP)
Seed rows through `AppDbContext` in the factory's database, then call the endpoint. Assert on the JSON DTOs, not on entities.
- HS1, I4: the date filter applies to the search timestamp, from `startDate` inclusive to `endDate` exclusive. With
  `startDate=2026-11-22T22:00:00Z&endDate=2026-11-23T22:00:00Z`, seed searches at `21:59:59Z` and `22:00:00Z` on Nov 22 and at
  `21:59:59Z` and `22:00:00Z` on Nov 23 → exactly the middle two are returned (CI runs in `Asia/Jerusalem`, so a comparison in server local time fails this).
- HS1: one, several and no `supplierIds`.
- HS2, I6: from/to location filter is case-insensitive and trims input; `fromLocation=%20%20` returns the same rows as no `fromLocation`.
- HS1, HS2: filters combined.
- I5: failed rows are returned with a null price and sort last by price, asc and desc.
- Sorting by every column, asc and desc, returns the right order (runs in SQLite, so client-side evaluation or a translation error fails the test).
- Paging: `total` is correct, pages don't overlap, the last page is partial.
- No query string at all → 200 with the defaults (`date desc`, page 1, 20 items).
- Invalid `sortBy`, invalid `sortDir`, `page` out of range, `pageSize` out of range, `startDate >= endDate`, a date that can't be parsed → 400.
- I4: `date` in the JSON is UTC and ends with `Z`.
- End to end: run a search through `POST /api/search`, advancing as T05a does (5 s, read the 6 results, then 1 s and read `ended`), then the same search's rows appear in `GET /api/history`.
