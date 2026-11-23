# T08: Search page
**Reqs:** SC1, SC2, SC3, SC5, SC6 · **Interpretations:** I1, I2

## Goal
A signal-based `SearchStore` and a `SearchPage` component.

## Design
- Form: reactive forms with validators that mirror the server rules. Suppliers are loaded from `/api/suppliers`, all checked by default.
- Store state: `searchId`, `results` (sorted by price, stable for ties), `responded`, `total`, `status` (`idle|running|Completed|TimedOut|error`).
- `search$` pipeline: `switchMap` to the stream client, so the previous request is aborted automatically.
- **Stale guard:** every reducer ignores events whose `searchId` differs from the current one. This is a second line of defence on top of `switchMap`.
- Insert new results with a binary-search insert into a new array. Don't re-sort the whole list.
- Progress text: "N of M suppliers responded". Final state: Completed / Timed out.

## Tests (Vitest, TestBed, fake stream client driven by a Subject)
- Results stay sorted for any arrival order.
- Starting search B while A is running: late events from A never appear.
- Progress counts both quotes and failures.
- `ended` sets the final status. A stream error sets `error`.
