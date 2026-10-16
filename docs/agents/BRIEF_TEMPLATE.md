# Worker brief (Haiku)

The coordinator (Opus) fills in this template before launching `haiku-worker` (`.claude/agents/haiku-worker.md`). One brief = one atomic task = one future commit. Review follows [REVIEW_CHECKLIST.md](REVIEW_CHECKLIST.md).

Agent-facing material (briefs, prompts, reports, REWORK notes) is in English to save tokens. User chat, `docs/TASKS.md`, `docs/ROADMAP.md` and UI stay in Russian.

## Orchestration flow

1. **Analysis.** Opus takes a task from [TASKS.md](../TASKS.md). If needed, it runs `haiku-scout` to collect `file:line`. Then it slices the task into briefs.
2. **Slicing.** Each brief gets its own disjoint set of files. Only one worker at a time edits `js/game.js`, `server/src/Room.js` or `mobile/mobile.js`.
3. **Launch.** Independent briefs run in parallel, each in its own worktree (`isolation: "worktree"`). Dependent briefs run in sequence.
4. **Review.** Opus checks the diff and the report against the checklist. Verdict: `APPROVE`, `REWORK` (numbered notes) or `REJECT`.
5. **Rework.** At most 2 `REWORK` rounds per brief. After that Opus finishes the task itself or rewrites the brief.
6. **Integration.** Opus merges approved changes into a working branch off `feature/online-multiplayer`. Then it runs both test suites, updates `docs/TASKS.md` and commits (Conventional Commits).
7. **Push** only after explicit user approval and a summary as `CLAUDE.md` requires.

### Do not hand to Haiku

- Architecture decisions: new protocols, new `GameStateMachine` phases, invariant changes.
- Tasks without a verifiable done criterion.
- Changes touching more than ~3 files or more than one "heavy" file (`game.js`, `Room.js`, `mobile.js`).
- Security and player-data sanitization (`sanitizeQuestionForPlayer`). Opus does these itself or reviews them line by line.

---

## Template

```markdown
### ID: BUG-xx / TASK-xx (part N of M)

**Goal:** one sentence: what must be true after the change.

**Context:**
- Now: <observed behavior / cause, if known>
- Key places: `path:line` — <what is there> (from the haiku-scout report)

**May edit:**
- `path/file1`
- `path/file2`

**Read only:**
- `path/file3` — <why>

**CLAUDE.md invariants involved:** <numbers and gist, e.g. "1 — scores only from the server", "8 — case in _handleMessage"> | none

**Done criteria:**
- [ ] <verifiable condition 1>
- [ ] <verifiable condition 2>
- [ ] New/updated test: `tests/...` or `server/tests/...` — <what it checks>

**Tests to run:**
- `npm.cmd test` (root)
- `npm.cmd test` (in `server/`)

**Out of scope (do not do):**
- <drive-by refactors, neighboring bugs, docs edits — the coordinator handles those>

**Report format:** as in `.claude/agents/haiku-worker.md`.
```
