---
name: task-close
description: 'Close a finished Quiz U task or bug: update the single tracker docs/TASKS.md, run both test suites, review the diff and prepare the pre-push summary. Use when work is done, before an authorized commit or push.'
---

# Task close

Resolve paths from the repository root. Development and Git rules live in `AGENTS.md`. This workflow does not authorize commits, pushes, merges, PRs or messages to other chats.

1. Run both test suites (PowerShell uses `npm.cmd`): root `npm.cmd test`, then `npm.cmd test` with working directory `server/`. On failure report the output; never close on red.
2. Update only `docs/TASKS.md`: task outcome, files, status and dated results of the latest checks, including untested areas. Keep a bug requiring manual verification open until that verification passes. Do not copy counters or statuses into other documents.
3. Allocate IDs from the highest TASK/BUG in both the current tracker and `docs/archive/`; never reuse an archived ID. Keep new wave subtasks in TASKS.md. Archives are historical and are not regular update targets.
4. Review `git diff`, references, and checks relevant to the change. Documentation layout changes must update `tests/review_guide_integrity.test.js` and callers, rather than preserving obsolete documents just for a filename assertion.
5. Commit only when requested or already authorized. Use atomic Conventional Commits in Russian, CRLF, and no model attribution unless requested. Do not commit dependencies, logs, IDE files or temporary files.
6. Before an authorized push, provide what changed, touched files, both test results, TASKS.md status and next steps. Without explicit push authorization, finish with reviewable local changes.

For a growing tracker, move completed details into `docs/archive/` with a link in TASKS.md. Preserve IDs, outcomes and dates; keep open issues and future plans in the current tracker.
