# T10a: History page, filters and table
**Reqs:** HC1, HC2 · **Interpretations:** I4, I5

## Goal
A `/history` route with the filters and a table of the first page. Sorting, paging and the skeleton come in T10b.

## Design
- `HistoryApi` in `core/`: `GET /api/history` with typed DTOs matching plan.md.
- The filter days are the user's local days (I4). `startDate` is the local midnight of the start day and `endDate` the local
  midnight of the day after the end day (`new Date(y, m, d + 1)`), both sent with `toISOString()`.
- Filters: start and end date (Material datepickers), supplier multi-select (`mat-select multiple`). Suppliers come from `SuppliersApi` (T08a).
  The location filter exists on the server (HS2) but the PDF's history screen asks only for dates and suppliers, so it isn't in the UI.
- `mat-table` with columns Date, Route ("A → B"), Supplier, Price, Response time. Date is the UTC `date` from the API shown in
  local time with `DatePipe` (`yyyy-MM-dd HH:mm`). A failed row shows "Failed" in the Price cell (I5).
- On open the page loads page 1 with no filters: `page=1&pageSize=20&sortBy=date&sortDir=desc`. T10b keeps this request unchanged.
- Filters apply on change, only when the filter form is valid. No Apply button. A start date after the end date (form validator,
  mirrors the server's 400) sends nothing.
- Dates apply on the datepicker's `dateChange` (picker selection or leaving the field), not per keystroke: `NativeDateAdapter`
  parses partial text such as `"11/2"` as a real date. Text left in the field is applied as whatever the adapter parses.
- A link between the search and history pages.

## Tests (Vitest, TestBed, `HttpTestingController`, Material harnesses where they exist)
- HC1: the filter form has start date, end date and a supplier multi-select.
- HC1, I4: picking Nov 23 as start and end date calls the API with `startDate` = `new Date(2026, 10, 23).toISOString()` and
  `endDate` = `new Date(2026, 10, 24).toISOString()` (in CI's `Asia/Jerusalem`: `2026-11-22T22:00:00.000Z` and
  `2026-11-23T22:00:00.000Z`). Picking suppliers sends repeated `supplierIds`.
- HC1: opening the page requests exactly `page=1&pageSize=20&sortBy=date&sortDir=desc`.
- HC1: typing `11/23/2026` key by key on the raw input (`TestElement.sendKeys`) sends no request; dispatching `change` then sends
  exactly one, with `startDate` = `new Date(2026, 10, 23).toISOString()`.
- HC1: typing `abc` into the start date and dispatching `change` sends no request (the `matDatepickerParse` error makes the
  form invalid); a start date after the end date sends none either.
- HC2: the table shows the five columns.
- I5: a failed row shows "Failed" in the Price cell.
- I4: a row with `date: "2026-11-23T22:30:00Z"` shows the local time of that instant (built from `new Date(...)` getters in the
  test). In CI's `Asia/Jerusalem` that is `2026-11-24 00:30`, so showing UTC fails the test.
