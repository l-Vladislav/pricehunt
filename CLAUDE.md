@AGENTS.md

## Claude Code specifics
- One task per session. Start each task with `/clear`. Progress lives in `docs/plan.md` and the task files, not in chat history.
- Use plan mode for any task that touches more than one project.
- Skills in `.claude/skills/`:
  - `/implement-task [Txx]` (user-invoked only): the full test-first loop for one task, ending in a PR.
  - `verify`: build + test both projects and report the real output.
  - `concurrency-review`: the cancellation/streaming checklist, for any change in `Search/`, `Suppliers/` or the stream client.
- Before opening a PR, run the `reviewer` subagent on the branch diff. It has a fresh context and checks the diff against the spec, not against your intent.
- Commits and PRs carry **no** AI attribution: no `Co-Authored-By: Claude`, no `Claude-Session:` trailers, no "Generated with Claude Code" footers.
  This is enforced by `attribution` in `.claude/settings.json`. AI usage is documented in `docs/ai-usage.md` and the README instead.
