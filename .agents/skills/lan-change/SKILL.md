---
name: lan-change
description: 'Checklist for any change to LAN/online logic: server/src/Room.js, protocol, NetworkClient, js/game.js network code, mobile/mobile.js, timers, buzzer, special questions (cat, auction), snapshots. Use before and after editing these, or when fixing a LAN bug.'
---

# LAN change checklist

Resolve repository paths below from the project root. User instructions take precedence over this workflow. Invariants live in `AGENTS.md` ("Инварианты"). This skill is the procedure. Past bugs it prevents: BUG-29 (double score), 38 (restart loop), 41 (message ignored), 48-54 (special questions, reconnect).

## Before editing

1. Find the touched flow in `Room.js`. Question lifecycle:
   `BOARD → selectQuestion → QUESTION_READING (readingTimer) → activateBuzzer → BUZZ_ACTIVE (thinkingTimer) → handleBuzz → ANSWERING (answerTimer) → judgeAnswer → reopen BUZZ_ACTIVE | finishQuestion → BOARD/ROUND_END/GAME_OVER`.
   `cat`/`secret`/`auction*` wait for the host: no timers, no buzzer until the host decides.
2. Heavy files (`js/game.js`, `server/src/Room.js`, `mobile/mobile.js`): one editor at a time.
3. Read the static tests that cover the area (many are `readFileSync + includes`; a rename can break them).

## Checklist (tick each that applies)

- [ ] **New message type:** added to `MSG_TYPES` in BOTH `js/net/Protocol.js` and `server/src/protocol.js`.
- [ ] **Server → client message:** has `case MSG.X → emit` in `NetworkClient._handleMessage`, else clients ignore it silently. Checked by `tests/lan_score_authority.test.js`.
- [ ] **Roles:** know who gets it. `sendToHost` reaches PC screen and mobile host. Players get sanitized data. Answers `a`/`a_img` never go to players (`PackParser.sanitizeQuestionForPlayer`). Text answers (`ANSWER_SUBMITTED`) only to PC + host (BUG-51).
- [ ] **Score:** only the server changes it. PC mirrors `score_updated`, never adds on `judge_result`. Manual +/- go `changeTeamScore → HOST_UPDATE_SCORE`.
- [ ] **Timers:** `clearTimeout/clearInterval` before creating; `unref()`; respect `isPaused` and resume in `Room.setPaused`.
- [ ] **Buzzer:** reopen through `getEligibleBuzzerIds()` (connected, not answered, in `allowedBuzzerPlayerIds`).
- [ ] **Snapshot:** state the client needs after reload is in `getStateSnapshot` (`buzzerOpenFor`, `isPaused`, `currentQuestion`, `board`, new fields).
- [ ] **Disconnects:** cat target / auction leader dropping mid-answer must not burn the question (BUG-53). Reject senders in the wrong role or state (BUG-54).
- [ ] **PC screen:** does not own game state. `isGameStarted = true` in `startOnlineGame` before touching the server (BUG-38). Events during the special-question intro are buffered (BUG-49).
- [ ] **Mobile:** modal markup before `<script>` (BUG-40). Host dock buttons follow `#screen-host[data-phase]`.
- [ ] **UI:** dark and light theme (`body.light-theme`). Offline mode works without a server.
- [ ] **Defensive JS:** `if (el)`, `try/catch` around `localStorage`/Audio/`JSON.parse`, `const`/`let`, `===`, no `var`. Round/game end is decided by the server only.

## Verify

```bash
npm test
```

```bash
cd server && npm test
```

Server logic change needs a real unit/WS test in `server/tests/` that fails without the fix (revert the fix and check). Static-string tests alone are not enough.

Flows touching cat, auctions, pass, reconnect or pause: run the e2e demo (~50 s, exit 0 = all PASS).

```bash
cd server && npm start
```

```bash
node tools/lan_demo.js
```

PowerShell: `npm.cmd`. Manual run: `http://localhost:8080/` → «LAN игра»; phone `http://<IP>:8080/mobile/?room=XXXX`.

When finishing implementation, follow the sibling `task-close` skill at `../task-close/SKILL.md`.
