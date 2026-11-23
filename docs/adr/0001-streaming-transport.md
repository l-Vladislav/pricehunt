# ADR-0001 — Streaming search results: SSE over `fetch`

**Status:** Accepted · **Reqs:** SS2, SS5, SS6, SC6

## Context
Results from up to 7 suppliers must reach the browser one by one as they arrive. The stream lasts at most 6 s.
Client cancellation (abort or a new search) must cancel the server work.
Data flows only from server to client once the search has started.

## Options considered
| Option | Pros | Cons |
|--------|------|------|
| **SSE format over `fetch` POST** (chosen) | Plain HTTP. Native .NET 10 `TypedResults.ServerSentEvents`. POST body for parameters. Abort → `HttpContext.RequestAborted` with no extra protocol. Easy to test with `HttpClient`. | Needs a ~40-line client-side SSE parser. |
| `EventSource` (classic SSE) | Built-in browser API. | GET only, so parameters go in the query string. Reconnects by itself when the stream closes, which would silently start a new search. |
| WebSockets | Full duplex | Must hand-roll framing, close handling and cancellation. Overkill for one-way data. |

## Decision
`POST /api/search` returns `text/event-stream`. The client reads it with `fetch` + `ReadableStream` and cancels with `AbortController`.

## Consequences
- Cancellation is the request lifetime itself. Disconnect, new search and tab close are all handled by one mechanism.
- Response compression and buffering must stay off for this endpoint.
- The client calls the API directly (CORS) instead of through the dev-server proxy, to rule out proxy buffering.
- The search lifetime is coupled to the connection. That is acceptable at 6 s. Long-running searches would need a job ID + resumable stream.
