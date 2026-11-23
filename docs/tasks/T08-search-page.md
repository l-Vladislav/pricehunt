# T08: Search page
**Reqs:** SC1, SC2, SC3, SC5, SC6 · **Interpretations:** I1, I2

## Goal
A signal-based `SearchStore` and a `SearchPage` component.

## Design
- Form: reactive forms with validators that mirror the server rules. Suppliers are loaded from `/api/suppliers`, all checked by default.
- Store state: `searchId`, `results` (sorted by price, stable for ties), `responded`, `total`, `status` (`idle | running | completed | timedOut | error`).
- `search$` pipeline: `switchMap` to the stream client, so the previous request is aborted automatically.
- **Stale guard:** every reducer ignores events whose `searchId` differs from the current one. This is a second line of defence on top of `switchMap`.
- Add each result with `[...results, r].sort(byPrice)`. `Array.prototype.sort` is stable, so ties keep their arrival order.
  No binary-search insert: the list has at most 7 rows, so a full sort costs nothing and is easier to read.
  Put this reason in a one-line code comment next to the sort, so a reader doesn't "optimise" it later.
- Progress text: "N of M suppliers responded". Final state: Completed / Timed out.

## Tests (Vitest, TestBed, fake stream client driven by a Subject)
- SC1: the form shows from/to location, from/to date and every supplier checked.
- SC2, SC3: results appear one by one and stay sorted for any arrival order.
- SC6: starting search B while A is running aborts A, and late events from A never appear.
- SC5, I1: progress counts both quotes and failures.
- SC5: `ended` sets the final status. A stream error sets `error`.
