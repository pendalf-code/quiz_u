# Coordinator review checklist (Opus)

Opus checks every `haiku-worker` result against this list, using the brief from [BRIEF_TEMPLATE.md](BRIEF_TEMPLATE.md). General review rules: [REVIEW_GUIDE.md](../REVIEW_GUIDE.md).

Do not take the worker's report on trust: read the diff and rerun the tests yourself.

## 1. Scope

- [ ] `git diff --stat` lists only files from "May edit". A foreign file means `REWORK` or `REJECT`.
- [ ] No drive-by refactors, renames or reformatting.
- [ ] No commits, branch switches or edits to `main`/`dev`.
- [ ] CRLF kept. No junk: logs, `node_modules`, `.idea`, temp files.

## 2. Brief criteria

- [ ] Every "Done criteria" item is met.
- [ ] The test checks behavior, not just the presence of a string. For `server/` a real unit or WS test is required.
- [ ] The test fails without the fix: reason it through or actually revert the fix.

## 3. `CLAUDE.md` invariants

- [ ] **0.** The PC screen does not own game state. `isGameStarted` is set before talking to the server.
- [ ] **1.** Only the server changes scores. The PC mirrors `score_updated`; manual +/- go through `HOST_UPDATE_SCORE`.
- [ ] **2.** A new timer respects `isPaused` and resumes in `setPaused`.
- [ ] **3.** Reopening the buzzer goes through `getEligibleBuzzerIds()`.
- [ ] **4.** New client state lands in `getStateSnapshot`; the screen recovers after reconnect.
- [ ] **5.** Offline play works without the server. New UI checked in dark and light (`body.light-theme`) themes.
- [ ] **6.** `clearTimeout`/`clearInterval` before a new timer; server timers call `unref()`.
- [ ] **7.** `if (el)`, `try/catch` around `localStorage`/`JSON.parse`/Audio, `const`/`let`, `===`, no `var`.
- [ ] **8.** A new server message is in both `MSG_TYPES` (`js/net/Protocol.js`, `server/src/protocol.js`) and has a `case` in `NetworkClient._handleMessage`.
- [ ] Answers `a`/`a_img` never reach players (`PackParser.sanitizeQuestionForPlayer`). Private data (auction answer texts) goes only to the PC and the host.
- [ ] Modals in `mobile/index.html` sit before `<script>` (BUG-40).
- [ ] No bundlers, TS or frameworks. Relative paths only.

## 4. Typical Haiku mistakes

- [ ] Symptom fixed instead of cause, e.g. a race "cured" with `setTimeout`.
- [ ] Logic duplicated instead of calling an existing function.
- [ ] Only the PC (`hostWs`) or only the phone (`hostPlayer`) treated as host. Check both: `sendToHost`.
- [ ] A state branch not covered: `AUCTION_ANSWERING`, `ANSWERING`, `CAT_CHOOSING`, pause, reconnect mid-question.
- [ ] A static test in `tests/` "fixed" by editing the expected string without reason.

## 5. Tests (Opus runs them itself)

```
npm.cmd test
```

```
cd server; npm.cmd test
```

- [ ] Both suites green. Numbers match the worker's report.
- [ ] For LAN flow changes, run `npm run demo:lan` and/or the manual scenario from `CLAUDE.md` if needed.

## 6. Verdict

```
VERDICT: APPROVE | REWORK | REJECT
TASK: <ID>
NOTES:
1. path:line — problem. What to do.
2. ...
```

- **APPROVE**: Opus integrates, updates `docs/TASKS.md` and commits.
- **REWORK**: notes go back to the same worker via `SendMessage`, keeping its context. At most 2 rounds, then Opus finishes it.
- **REJECT**: wrong approach. Opus rewrites the brief, narrower and with better context, or does the task itself.
