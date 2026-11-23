# T01: Foundation
**Reqs:** D1, D3

## Goal
Both projects start with one command each. The client can reach the API.

## Scope
- `server/PriceHunt.Api/Program.cs`: CORS for `http://localhost:4200`, `GET /api/suppliers` (static list for now, needed by the search form).
- Client: an `API_BASE_URL` injection token set to `http://localhost:5080`.
- Root `README.md` skeleton with every section D2 requires (filled in during T11).

## Acceptance criteria
- `cd server && dotnet run --project PriceHunt.Api` → `GET http://localhost:5080/api/suppliers` returns 200.
- `cd client && npm start` works on a clean clone (`prestart` runs `npm install`).
- `dotnet test` and `npm test -- --watch=false` both pass.

## Tests
- API: `WebApplicationFactory` smoke test that `/api/suppliers` returns 200.
