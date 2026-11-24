# T12b: Count and show only prices
**Reqs:** SC5, HS1, HC2 · **Interpretations:** I1, I5

## Goal
A supplier that fails is not a response for the user: it is not counted in the progress and not shown on either page.
It is still stored (P2).

## Design
- `ended.responded` counts prices only (I1). The search status doesn't change: `TimedOut` only if a supplier was still pending at 6 s.
  All suppliers done, failures included, is `Completed`. With the flaky supplier failing: "Timed out" with 5 of 7 for all seven,
  "Completed" with 5 of 6 without the hanging one.
- `supplier-failed` stays in the stream: the client needs it to drop a skeleton row. The store keeps the number of failures and
  exposes `pending`, the suppliers that have neither a price nor a failure. Skeleton rows follow `pending`.
- If every supplier fails, the result list is empty and the progress line says "0 of N suppliers responded" and "Completed". There is no extra text.
- `GET /api/history` leaves out failed responses before counting, sorting and paging (I5). `price` is never null.
- The database schema doesn't change.

## Tests
The tests of T03a, T05a, T06, T08a, T08b and T10a change with the behaviour. New or stricter ones:
- I1 (orchestrator): every supplier fails → `Completed` with `responded: 0`. A failure among prices doesn't count.
- I1 (HTTP): `responded` is 5 of 7 and 5 of 6 when the flaky supplier fails.
- I5 (HTTP): failed responses are not returned, take no place on a page and are not in `total`. A search run through the stream
  shows five rows. The failure is still stored (P2, T04's test).
- I1 (store): a failure doesn't change `responded` and lowers `pending` by one. A new search resets both.
- SC5, I1 (page): every supplier fails → no rows, "0 of 7 suppliers responded" and "Completed".

Manual check with `npm start`: a search with all suppliers until the flaky one fails, one without the hanging supplier, and the history
page, which shows no failed row.
