# T08a: Search store
**Reqs:** SC2, SC3, SC5, SC6 · **Interpretations:** I1

## Goal
A signal-based `SearchStore` that runs a search through `SearchStreamClient` (T07) and holds its state. No UI yet (T08b).

## Design
- State: `searchId`, `suppliers` (from `started`), `results` (sorted by price, stable for ties), `responded`, `total`,
  `status` (`idle | running | completed | timedOut | error`; the two final values come from `ended` as-is), `errorMessage`.
- The store is provided by `SearchPage` (`providers: [SearchStore]`), not in root. Leaving the page destroys it, which aborts
  the request, and the server records `Cancelled` (SS5). Coming back starts with an empty form.
- `search(request)`: `switchMap` to the stream client, so the previous request is aborted automatically.
- **Stale guard:** each search gets a new `searchId` from `crypto.randomUUID()`, sent with the request.
  Every event, `started` included, is ignored unless its `searchId` matches. This is a second line of defence on top of `switchMap`.
- Add each result with `[...results, r].sort(byPrice)`. `Array.prototype.sort` is stable, so ties keep their arrival order.
  No binary-search insert: the list has at most 7 rows, so a full sort costs nothing and is easier to read.
  Put this reason in a one-line code comment next to the sort, so a reader doesn't "optimise" it later.
- Failed suppliers count toward progress but are not added to `results`: the list shows prices, and a failure has none.
- A small `SuppliersApi` in `core/` loads `/api/suppliers` with `HttpClient`. T08b and T10a use it.
  Add `provideHttpClient(withFetch())` to `app.config.ts`.

## Tests (Vitest, TestBed, fake stream client driven by a Subject)
- SC2, SC3: results arrive one by one and stay sorted for any arrival order.
- SC6: starting search B while A is running aborts A, and late events from A never reach the state.
- SC6: events with an old `searchId`, `started` included, fed straight to the store are ignored (tests the guard without `switchMap`).
- SC5, I1: `responded` counts both quotes and failures.
- SC5: `ended` sets the final status. A stream error sets `error` and `errorMessage`.
- SS5: destroying the store (its injector) aborts the running stream.
- `SuppliersApi` calls `/api/suppliers` under `API_BASE_URL` (`HttpTestingController`).
