# T08b: Search page
**Reqs:** SC1, SC2, SC4, SC5, SC6, SS5

## Goal
The `SearchPage` component: the form, the live result list and the progress line, on top of `SearchStore` (T08a).

## Design
- `SearchPage` is the default route (`''`), lazy-loaded: with Material in the initial bundle the build exceeds its 500 kB budget.
- It provides `SearchStore` (T08a), so leaving the page aborts the search (SS5).
- Form: reactive forms with `Validators.required` on the four fields, built from Material form fields, two datepickers
  and a supplier multi-select (T12a). The Clear button is in T12d. Suppliers come from `SuppliersApi`, all selected by default.
  At least one supplier must stay selected: the API treats an empty list as "all", which is not what the user chose.
  If the supplier list fails to load, the form shows "We're having technical issues. Please try again later." below the fields.
- The other server rules (T05b: whitespace-only location, `fromDate > toDate`) are not repeated on the client. Their 400 is shown
  as `errorMessage` (T07).
- Search stays enabled while a search runs: submitting again starts a new search and cancels the old one (SC6).
- Each row shows supplier name (from `started`) and price in USD. Rows are rendered with
  `@for (r of results(); track r.supplierId)`, which T09 relies on.
- While the search runs, a skeleton row stands in for each supplier that hasn't answered yet:
  `pending` (T08a) rows below the results. They go away when the search ends. This is the loading state, not a new feature.
  The `.skeleton-row` class is global CSS (fixed row height, shimmer, no animation under `prefers-reduced-motion`); T10b reuses it.
- Progress text: "N of M suppliers responded" while running. The timer, the final state and the bar are in T12c.
  It is shown from the click on Search, like the skeleton rows, so a new search doesn't collapse the page (SC4).
  A rejected search shows them until its error arrives. An error shows `errorMessage`.

## Tests (Vitest, TestBed, `SearchStore` with the fake stream client from T08a)
- SC1: the form shows from/to location, from/to date and every supplier selected. Deselecting all of them disables Search.
- SC1: an empty location or date disables Search.
- SC1: a location without a letter or with other symbols, equal locations, a from date before today or a to date before tomorrow
  disable Search and show a message.
- SC1: submitting starts a search with the form values; a date picked as 23 Nov is sent as `"fromDate":"2026-11-23"`.
- SC2: rows appear as events arrive, in price order.
- SC4: after a re-order, each supplier's row is the same DOM node as before (`track` reuses nodes; T09 relies on it).
- SC4: a new search keeps the progress, the bar and the length of the list before its first event, with the same DOM nodes.
- SC5: no progress line before the first search; "0 of 7 suppliers responded" after the click, before `started`;
  then "1 of 7 suppliers responded" after a quote and a failure (I1); after `ended` "5 of 7 suppliers responded" and "Timed out"
  ("6 of 7 suppliers responded" and "Completed" in a second case).
- SC6: submit, push A's `started`, click the Search button again (it is enabled) → the fake stream client got a second call and A's Subject was unsubscribed.
- The supplier list request fails (`HttpTestingController` error) → "We're having technical issues. Please try again later." is shown.
- SC5: while running, the number of skeleton rows is `pending`, so a failure also removes one; after `ended` there are none.
- SC1: the page is the default route.
- SC1: a start date after the end date is sent as entered, so the server's 400 can be shown.
- SC5: a stream error shows its message instead of the progress line and keeps the results.
- SS5: leaving the page aborts the running search. It also cancels the supplier list request.

Manual check with `npm start`: both datepickers open (tests don't load `app.config.ts`, which provides the date adapter).
