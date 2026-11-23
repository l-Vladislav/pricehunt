# T10a: History page, filters and table
**Reqs:** HC1, HC2 · **Interpretations:** I5

## Goal
A `/history` route with the filters and a table of the first page. Sorting, paging and the skeleton come in T10b.

## Design
- `HistoryApi` in `core/`: `GET /api/history` with typed DTOs matching plan.md, dates sent with `toIsoDate` (T07b).
- Filters: start and end date (Material datepickers), supplier multi-select (`mat-select multiple`). Suppliers come from `SuppliersApi` (T08a).
  The location filter exists on the server (HS2) but the PDF's history screen asks only for dates and suppliers, so it isn't in the UI.
- `mat-table` with columns Date, Route ("A → B"), Supplier, Price, Response time. A failed row shows "Failed" in the Price cell (I5).
- On open the page loads page 1 with no filters. Filters apply on change, only when the filter form is valid: a half-typed date
  or a start date after the end date (form validator, mirrors the server's 400) sends nothing. No Apply button.
- A link between the search and history pages.

## Tests (Vitest, TestBed, `HttpTestingController`, Material harnesses where they exist)
- HC1: the filter form has start date, end date and a supplier multi-select.
- HC1: changing a filter calls the API with the right params (`startDate=2026-11-23`, repeated `supplierIds`).
- HC1: opening the page requests page 1 with no filters.
- HC1: an invalid date, or a start date after the end date, sends no request.
- HC2: the table shows the five columns.
- I5: a failed row shows "Failed" in the Price cell.
