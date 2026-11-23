# T07: Client stream client
**Reqs:** SC2, SC6 · ADR-0001

## Goal
`SearchStreamClient.search(request): Observable<SearchEvent>`.
It uses `fetch` with POST and parses the SSE `ReadableStream`. Unsubscribe → `AbortController.abort()`.

## Design
- A pure SSE parser (`parseSse(chunk) → events`) that handles events split across chunks, several events in one chunk, and `\r\n`.
- The Observable errors on non-2xx (surfacing ProblemDetails) and completes when the stream ends.
- Do **not** use `EventSource`: it is GET-only and auto-reconnects, which would restart the search.

## Tests (Vitest)
- SC2: the parser handles all three chunking cases, and each event is emitted as soon as its chunk is read.
- SC6: unsubscribing calls `abort()`.
- A non-2xx response → Observable error with the message.
