# PriceHunt

Shipping-price search across seven simulated suppliers. Prices appear as each supplier answers, cheapest first.
Every search is saved, and past prices can be filtered on the history screen.

## How to run

Prerequisites: .NET 10 SDK, Node.js 22.22.3+ or 24.15+ (required by Angular 22). Both terminals start in the repo root.

```bash
# terminal 1: API on http://localhost:5080 (SQLite DB is created on first run)
dotnet run --project server/PriceHunt.Api

# terminal 2: UI on http://localhost:4142 (installs packages on first run)
npm start --prefix client
```

Tests: `dotnet test --solution server/PriceHunt.sln` in the repo root, `npm test -- --watch=false` in `client/`.

## Streaming: how and why

`POST /api/search` answers with a Server-Sent Events stream (`text/event-stream`). The server uses `TypedResults.ServerSentEvents`
from .NET 10. The client reads the response with `fetch` and cancels with `AbortController`.

| Event | Meaning |
|-------|---------|
| `started` | The search began. Carries the list of selected suppliers. |
| `quote` | A supplier answered with a price. |
| `supplier-failed` | A supplier failed. The others go on. |
| `ended` | The search is over, `completed` or `timedOut`, with the number of suppliers that responded. |

Why this way:
- Data flows in one direction only, so plain HTTP is enough.
- Cancellation needs no protocol of its own. Aborting the request fires `HttpContext.RequestAborted`, which is linked with the 6 s
  timeout and passed to every supplier call. A new search, leaving the page and a closed tab all work the same way.
- The client creates the `searchId` and every event carries it, so an event of an old search is dropped even if it arrives late.

What I rejected:
- `EventSource`: GET only, and it reconnects when the stream closes, which would silently start the search again.
- WebSockets: two-way, with framing, close handling and cancellation to write by hand for one-way data.

The price of this choice is a small SSE parser in the client, and a search that lives only as long as its connection.
That is fine for 6 s. The full decision is in [ADR-0001](docs/adr/0001-streaming-transport.md).

On the server, each selected supplier runs as its own task. One loop takes the results in completion order (`Task.WhenEach`),
saves each one and then streams it. Supplier tasks never touch the database. Details and diagrams are in
[plan.md](docs/plan.md#concurrency-model).

## Database and table structure

SQLite through EF Core. The migrations run on startup, so `server/PriceHunt.Api/pricehunt.db` is created on the first run.

```mermaid
erDiagram
    Searches ||--|{ SearchSuppliers : "was sent to"
    Suppliers ||--o{ SearchSuppliers : "was selected in"
    Searches ||--o{ SupplierResponses : "received"
    Suppliers ||--o{ SupplierResponses : "gave"

    Suppliers {
        text Id PK
        text Name
    }
    Searches {
        guid Id PK "created by the client"
        text FromLocation
        text ToLocation
        date FromDate
        date ToDate
        datetime CreatedAtUtc "indexed"
        text Status "Running, Completed, TimedOut, Cancelled"
    }
    SearchSuppliers {
        guid SearchId PK, FK
        text SupplierId PK, FK
    }
    SupplierResponses {
        integer Id PK
        guid SearchId FK
        text SupplierId FK
        integer PriceMinor "USD cents, null if the supplier failed"
        integer ResponseTimeMs
        datetime ReceivedAtUtc
    }
```

- `Suppliers` is seeded with the seven suppliers.
- `Searches` has one row per search. Its status is `Running` until the search ends, then one of the three final ones.
- `SearchSuppliers` lists the suppliers the user selected.
- `SupplierResponses` has one row per answer, failures included. The history reads this table joined with `Searches` and `Suppliers`.

The diagram shows logical types. SQLite stores guids, dates and times as text. Prices are integer cents: exact, and sorted as plain integers.
Times are UTC `DateTime`, because EF Core's SQLite provider can't sort by `DateTimeOffset`.
Besides the index on `CreatedAtUtc` for the history date filter, there are only EF's default ones on the foreign keys.

## Design decisions and trade-offs

### Ambiguous points
Where the assignment leaves room, these are my decisions. The other IDs (`S*`, `SS*`, `HC*`, `P*`, `D*`) are requirements in [spec.md](docs/spec.md).

| # | Question | Decision | Why |
|---|----------|----------|-----|
| I1 | What does "responded" mean in "N of M responded"? | Success **or** failure counts as responded. A supplier still pending at the deadline does not, and neither does one whose answer the search had not taken yet because it was still saving an earlier answer (I3). | The user wants to know how many suppliers are done. |
| I2 | With all 7 selected, the never-responding supplier makes every search end as `TimedOut`. Is that a bug? | Expected. `Completed` is only possible when that supplier (Lantern Express) is deselected. | Follows from S4 + SS3. |
| I3 | What is recorded for suppliers that had not answered when the search ended? | Nothing. Only real responses (success or failure) are stored. An answer that arrived before the deadline but that the search had not taken yet, because it was still saving an earlier answer of the same search, is dropped like a late one: not stored, not streamed, not counted. Which suppliers were asked is stored with the search (P1). | P2 asks for every *response*. No answer means no response. Waiting for queued writes would push the end of the search past the 6 s deadline (SS3). |
| I4 | Which date do the history "start date / end date" filters apply to? | The **search timestamp** (when the search ran). Days are the user's local days, and the table shows local time. | The PDF's "return later and filter the history" is about when prices were seen. |
| I5 | Do failed responses appear in the history table? | Yes, in the same five columns (HC2). The Price cell shows "Failed". Sorting by price always puts failures last. | P2 records failures. Showing them needs no extra column. |
| I6 | Location format | Free text, trimmed, case-insensitive match in history. | The PDF has no list of locations. |
| I7 | Search status when the client disconnects | `Cancelled`, saved with a token that is not the request token. | The request token is already cancelled at that point. |
| I8 | One command per project with "no special setup or installation" (D1) vs. the .NET 10 / Angular 22 choice | Prerequisites are the .NET 10 SDK and Node.js 22.22.3+/24.15+. The run commands install npm packages and create the DB. | The PDF allows .NET 8+ / Angular 17+. The README lists the prerequisites first. |

### Main decisions
**A result is saved before it is streamed.** Every price the user saw is in the history. The cost is that a slow write delays the event.
Search writes ignore the request's cancellation, so a started write is finished and a cancelled search still gets its status.

**Angular Material for the UI.** Form fields, datepicker, table, sort headers and paginator come from the library.
Sorting and paging themselves run in SQL. The cost is one dependency and a theme.
Only what Material doesn't have is written by hand: the animation that moves result rows to their new
places (FLIP) and the skeleton rows. On the search page the skeletons are as high as the result rows, so the list doesn't jump.
See [ADR-0002](docs/adr/0002-ui-components.md).

**SQLite has one writer.** Several searches can run at once, and each saves its responses one by one.
SQLite lets only one connection write at a time, and the others retry with pauses. In a load test before implementation,
10 parallel searches ended at 7.4 s instead of 6 s, and with 100, 16 of 600 responses that arrived in time were lost.
So the recorder sends its writes through one `SemaphoreSlim` and they queue in memory instead. That brought the numbers to 6.05 s
and 600 of 600, and 400 parallel searches still ended by 6.7 s. This is a SQLite workaround:
a server database such as SQL Server or PostgreSQL handles concurrent writers itself and would not need it.
It also only works inside one process.

### Known limits
- If the server dies during a search, its status stays `Running`.
- Two requests that use one `searchId` at the same moment both pass the check for a reused id. The second one fails on
  the primary key instead of getting a 400.
- A timeout that fires while the last result is being saved ends as `Completed`, because every result arrived in time.
- The case-insensitive location match in the history covers ASCII letters only (SQLite's `NOCASE`).

## What I would do differently
- Suppliers per route. Real carriers serve some routes and not others, so the supplier list would depend on the from and to
  location. The assignment has the same seven suppliers for every route, and this project follows it.
- A server database, such as PostgreSQL, for real load. The write gate would go away, and several instances could run.
- Indexes for the location filter, if the history grows. It needs an index with the `NOCASE` collation, because a plain one is not
  used for that comparison.
- On startup, close the searches a crashed server left as `Running`.
- A few end-to-end tests in a real browser. The client tests run in jsdom, which has no layout, so the smooth
  re-ordering is tested only with stubbed measurements.
- If searches took minutes instead of seconds: a job id and a stream the client can resume, so a lost connection doesn't lose the search.

## Where AI was used

Tool: Claude Code with the Claude Opus 5.5 model, in the terminal and in VS Code.

| Where | What AI did |
|-------|-------------|
| Planning | Drafted the spec, the plan, the task files and the agent rules from my breakdown of the assignment. Wrote the CI workflow and the PR template. Compared UI options. Built the risky parts in throwaway spikes. |
| Server and client code | Wrote the code and the tests, one task at a time, failing tests first. |
| Checking | Broke the code on purpose to see that a test fails. Checked pages in Chrome against the running API. A second agent reviewed the tasks' diffs against the spec. |
| Documentation | Drafted this README, ADR-0002 and the PR descriptions. |

I chose the architecture, the streaming transport and the answers to the ambiguous points, approved the commits (for some tasks in advance), and
reviewed and merged the PRs. [docs/ai-usage.md](docs/ai-usage.md) has a row per task with what the agent did and what I did or changed.
Rules for the coding agent are in [`AGENTS.md`](AGENTS.md).
