---
name: implement-task
description: Implement one PriceHunt task test-first against its task file in docs/tasks, ending in a pull request. Use when the user says "do T03a", "implement task T05", "next task", or similar.
argument-hint: [task id, e.g. T03a]
disable-model-invocation: true
---

# Implement a PriceHunt task

Task: `$ARGUMENTS` (if empty, take the first task in `docs/plan.md` that is not `[x]`).

1. **Branch.** Check that the working tree is clean (stop if it isn't). Run `git switch main && git pull`, then `git switch -c tNN-<slug>`.
2. **Load context.** Read `docs/tasks/$ARGUMENTS-*.md`, the requirement IDs it cites in `docs/spec.md`, and the related sections of `docs/plan.md`.
   Read the existing code you will touch. Don't read the whole repo.
3. **Clarify.** List anything ambiguous or conflicting between the task and the spec. If there is anything, ask the user and stop.
4. **Mark in progress.** Set the task to `[~]` in `docs/plan.md`.
5. **Red.** Write the tests listed under "Tests" in the task file. Name each test with its requirement ID.
   Run them and show that they fail for the expected reason (not a compile error in unrelated code).
   Propose a commit `Txx: failing tests for <reqs>` and make it only after the owner approves.
6. **Green.** Implement the minimum to pass, following `AGENTS.md`. Stay inside the task's scope. Propose small logical commits, and commit each one only after the owner approves.
   If the spec turns out to be wrong or incomplete, stop and ask. Don't silently diverge from it.
7. **Mutation check.** For each guarantee in the task (design bullets, acceptance criteria), break the code on purpose, one change
   at a time: the wrong token, a step in the wrong order, a missing `await`, a check left out. Run the tests and confirm that at
   least one fails. A break that no test catches means a missing or weak test: add or fix the test, then revert the break.
   Breaks are never committed. List each break and the test that caught it in the PR.
8. **Verify.** Run the `verify` skill. If the task touches `Search/`, streaming, cancellation or the stream client, also run `concurrency-review`.
9. **Review.** Run the `reviewer` subagent on the branch. Fix the real findings in separate commits, and explain the ones you dismiss.
10. **Close.** Set the task to `[x]` in `docs/plan.md`. Add a row to `docs/ai-usage.md` (what the agent wrote, what changed after review).
   Leave the "What I did" column as `TODO(owner)` for the user to fill in. Propose the commit and wait for approval.
11. **PR.** Ask the owner before pushing. After approval: `git push -u origin HEAD`, then `gh pr create --title "Txx: <summary> (<req IDs>)"` (it becomes the squash commit on `main`) with a body that follows `.github/pull_request_template.md`
    (reqs covered, tests → req IDs, verify output, mutation check, reviewer findings and how they were handled, AI usage).
    Then `gh pr checks --watch` and report the CI result. **Never merge.** The owner reviews and merges.
12. **Report.** Give the PR URL, a short summary, and any open questions.
