---
name: task-close
description: 'Close a finished task or bug in Quiz U: update docs/TASKS.md and ROADMAP.md, run both test suites, make atomic Conventional Commits, prepare the pre-push summary. Use when work is done, before commit or push.'
---

# Task close

Resolve repository paths below from the project root. User instructions take precedence over this workflow. This skill does not authorize commits, pushes, merges, or messages to other chats.

## Steps

1. **Tests.** Both must pass (PowerShell: `npm.cmd`):
   ```bash
   npm test
   ```
   ```bash
   cd server && npm test
   ```
   On a failure report it with output. Never close on red.
2. **Tracker `docs/TASKS.md`** (Russian). Add or update a row in the matching table. Bugs table columns: ID / Описание / Шаги воспроизведения-Причина / Приоритет / Статус / Решение-Фикс. Tasks table columns: ID / Описание / Файлы / Статус.
   - Task row, status `[x] Выполнено`:
     ```
     | **TASK-NN** | what changed and why, with numbers | `path` | `[x] Выполнено` |
     ```
   - Bug row: reproduce steps or cause, fix, files; status `[x] Устранено`.
   - Next number: grep the highest `TASK-`/`BUG-` and add 1 (rows are not always in order).
3. **`docs/ROADMAP.md`** only if a release stage or the current task/test counts changed (root N, server M).
4. **Wave tasks** (packs): also update `docs/OVERHAUL_2026-10.md` (status ✅ + dated log line with counts and test totals).
5. **Docs integrity.** Never delete `docs/README.md`, `DEV_GUIDE.md`, `TASKS.md`, `ROADMAP.md`, `REVIEW_GUIDE.md` or links to `REVIEW_GUIDE.md` (guarded by `tests/review_guide_integrity.test.js`).
6. **Commits.** Commit only when requested or already authorized by the user. Keep commits atomic, Conventional Commits: `fix(server): ...`, `feat(mobile): ...`, `fix(packs): ...`, `test(...)`, `docs: TASK-NN done`. Code and its test in one commit; the docs update may be separate. Files are CRLF (the LF→CRLF git warning is normal). No `node_modules`, logs, `.idea`, temp files. Do not add model attribution or co-author trailers unless the user requests them.
7. **Branch.** Work on a branch off `feature/online-multiplayer`. **Never merge into `main` or `dev`.**
8. **Push only after explicit user approval.** Before asking, give the summary:
   - what was done;
   - files touched (`git diff --stat`);
   - `npm test` results, both suites (counts);
   - state of `docs/ROADMAP.md` / `docs/TASKS.md`;
   - next steps.
   If approval is still missing, present the completed, reviewable changes and wait. If the user already authorized the specific push, proceed within that scope. Do not open a PR unasked.

## Final check

```bash
git status --short
git log --oneline -n 10
```
