# T11: README & release check
**Reqs:** SS6, D1, D2, D4

## README sections (required by the assignment)
1. How to run: two commands. Prerequisites: .NET 10 SDK, Node 22.22.3+ or 24.15+ (I8).
2. Streaming: what and why (SS6). Summarise ADR-0001, including the rejected alternatives.
3. Database and table structure, with an ER diagram (mermaid).
4. Design decisions and trade-offs, including the interpretations table (I1–I8) from spec.md and a summary of ADR-0002 (Material, hand-written FLIP and skeletons). Also state the known limits:
   the history date filter uses whole UTC days; a search stays `Running` if the server dies mid-search;
   two requests reusing one `searchId` at the same moment fail on the primary key instead of a 400;
   a timeout that fires while the last result is being saved ends `Completed`, because every result arrived in time.
   Explain the SQLite write gate (`SemaphoreSlim`) as a SQLite-specific choice with the spike numbers from plan.md:
   a server database handles concurrent writers itself and would not need it, and the gate works only inside one process.
5. What I would do differently.
6. Where AI was used: which tools (name and model) and where, built from `docs/ai-usage.md` (D4).

## Release check
- Fresh `git clone` into a temp dir → both commands work, the DB is created, a search runs end-to-end.
- Everything in `AGENTS.md` "Done means" is green, client commands included.
- No `pricehunt.db`, `bin/`, `obj/` or `node_modules/` in git.
