# AI usage log

The README's "Where AI was used" section is built from this file. One row per task.

**Tools:** Claude Code (model: Claude Opus 5.5) in the terminal and VS Code.

**How I work with it:** I turned the PDF into numbered requirements, chose the architecture and wrote down the decisions.
The agent then does one task at a time, tests first, following `AGENTS.md`. A second agent reviews each diff against the spec.
The agent commits only after I approve. I review every PR, run the app, and merge.

| Task | What AI did | What I did / changed | Notes |
|------|-------------|----------------------|-------|
| Setup | Drafted spec, plan, task files and agent rules from my breakdown of the PDF. Wrote the CI workflow, PR template and `.gitignore`. Checked the spec against the PDF line by line. | Chose the architecture, the streaming transport, the answers to ambiguous points (I1–I8) and a mostly-integration test strategy. Had everything not in the PDF removed. Edited all docs. | |
| Spike | Built the risky parts of the plan in a throwaway copy with integration tests and a load test, then fixed the plan. | Asked for the spike instead of more reading reviews. Chose to document the SQLite write gate as a trade-off. | Code not committed; findings in plan.md, "Checked by a spike". |
| UI library | Compared Angular Material with hand-written UI and wrote ADR-0002 and T07b. | Chose Material, and skeleton rows as the form of the loading states. | |
| Second spike | Built T03a, T03b, T06's date filter and T08a's store in a throwaway copy, broke each guarantee on purpose to check that a test fails, and fixed the task files. | Asked to break each guarantee on purpose and check that a test fails. Decided the open cases the spike found. | Code not committed; findings in plan.md, "Checked by a spike". |
| T01 | Wrote the failing tests (S1, CORS preflight) and the test factory, then the supplier catalog, `GET /api/suppliers` and CORS. Broke the code on purpose nine ways to check the tests catch it, and started both projects from a fresh clone. | TODO(owner) | Reviewer: four minor findings. Fixed the duplicated test ID comment and the missing plan/usage updates. |
