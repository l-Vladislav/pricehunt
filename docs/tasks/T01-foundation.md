# T01: Foundation
**Reqs:** S1, D1, D3

## Goal
Both projects start with one command each. The API serves the supplier list the search form will need.

## Scope
- `server/PriceHunt.Api/Program.cs`: CORS for `http://localhost:4200` with any header and method (the JSON POST triggers a preflight).
  Delete the template's `app.MapGet("/", () => "Hello World!")`.
- `Suppliers/SupplierCatalog`: the seven supplier ids and names (made-up names, no real companies).
  `GET /api/suppliers` returns them as `[{ id, name }]`. T02 adds their behaviour.
- Tests: add `Microsoft.AspNetCore.Mvc.Testing` (pre-approved). Create `PriceHuntApiFactory : WebApplicationFactory<Program>`.
  T04 and T05a extend this same factory, so nothing is thrown away later.
- Delete the placeholder `server/PriceHunt.Tests/UnitTest1.cs`: the smoke test replaces it.
  `client/src/app/app.spec.ts` stays until T07 adds real client tests. No client changes in this task.

## Acceptance criteria
- `cd server && dotnet run --project PriceHunt.Api` → `GET http://localhost:5080/api/suppliers` returns the seven suppliers.
- `cd client && npm start` works on a clean clone (`prestart` runs `npm install`).
- `dotnet test --solution server/PriceHunt.sln`, `npx ng test --watch=false`, `npx ng lint` and `npx prettier --check .` pass.

## Tests (integration: `PriceHuntApiFactory`)
- S1: `GET /api/suppliers` returns 200 with seven suppliers, each with an id and a name.
