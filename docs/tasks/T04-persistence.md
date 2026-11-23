# T04: Persistence
**Reqs:** P1, P2, P3 · **Interpretations:** I3, I5, I7

## Goal
EF Core + SQLite. The schema is created on startup via `Database.Migrate()` (migrations are committed).
`EfSearchRecorder : ISearchRecorder` records the search, every response, and the final status.

## Design
- Entities and tables as in plan.md, "Data model".
- Price is stored as `long PriceMinor` (USD cents). Times are stored as UTC `DateTime` (see the spec.md §3 notes for why).
- Enums are stored as strings, so the DB stays readable.
- The recorder uses its own `DbContext` via `IDbContextFactory<AppDbContext>`. The context is never shared across threads.
- Write the search row at start (`Status = Running`). Insert responses as they arrive. Finalize with `CancellationToken.None`.

## Acceptance criteria
- Delete `pricehunt.db` → `dotnet run` recreates it.
- A cancelled request still produces `Status = Cancelled` in the DB.

## Tests (integration: real `SearchOrchestrator` + `EfSearchRecorder` + SQLite in-memory with a kept-open connection, real migrations)
Suppliers are the real `SimulatedSupplier`s with FakeTimeProvider and a fixed random source.
- P3: migrations apply to an empty database and create every table from plan.md.
- P1, P2, I3: a full search (all 7) persists the search with its parameters and selected suppliers, `Status = TimedOut`, and one response row per supplier that answered (Success / Failed). The hanging supplier has no row (I3).
- P2, I5: the failure row has `Outcome = Failed`, a null price and a response time.
- I7: cancel the caller token mid-search → `Status = Cancelled` (finalize used `CancellationToken.None`), and suppliers still pending have no rows.
