# ADR-0002: Angular Material for UI components, FLIP and skeletons written by hand

**Status:** Accepted · **Reqs:** SC1, SC4, SC5, HC1, HC2

## Context
The client needs a search form with two dates and a supplier list (SC1), a live result list that doesn't jump (SC4),
progress (SC5), and a history screen with date filters, a supplier multi-select and a table sortable by every column with paging (HC1, HC2).
Sorting and paging run on the server (T06), so the table only has to show a page and report sort and page changes.

## Options considered
| Option | Pros | Cons |
|--------|------|------|
| **Angular Material + CDK** (chosen) | The official Angular component library. `mat-table` with `MatSort` and `MatPaginator` works with server-side sorting and paging. Datepicker and multi-select out of the box. Accessible. Component harnesses make tests independent of the DOM. | One dependency and a theme to set up. |
| Everything by hand | No dependency. | A table, sort headers, pager, datepicker and multi-select to write, test and make accessible. Code a reviewer has to read that the framework already provides. |

## Decision
Use `@angular/material` and `@angular/cdk` (same major version as Angular) for form fields, datepicker, select, buttons, table, sort and paginator.
Write by hand what Material doesn't have:
- FLIP re-ordering of the result list (T09).
- Skeleton rows in plain CSS: on the search page for suppliers that haven't answered yet, and in the history table while a page loads and there are no rows to keep.
  They are the form of the loading states the plan already has, not a new feature.

## Consequences
- Setup is its own small task (T07b), so the generated `ng add` changes don't mix with feature code.
- Tests use Material component harnesses (`MatSortHarness`, `MatPaginatorHarness`, ...) where they exist.
- The skeleton rows have the same fixed height as result rows, which also keeps the list from jumping (SC4).
