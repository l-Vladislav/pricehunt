# T10b: History page, sorting and paging
**Reqs:** HC2

## Goal
Add server-side sorting and paging to the T10a table, and the loading skeleton.

## Design
- `MatSort` on every header and `MatPaginator` with the total count. Both only report changes: sorting and paging run on the server (T06).
  Use `matSortDisableClear`, so a header cycles asc/desc and never clears (the API always has a sort). The initial sort is
  `date desc`, matching the API default. `MatPaginator.pageIndex` starts at 0, the API's `page` at 1: convert in one place.
- A filter or sort change goes back to page 1. The page size is always 20, without a selector.
- While the filter form is invalid, sorting and paging use the last valid filters, so they match the rows on screen.
- A page past the end loads the last page instead. It happens when the user changes the page before a narrower filter's response
  arrives, or after it failed, because the paginator still has the old total.
- A sort or page change cancels a request still running, like a filter change (T10a).
- An empty result (`total: 0`) shows "No searches found".
- While a page loads, the rows on screen stay until the response replaces them, so the table does not flicker. If there are no rows
  to keep (the first load, after a failure or an empty result), 20 skeleton rows (`.skeleton-row`, T08b) stand in.
- A failed request still shows T10a's "History is unavailable, please try again later" in place of the table body, not stale rows or
  the skeleton. The paginator keeps the requested page and the last known total, so another page can be tried.

## Tests (Vitest, TestBed, `HttpTestingController`, `MatSortHarness`, `MatPaginatorHarness`)
- HC2: clicking each of the five headers toggles asc/desc and calls the API with the matching `sortBy`, and page 1.
- HC2: next/previous page calls the API with the new `page` (first page = `page=1`), and the total count is shown.
- HC2: changing a filter on page 3 requests page 1.
- HC2: the first sort is `date desc`, the page size is fixed, and rows stay in the order of the response.
- HC2: a filter change keeps the sort, a page change keeps the sort and the filters.
- HC2: with an unparseable date or a wrong date order, sorting and paging send the last valid filters.
- HC2: a page past the end (no items, `total` above 0) requests the last page.
- HC2: a sort or page change cancels the request before it.
- While the first request is pending, skeleton rows are shown; after the response, the rows are.
- After a sort, page or filter change the old rows stay, without skeleton rows, until the response replaces them.
- A 500 response (`HttpTestingController` `flush` with status 500) shows "History is unavailable, please try again later" and no rows or skeleton.
  The total stays, and the next page loads.
- An empty page (`total: 0`) shows "No searches found".
