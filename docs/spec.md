# PriceHunt: requirements

Requirements from the assignment PDF (not committed). Each one has an ID that tasks, tests and commits refer to.

## 1. Requirements

### Suppliers (simulated)
- **S1** Seven suppliers behind one common interface. No real network calls.
- **S2** Each supplier responds after a random delay of 0.5–5 s with a random price.
- **S3** One supplier fails ~30% of the time.
- **S4** One supplier never responds.

### Search: server
- **SS1** Search endpoint accepts: from/to location, from/to date, list of suppliers (default: all).
- **SS2** Each supplier response is streamed to the client as soon as it arrives. Never wait for all.
- **SS3** A search lasts at most 6 s. At the limit: finish gracefully with what was collected and tell the client the search ended.
- **SS4** A supplier failure must not affect other suppliers.
- **SS5** Client cancellation (disconnect or new search) stops server work. Cancellation propagates into supplier calls.
- **SS6** The streaming approach and its reasoning are explained in the README.

### Search: client
- **SC1** Search form: from/to location, from/to date, supplier list with all selected by default.
- **SC2** Results appear progressively.
- **SC3** List stays sorted cheapest → most expensive as results arrive.
- **SC4** No visible flicker or jumping while re-ordering.
- **SC5** Progress indicator ("5 of 7 suppliers responded") with a clear final state ("Completed" / "Timed out").
- **SC6** Starting a new search cancels the previous one. A result of an old search never appears in the new one, even if it arrives late.

### Persistence
- **P1** Persist every search: parameters (from/to location, from/to date, selected suppliers), timestamp, final status (Completed / TimedOut / Cancelled).
- **P2** Persist every supplier response linked to its search: supplier, price, response time, timestamp. Failures are recorded too.
- **P3** EF Core + SQLite. Schema is created automatically on first run.

### History: server
- **HS1** History endpoint filters by start date, end date, and a list of suppliers (one, several, all).
- **HS2** History can also be filtered by from/to location.

### History: client
- **HC1** Separate history screen: start date, end date, multi-select suppliers.
- **HC2** Table columns: Date, Route, Supplier, Price, Response Time. Sortable by every column. Paginated.

### Submission
- **D1** Git repo with two projects. One command to run each, no extra setup.
- **D2** README: how to run, how/why streaming was chosen, DB and table structure, design decisions and trade-offs, what I would do differently, where AI was used.
- **D3** .NET 8+ and Angular 17+.
- **D4** The README says which AI tools were used and where.

## 2. Interpretations of ambiguous points

Where the PDF is ambiguous, these are my decisions. The README repeats them.

| # | Question | Decision | Why |
|---|----------|----------|-----|
| I1 | What does "responded" mean in "N of M responded"? | Success **or** failure counts as responded. A supplier still pending at the deadline does not. | The user wants to know how many suppliers are done. |
| I2 | With all 7 selected, the never-responding supplier makes every search end as `TimedOut`. Is that a bug? | Expected. `Completed` is only possible when that supplier is deselected. | Follows from S4 + SS3. |
| I3 | What is recorded for suppliers that had not answered when the search ended? | Nothing. Only real responses (success or failure) are stored. Which suppliers were asked is stored with the search (P1). | P2 asks for every *response*. No answer means no response. |
| I4 | Which date do the history "start date / end date" filters apply to? | The **search timestamp** (when the price was obtained). | The PDF's "return later and filter the history" is about when prices were seen. |
| I5 | Do failed responses appear in the history table? | Yes, in the same five columns (HC2). The Price cell shows "Failed". Sorting by price always puts failures last. | P2 records failures. Showing them needs no extra column. |
| I6 | Location format | Free text, trimmed, case-insensitive match in history. | The PDF has no list of locations. |
| I7 | Search status when the client disconnects | `Cancelled`, saved with a token that is not the request token. | The request token is already cancelled at that point. |
| I8 | One command per project with "no special setup or installation" (D1) vs. the .NET 10 / Angular 22 choice | Prerequisites are the .NET 10 SDK and Node.js 22.22+/24.15+. The run commands install npm packages and create the DB. | The PDF allows .NET 8+ / Angular 17+. The README lists the prerequisites first. |

## 3. Technical choices
- Target: .NET 10 (LTS) via `global.json` in the repo root. Angular 22 (standalone, signals, zoneless).
- API listens on `http://localhost:5080`. Client on `http://localhost:4200`. CORS allows the client origin.
- SQLite file `pricehunt.db` in the API content root. Not committed.
- Prices: one currency (USD), stored as integer minor units (cents). Reason: EF Core's SQLite provider cannot translate ORDER BY on `decimal`.
- Timestamps are stored as UTC `DateTime`. Reason: EF Core's SQLite provider cannot translate ordering or comparisons on `DateTimeOffset`.
