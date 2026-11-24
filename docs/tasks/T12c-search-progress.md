# T12c: Progress bar and elapsed time
**Reqs:** SC2, SC5 · **Interpretations:** I1

## Goal
Show on the search page how far a search is and how it ended. The stream, the store and the server don't change.

## Design
- One progress line: "N of M suppliers responded" on the left, the state on the right, a bar below.
- While the search runs the state is the elapsed time with one decimal ("4.2 s"). It starts at 0.0 for each search, also when one
  search replaces another, and is read from `performance.now()`, not counted in ticks: a background tab delays them.
- After `ended` the state is "Completed" or "Timed out". It comes from the event, never from the timer.
- The bar is a determinate `mat-progress-bar` at `responded / total`, so it matches the text and a failure doesn't move it (I1).
  It stays after the search ended, so the list doesn't jump (SC4).
- Before `started` and after an error there is no progress line.
- Screen readers hear the count and the final state (`role="status"`), not the timer (`role="timer"`).
- A result row shows only the supplier and the price. The response time is in the history (HC2).

## Tests (Vitest, TestBed, `MatProgressBarHarness`)
- SC5, I1: the count, the state and the bar for a search that ends as `timedOut` and one that ends as `completed`.
- SC5: no line before `started`, none after an error.
- SC5: the timer shows the elapsed time, also after a late tick, and passing 6 s doesn't end the search.
- SC5: the timer stops on `ended`, on an error and when the page is left. It starts again at 0.0 for a search that replaces another.
- SC5: the count and the final state are in `role="status"`, the timer is not.
- SC2: a row has the supplier and the price.

Manual check with `npm start`: the line and the bar in a search with all suppliers and one without the hanging supplier.
The list doesn't move when the search ends.
