# T01: Foundation
**Reqs:** D1, D3

## Goal
Both projects start with one command each. The client can reach the API.

## Scope
- `server/PriceHunt.Api/Program.cs`: CORS for `http://localhost:4200` with any header and method (the JSON POST triggers a preflight).
- `Suppliers/SupplierCatalog`: the seven supplier ids and names. `GET /api/suppliers` returns them (needed by the search form). T02 adds their behaviour.
- Client: an `API_BASE_URL` injection token set to `http://localhost:5080`.
- Delete the template's `app.MapGet("/", () => "Hello World!")` from `Program.cs`.
- Delete the placeholder `server/PriceHunt.Tests/UnitTest1.cs`: the smoke test replaces it. `client/src/app/app.spec.ts` stays until T07 adds real client tests.

## Acceptance criteria
- `cd server && dotnet run --project PriceHunt.Api` → `GET http://localhost:5080/api/suppliers` returns 200.
- `cd client && npm start` works on a clean clone (`prestart` runs `npm install`).
- `dotnet test --solution server/PriceHunt.sln`, `npx ng test --watch=false`, `npx ng lint` and `npx prettier --check .` pass.

## Tests
- API: `WebApplicationFactory` smoke test that `/api/suppliers` returns 200.
