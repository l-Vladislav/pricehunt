# AI usage log

The README's "Where AI was used" section is built from this file. One row per task.

**Tools:** Claude Code (model: Claude Opus 5.5) in the terminal and VS Code.

**How I work with it:** I turned the PDF into numbered requirements, chose the architecture and wrote down the decisions.
The agent then does one task at a time, tests first, following `AGENTS.md`. A second agent reviews each diff against the spec.
The agent commits only after I approve. I review every PR, run the app, and merge.

| Task | What AI did | What I did / changed | Notes |
|------|-------------|----------------------|-------|
| Setup | Drafted spec, plan, task files and agent rules from my breakdown of the PDF. Wrote the CI workflow, PR template and `.gitignore`. Checked the spec against the PDF line by line. | Chose the architecture, the streaming transport, the answers to ambiguous points (I1–I8) and a mostly-integration test strategy. Had everything not in the PDF removed. Edited all docs. | |