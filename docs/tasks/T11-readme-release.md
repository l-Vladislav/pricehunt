# T11: README & release check
**Reqs:** D1, D2, D4

## README sections (required by the assignment)
1. How to run: two commands. Prerequisites: .NET 10 SDK, Node 22.22+ or 24.15+ (I8).
2. Streaming: what and why. Summarise ADR-0001, including the rejected alternatives.
3. Database and table structure, with an ER diagram (mermaid).
4. Design decisions and trade-offs, including the interpretations table (I1–I8) from spec.md.
5. What I would do differently.
6. Where AI was used: which tools (name and model) and where, built from `docs/ai-usage.md` (D4).

## Release check
- Fresh `git clone` into a temp dir → both commands work, the DB is created, a search runs end-to-end.
- `dotnet test` and `npm test -- --watch=false` are green.
- No `pricehunt.db`, `bin/`, `obj/` or `node_modules/` in git.
