# T04: Persistence
**Reqs:** P1, P2, P3 · **Interpretations:** I3, I5, I7

## Goal
EF Core + SQLite. The schema is created on startup via `Database.Migrate()` (migrations are committed).
`EfSearchRecorder : ISearchRecorder` (interface from T03a) records the search, every response, and the final status.

## Design
- Entities and tables as in plan.md, "Data model". `Suppliers` is seeded from the catalog with `HasData`.
- Price is stored as `long PriceMinor` (USD cents). Times are stored as UTC `DateTime` (see the spec.md §3 notes for why).
- SQLite returns `DateTime` with `Kind = Unspecified`. A value converter in `ConfigureConventions` marks every `DateTime` as UTC on read,
  so the JSON gets a `Z` and the browser shows the right time. Use `DateTime.SpecifyKind(v, DateTimeKind.Utc)`: `ToUniversalTime()`
  treats the value as local time and shifts it by the machine's offset.
- Without `TZ`, CI runs in UTC, where that shift is zero. This task sets `TZ: Asia/Jerusalem` once for the whole workflow (top-level `env:` in
  `.github/workflows/ci.yml`), so a local-time bug fails the tests in CI too.
- Enums are stored as strings, so the DB stays readable.
- The recorder uses its own `DbContext` via `IDbContextFactory<AppDbContext>`. The context is never shared across threads.
- All recorder writes go through one `SemaphoreSlim(1, 1)` held by the singleton recorder. SQLite has one writer; without
  the gate, concurrent searches retry on the locked file and responses reach the client seconds late or miss the deadline
  (measured in the spike, see plan.md). A server database would not need this; the README says so.
  No automated test covers the gate: the in-memory test database has no file lock, so 20 parallel searches pass without it
  (checked in the spike). The PR states this.
- Write the search row in `StartAsync` (`Status = Running`). Insert responses as they arrive, before they are streamed.
  Every write, the search row included, uses `CancellationToken.None` (see plan.md, "Concurrency model").
- Connection string: `ConnectionStrings:Default` from configuration. When it is not set, `Data Source=<ContentRootPath>/pricehunt.db`,
  so the file lands in the API folder whatever the working directory is. Read it inside `AddDbContextFactory((sp, options) => ...)`,
  not before `Build()`: only then does the test factory's override apply.
- DI: `AddDbContextFactory<AppDbContext>`, `ISearchRecorder` → `EfSearchRecorder` and `SearchOrchestrator` (all singletons).

## Test setup
Extend `PriceHuntApiFactory` (T01): set `ConnectionStrings:Default` with `builder.UseSetting(...)` to a shared-cache in-memory database with a unique name
(`Data Source=test-<guid>;Mode=Memory;Cache=Shared`) and keep one connection open for the factory's lifetime, so the DB survives.
Also swap in `FakeTimeProvider` and a sequence `IRandomSource` (T02). Its default values are drawn 13 per search in catalog order
(T02) and must give the six answering suppliers distinct delays from 0.5 s to 5 s, make the flaky supplier fail, and give
distinct prices. Write a comment per supplier next to the values. T05a's SS2, SS3 and SS4 tests rely on them.
Each test creates its own factory.
This keeps the T01 smoke test off the real `pricehunt.db` once `Migrate()` runs on startup.

## Acceptance criteria
- Delete `pricehunt.db` → `dotnet run` recreates it.
- A cancelled request still produces `Status = Cancelled` in the DB.

## Tests (integration: `SearchOrchestrator` and `EfSearchRecorder` resolved from the factory's services, no HTTP)
- P3: migrations apply to an empty database and create every table from plan.md.
- P1, P2, I3: a full search (all 7) persists the search with its parameters and selected suppliers, `Status = TimedOut`, and one response row per supplier that answered (a price, or a null price for the failure). The hanging supplier has no row (I3).
- P2, I5: the failure row has a null price and a response time.
- I7: cancel the caller token mid-search → `Status = Cancelled` (finalize used `CancellationToken.None`), and suppliers still pending have no rows.
- Times read back from the DB through a new `AppDbContext` from the factory (a tracked entity would skip the converter) equal the
  `FakeTimeProvider` time that was written and have `Kind = Utc`. Checking `Kind` alone
  is not enough: `ToUniversalTime()` also returns `Kind = Utc`.
