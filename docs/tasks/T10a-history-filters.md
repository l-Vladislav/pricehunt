# T10a: History page, filters and table
**Reqs:** HC1, HC2 · **Interpretations:** I5

## Goal
A `/history` route with the filters and a table of the first page. Sorting, paging and the skeleton come in T10b.

## Design
- `HistoryApi` in `core/`: `GET /api/history` with typed DTOs matching plan.md, dates sent with `toIsoDate` (T07b).
- Filters: start and end date (Material datepickers), supplier multi-select (`mat-select multiple`). Suppliers come from `SuppliersApi` (T08a).
  The location filter exists on the server (HS2) but the PDF's history screen asks only for dates and suppliers, so it isn't in the UI.
- `mat-table` with columns Date, Route ("A → B"), Supplier, Price, Response time. A failed row shows "Failed" in the Price cell (I5).
- On open the page loads page 1 with no filters: `page=1&pageSize=20&sortBy=date&sortDir=desc`. T10b keeps this request unchanged.
- Filters apply on change, only when the filter form is valid. No Apply button. A start date after the end date (form validator,
  mirrors the server's 400) sends nothing.
- Dates apply on the datepicker's `dateChange` (picker selection or leaving the field), not per keystroke: `NativeDateAdapter`
  parses partial text such as `"11/2"` as a real date. Text left in the field is applied as whatever the adapter parses.
- A link between the search and history pages.

## Tests (Vitest, TestBed, `HttpTestingController`, Material harnesses where they exist)
- HC1: the filter form has start date, end date and a supplier multi-select.
- HC1: changing a filter calls the API with the right params (`startDate=2026-11-23`, repeated `supplierIds`).
- HC1: opening the page requests exactly `page=1&pageSize=20&sortBy=date&sortDir=desc`.
- HC1: typing `11/23/2026` key by key on the raw input (`TestElement.sendKeys`) sends no request; dispatching `change` then sends
  exactly one with `startDate=2026-11-23`.
- HC1: an invalid date, or a start date after the end date, sends no request.
- HC2: the table shows the five columns.
- I5: a failed row shows "Failed" in the Price cell.
