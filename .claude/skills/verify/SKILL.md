---
name: verify
description: Build and test both PriceHunt projects (server .NET + client Angular) and report real results. Use before declaring any task done, before pushing, or when the user asks to check that everything is green.
allowed-tools: Bash(dotnet build *) Bash(dotnet test *) Bash(npx ng test *) Bash(npx ng build *) Bash(npx ng lint *) Bash(npx prettier --check *) Bash(git diff *)
---

# Verify

Run from the repo root and report the **actual** output: pass/fail counts and the first error of each failure.

1. `dotnet build server/PriceHunt.sln -warnaserror`
2. `dotnet test --solution server/PriceHunt.sln --no-build`
3. `cd client && npx ng test --watch=false`
4. `cd client && npx ng build`
5. `cd client && npx ng lint`
6. `cd client && npx prettier --check .`

Rules:
- Run steps 3–6 only if `client/` differs from `origin/main` (`git diff --quiet origin/main -- client` exits non-zero), unless the user asked for a full verify.
- CI (`.github/workflows/ci.yml`) runs the same steps on every PR. Local verify must pass before pushing.
- Never edit tests to make this pass. Never claim green without having run the commands.
- If a step fails, stop, show the failure, and diagnose the root cause before changing anything.
