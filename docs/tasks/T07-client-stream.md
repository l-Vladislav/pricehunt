# T07: Client stream client
**Reqs:** SC2, SC6 · ADR-0001

## Goal
`SearchStreamClient.search(request): Observable<SearchEvent>`. The request includes the `searchId` created by the caller.
`SearchEvent` is a union tagged by the SSE event name, with the payloads from the plan.md table:
`{ type: "started", data: … } | { type: "quote", data: … } | { type: "supplier-failed", data: … } | { type: "ended", data: … }`.
It uses `fetch` with POST and parses the SSE `ReadableStream`. Unsubscribe → `AbortController.abort()`.

## Design
- `API_BASE_URL` injection token set to `http://localhost:5080` (in `core/`, used by every API call from here on).
- `fetch` comes from a `FETCH` injection token. The default factory is `() => globalThis.fetch.bind(globalThis)`: calling an unbound
  `fetch` as `this.fetch(...)` throws "Illegal invocation" in browsers, while Node doesn't check, so a test has to check `this` itself.
  Tests provide a small hand-written fake, no mocking library.
- A pure SSE parser `parseSse(buffer) → { events, rest }`. The caller keeps `rest` and prepends it to the next chunk.
  It handles events split across chunks, several events in one chunk, and `\r\n`.
- The Observable errors on non-2xx and completes when the stream ends. The error message is the first message of the first field
  in the ProblemDetails `errors` map, else its `title`, else `HTTP <status>`. A body that is not JSON also gives `HTTP <status>`.
  A rejected `fetch` (API not running) errors with "We're having technical issues. Please try again later.". A read that fails mid-stream errors with "Connection lost".
- Do **not** use `EventSource`: it is GET-only and auto-reconnects, which would restart the search.

## Tests (Vitest)
Delete `client/src/app/app.spec.ts` once these exist.
- SC2: the parser handles all three chunking cases, and each event is emitted as soon as its chunk is read.
- SC2: several events in one chunk are all emitted, and events split across chunks, also inside a character, are emitted once.
- SC2: subscribing, not calling `search()`, sends one POST with the JSON request to `/api/search` under `API_BASE_URL`.
- SC2: the default `FETCH` calls the global `fetch` with `this` set to `globalThis`, also when called as a method of another object.
- SC6: unsubscribing calls `abort()`, before the response and mid-stream, and leaves another running search alone.
- A non-2xx response → Observable error with the message, for each case: `errors` present, only `title`, JSON without both, a body that is not JSON.
- A rejected `fetch` → Observable error with "We're having technical issues. Please try again later.". A body whose reader rejects mid-stream → "Connection lost".
