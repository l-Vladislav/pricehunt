# T04: Persistence
**Reqs:** P1, P2, P3 · **Interpretations:** I3, I5, I7

## Goal
EF Core + SQLite. The schema is created on startup via `Database.Migrate()` (migrations are committed).
`EfSearchRecorder : ISearchRecorder` (interface from T03) records the search, every response, and the final status.

## Design
- Entities and tables as in plan.md, "Data model". `Suppliers` is seeded from the catalog with `HasData`.
- Price is stored as `long PriceMinor` (USD cents). Times are stored as UTC `DateTime` (see the spec.md §3 notes for why).
- SQLite returns `DateTime` with `Kind = Unspecified`. A value converter in `ConfigureConventions` marks every `DateTime` as UTC on read,
  so the JSON gets a `Z` and the browser shows the right time.
- Enums are stored as strings, so the DB stays readable.
- The recorder uses its own `DbContext` via `IDbContextFactory<AppDbContext>`. The context is never shared across threads.
- Write the search row in `StartAsync` (`Status = Running`). Insert responses as they arrive, before they are streamed.
  Response inserts and the final status use `CancellationToken.None` (see plan.md, "Concurrency model").
- Connection string: `ConnectionStrings:Default` from configuration. When it is not set, `Data Source=<ContentRootPath>/pricehunt.db`,
  so the file lands in the API folder whatever the working directory is.

## Test setup
Extend `PriceHuntApiFactory` (T01): set `ConnectionStrings:Default` to a shared-cache in-memory database with a unique name
(`Data Source=test-<guid>;Mode=Memory;Cache=Shared`) and keep one connection open for the factory's lifetime, so the DB survives.
Also swap in `FakeTimeProvider` and the sequence `IRandomSource`. Each test creates its own factory.
This keeps the T01 smoke test off the real `pricehunt.db` once `Migrate()` runs on startup.

## Acceptance criteria
- Delete `pricehunt.db` → `dotnet run` recreates it.
- A cancelled request still produces `Status = Cancelled` in the DB.

## Tests (integration: `SearchOrchestrator` and `EfSearchRecorder` resolved from the factory's services, no HTTP)
- P3: migrations apply to an empty database and create every table from plan.md.
- P1, P2, I3: a full search (all 7) persists the search with its parameters and selected suppliers, `Status = TimedOut`, and one response row per supplier that answered (Success / Failed). The hanging supplier has no row (I3).
- P2, I5: the failure row has `Outcome = Failed`, a null price and a response time.
- I7: cancel the caller token mid-search → `Status = Cancelled` (finalize used `CancellationToken.None`), and suppliers still pending have no rows.
- Times read back from the DB have `Kind = Utc`.
