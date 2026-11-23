# PriceHunt

Shipping-price search across seven simulated suppliers. Prices appear as each supplier answers, cheapest first.
Every search is saved, and past prices can be filtered on the history screen.

## How to run

Prerequisites: .NET 10 SDK, Node.js 22.22.3+ or 24.15+ (required by Angular 22).

```bash
# terminal 1: API on http://localhost:5080 (SQLite DB is created on first run)
cd server && dotnet run --project PriceHunt.Api

# terminal 2: UI on http://localhost:4200 (installs packages on first run)
cd client && npm start
```

Tests: `dotnet test --solution server/PriceHunt.sln` · `cd client && npx ng test --watch=false`

## Streaming: how and why
_TODO (T11): summary of [ADR-0001](docs/adr/0001-streaming-transport.md)._

## Database and table structure
_TODO (T11): ER diagram and tables._

## Design decisions and trade-offs
_TODO (T11): include the interpretations of ambiguous requirements from [spec.md](docs/spec.md#2-interpretations-of-ambiguous-points)._

**SQLite has one writer.** Each response is saved before it is streamed, and several searches can run at once.
SQLite lets only one connection write at a time, and the others retry with pauses. In a load test before implementation,
10 parallel searches ended at 7.4 s instead of 6 s, and with 100 some responses that arrived in time were lost.
So the recorder sends its writes through one `SemaphoreSlim` and they queue in memory instead. This is a SQLite workaround:
with SQL Server or PostgreSQL concurrent writes just work and the gate would be removed. It also only works inside one process.

## What I would do differently
_TODO (T11)._

## Where AI was used
_TODO (T11): which tools and where, built from [docs/ai-usage.md](docs/ai-usage.md)._

Rules for the coding agent are in [`AGENTS.md`](AGENTS.md).
