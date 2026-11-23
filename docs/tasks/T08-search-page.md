# T08: Search page
**Reqs:** SC1, SC2, SC3, SC5, SC6 · **Interpretations:** I1

## Goal
A signal-based `SearchStore` and a `SearchPage` component.

## Design
- `SearchPage` is the default route (`''`). Add `provideHttpClient(withFetch())` to `app.config.ts`.
- A small `SuppliersApi` in `core/` loads `/api/suppliers` with `HttpClient`. T10 reuses it.
- Form: reactive forms with validators that mirror the server rules. All suppliers are checked by default.
  At least one supplier must stay checked: the API treats an empty list as "all", which is not what the user chose.
- Store state: `searchId`, `results` (sorted by price, stable for ties), `responded`, `total`, `status` (`idle | running | completed | timedOut | error`; the two final values come from `ended` as-is).
- `search$` pipeline: `switchMap` to the stream client, so the previous request is aborted automatically.
- **Stale guard:** on submit, the store creates a new `searchId` with `crypto.randomUUID()` and sends it with the request.
  Every event, `started` included, is ignored unless its `searchId` matches. This is a second line of defence on top of `switchMap`.
- Add each result with `[...results, r].sort(byPrice)`. `Array.prototype.sort` is stable, so ties keep their arrival order.
  No binary-search insert: the list has at most 7 rows, so a full sort costs nothing and is easier to read.
  Put this reason in a one-line code comment next to the sort, so a reader doesn't "optimise" it later.
- Failed suppliers count toward progress but are not listed: the list shows prices, and a failure has none.
- Each row shows supplier name (from `started`), price in USD and response time.
- Progress text: "N of M suppliers responded". Final state: Completed / Timed out.

## Tests (Vitest, TestBed, fake stream client driven by a Subject)
- SC1: the form shows from/to location, from/to date and every supplier checked. Unchecking all of them disables Search.
- SC2, SC3: results appear one by one and stay sorted for any arrival order.
- SC6: starting search B while A is running aborts A, and late events from A never appear.
- SC6: events with an old `searchId`, `started` included, fed straight to the store are ignored (tests the guard without `switchMap`).
- SC5, I1: progress counts both quotes and failures.
- SC5: `ended` sets the final status. A stream error sets `error`.
