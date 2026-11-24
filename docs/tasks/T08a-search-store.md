# T08a: Search store
**Reqs:** SC2, SC3, SC4, SC5, SC6, SS5 · **Interpretations:** I1

## Goal
A signal-based `SearchStore` that runs a search through `SearchStreamClient` (T07) and holds its state. No UI yet (T08b).

## Design
- State: `searchId`, `suppliers` (from `started`), `results` (sorted by price, stable for ties), `responded`, `pending`, `total`,
  `status` (`idle | running | completed | timedOut | error`; the two final values come from `ended` as-is), `errorMessage`.
- The store is provided by `SearchPage` (`providers: [SearchStore]`), not in root. Leaving the page destroys it, which aborts
  the request, and the server records `Cancelled` (SS5). Coming back starts with an empty form.
- `search(request)`: `switchMap` to the stream client, so the previous request is aborted automatically.
  It first resets the state for the new search: new `searchId`, `results` and `suppliers` empty, `responded` 0,
  `total` and `pending` the number of suppliers in the request, so the page doesn't collapse while it waits for `started` (SC4),
  `status` `running`, no `errorMessage`. Only then is the request sent. `started` sets `total` to the number of suppliers it lists.
- A stream error is caught inside the `switchMap` projection (`catchError` on the inner Observable) and turned into the
  `error` state. Otherwise the error ends the outer subscription and every later `search()` does nothing.
  A stream that completes without `ended` also ends in `error` with the message "Search ended unexpectedly", so the page never stays `running`.
  The status from `ended` is final: a stream error after it changes nothing.
- **Stale guard:** each search gets a new `searchId` from `crypto.randomUUID()`, sent with the request.
  Every event, `started` included, is ignored unless its `searchId` matches. This is a second line of defence on top of `switchMap`.
- Add each result with `[...results, r].sort(byPrice)`. `Array.prototype.sort` is stable, so ties keep their arrival order.
  No binary-search insert: the list has at most 7 rows, so a full sort costs nothing and is easier to read.
  Put this reason in a one-line code comment next to the sort, so a reader doesn't "optimise" it later.
- `responded` is the number of results: only a price counts (I1). A failed supplier is not shown. It only leaves one supplier less in
  `pending` (`total` minus the prices and failures).
- A small `SuppliersApi` in `core/` loads `/api/suppliers` with `HttpClient`. T08b and T10a use it.
  Nothing to add to `app.config.ts`:
  Angular 22 provides `HttpClient` in root, on `fetch` by default.

## Tests (Vitest, TestBed, fake stream client driven by a Subject)
The fake stream client creates one Subject per call and keeps them all, so a test can check that A's was unsubscribed and can
push events tagged with an old `searchId` into B's Subject.
- SC2, SC3: results arrive one by one and stay sorted for any arrival order.
- SC3, SC4: two quotes with the same price arrive as `s2`, then `s1`, and stay in that order (a comparator that breaks ties by id
  or name fails this).
- SC6: starting search B while A is running aborts A, and late events from A never reach the state.
- SC6: after A delivered a quote, starting B empties `results` and resets `responded` and `pending` before any event of B arrives.
- SC4: `total` is the number of suppliers in the request, also when the previous search asked more. Without a list it comes from `started`.
- SC6: events with an old `searchId`, `started` included, pushed into B's Subject are ignored (tests the guard
  without `switchMap`).
- SC5, I1: `responded` counts only quotes. A failure leaves one supplier less in `pending`, and so does a quote.
- SC5: `ended` sets the final status, and it stays after the stream then completes (no `errorMessage`): T07's client always
  completes after `ended`. It also stays when the stream errors after `ended`. A stream error before it sets `error` and
  `errorMessage`. A stream that completes without `ended` sets `error` and "Search ended unexpectedly".
- SC5: after a stream error, a new `search()` runs and its events update the state.
- SS5: destroying the store (its injector) aborts the running stream.
- SC5: the status is `idle` before the first search. SC2: the request carries the form values and the new `searchId`.
- SC6: the state is reset before the request is sent.
- `SuppliersApi` calls `/api/suppliers` under `API_BASE_URL` (`HttpTestingController`).
