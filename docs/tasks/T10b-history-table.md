# T10b: History page, sorting and paging
**Reqs:** HC2

## Goal
Add server-side sorting and paging to the T10a table, and the loading skeleton.

## Design
- `MatSort` on every header and `MatPaginator` with the total count. Both only report changes: sorting and paging run on the server (T06).
  Use `matSortDisableClear`, so a header cycles asc/desc and never clears (the API always has a sort). The initial sort is
  `date desc`, matching the API default. `MatPaginator.pageIndex` starts at 0, the API's `page` at 1: convert in one place.
- A filter or sort change goes back to page 1.
- While a page loads, skeleton rows (`.skeleton-row`, T08b) replace the table body. An empty result shows a short message.
- A failed request shows an error message in place of the table body, not stale rows or the skeleton.

## Tests (Vitest, TestBed, `HttpTestingController`, `MatSortHarness`, `MatPaginatorHarness`)
- HC2: clicking each of the five headers toggles asc/desc and calls the API with the matching `sortBy`, and page 1.
- HC2: next/previous page calls the API with the new `page` (first page = `page=1`), and the total count is shown.
- HC2: changing a filter on page 3 requests page 1.
- While the request is pending, skeleton rows are shown; after the response, the rows are.
- A 500 response (`HttpTestingController` `flush` with status 500) shows the error message and no rows or skeleton.
