# T06: History endpoint
**Reqs:** HS1, HS2 · **Interpretations:** I4, I5, I6

## Goal
`GET /api/history`: server-side filtering, sorting and paging over supplier responses joined with their searches.

## Design
- Filters: `startDate`/`endDate` on the search timestamp (inclusive, whole UTC day), `supplierIds` (0..n, empty = all), optional `fromLocation`/`toLocation` (case-insensitive equality).
- `sortBy` whitelist: `date|route|supplier|price|responseTime`. Anything else → 400. Failed rows (null price) sort last for both directions of `price`. Add a stable secondary sort by `Id`.
- `page` starts at 1. `pageSize` is 1..100, default 20.
- Project to a DTO inside the query (`Select`). No entity is returned.

## Tests (integration: `PriceHuntApiFactory` from T05, `GET /api/history` over HTTP)
Seed rows through `AppDbContext` in the factory's database, then call the endpoint. Assert on the JSON DTOs, not on entities.
- HS1, I4: start/end date filter applies to the search timestamp, inclusive whole UTC days.
- HS1: one, several and no `supplierIds`.
- HS2, I6: from/to location filter is case-insensitive and trims input.
- HS1, HS2: filters combined.
- I5: failed rows are returned with a null price and sort last by price, asc and desc.
- Sorting by every column, asc and desc, returns the right order (runs in SQLite, so client-side evaluation or a translation error fails the test).
- Paging: `total` is correct, pages don't overlap, the last page is partial.
- Invalid `sortBy`, `page < 1`, `pageSize` out of range → 400.
- End to end: run a search through `POST /api/search` (advance time to the end), then the same search's rows appear in `GET /api/history`.
