# T10: History page
**Reqs:** HC1, HC2 · **Interpretations:** I4, I5

## Goal
A `/history` route with filters and a server-sorted, server-paged table.

## Design
- Filters: start date, end date, supplier multi-select (HC1).
- Table columns: Date, Route ("A → B"), Supplier, Price, Response time (HC2). A failed row shows "Failed" in the Price cell (I5). Every header toggles the sort.
- A paging control with the total count. Loading and empty states.

## Tests
- Changing a filter resets to page 1 and calls the API with the correct params.
- HC2: clicking each of the five headers toggles asc/desc and calls the API with the matching `sortBy`.
- HC2: next/previous page calls the API with the new `page`, and the total count is shown.
- HC1: the filter form has start date, end date and a supplier multi-select.
