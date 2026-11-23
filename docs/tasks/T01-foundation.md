# T01: Foundation
**Reqs:** D1, D3

## Goal
Both projects start with one command each. The client can reach the API.

## Scope
- `server/PriceHunt.Api/Program.cs`: CORS for `http://localhost:4200`, `GET /api/suppliers` (static list for now, needed by the search form).
- Client: an `API_BASE_URL` injection token set to `http://localhost:5080`.
- Delete the scaffold placeholders `server/PriceHunt.Tests/UnitTest1.cs` and the default test in `client/src/app/app.spec.ts` once real tests replace them.

## Acceptance criteria
- `cd server && dotnet run --project PriceHunt.Api` → `GET http://localhost:5080/api/suppliers` returns 200.
- `cd client && npm start` works on a clean clone (`prestart` runs `npm install`).
- `dotnet test --solution server/PriceHunt.sln`, `npx ng test --watch=false`, `npx ng lint` and `npx prettier --check .` pass.

## Tests
- API: `WebApplicationFactory` smoke test that `/api/suppliers` returns 200.
