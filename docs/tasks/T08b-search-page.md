# T08b: Search page
**Reqs:** SC1, SC2, SC4, SC5

## Goal
The `SearchPage` component: the form, the live result list and the progress line, on top of `SearchStore` (T08a).

## Design
- `SearchPage` is the default route (`''`).
- Form: reactive forms with validators that mirror the server rules (T05b), built from Material form fields, two datepickers
  and a checkbox per supplier (ADR-0002). Suppliers come from `SuppliersApi`, all checked by default.
  At least one supplier must stay checked: the API treats an empty list as "all", which is not what the user chose.
- Each row shows supplier name (from `started`), price in USD and response time. Rows are rendered with
  `@for (r of results(); track r.supplierId)`, which T09 relies on.
- While the search runs, a skeleton row stands in for each supplier that hasn't answered yet:
  `total - responded` rows below the results. They go away when the search ends. This is the loading state, not a new feature.
  The `.skeleton-row` class is global CSS (fixed row height, shimmer, no animation under `prefers-reduced-motion`); T10b reuses it.
- Progress text: "N of M suppliers responded". Final state: "Completed" / "Timed out". An error shows `errorMessage`.

## Tests (Vitest, TestBed, `SearchStore` with the fake stream client from T08a)
- SC1: the form shows from/to location, from/to date and every supplier checked. Unchecking all of them disables Search.
- SC1: submitting starts a search with the form values; a date picked as 23 Nov is sent as `"fromDate":"2026-11-23"`.
- SC2: rows appear as events arrive, in price order.
- SC4: after a re-order, each supplier's row is the same DOM node as before (`track` reuses nodes; T09 relies on it).
- SC5: the progress line shows "N of M suppliers responded", then "Completed" or "Timed out".
- SC5: while running, the number of skeleton rows is `total - responded`; after `ended` there are none.
