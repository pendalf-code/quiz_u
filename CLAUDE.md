# CLAUDE.md — Quiz U («Город Ю»)

Командная викторина в стиле «Своей игры»: локальный режим на одном экране + сетевой Jackbox-режим (LAN), где телефоны — баззеры, а один из телефонов (или ПК) — ведущий. Десктоп/Steam Deck — Tauri, мобильное приложение — Capacitor/PWA. Язык проекта (UI, доки, коммиты-комментарии) — русский.

## Команды

```bash
npm test                 # клиентские + core тесты (node --test tests/**/*.test.js), корень репо
cd server && npm install # один раз: единственная зависимость — ws
cd server && npm test    # серверные тесты (Room, RoomManager, WS-интеграция)
cd server && npm start   # HTTP+WS на :8080 (PORT=...), раздаёт index.html, /mobile/, /js, /css, /assets, «паки вопросов»
npm run test:load        # стресс: 50 комнат / 200 игроков
npm run dev:desktop      # Tauri; npm run build:mobile → cap sync android
```

Windows/PowerShell: `npm.cmd` вместо `npm`. Перед коммитом должны проходить **оба** набора тестов.

Ручной прогон LAN: `cd server && npm start` → `http://localhost:8080/` → «LAN игра» (ПК-экран); телефон/вкладка `http://<IP>:8080/mobile/?room=XXXX` (роль «Игрок» или «Ведущий»).

## Архитектура

- **Zero-build vanilla JS** (HTML5/CSS3/ES6+). Бандлеры, TypeScript, фреймворки запрещены. Пути только относительные с `/`.
- `js/core/*` — изоморфные UMD-модули без DOM (`GameStateMachine`, `ScoreManager`, `PackParser`, `CdnManager`). Их же импортирует сервер (`server/src/Room.js`).
- `server/src/` — авторитарный сервер: `server.js` (HTTP+WS, маршрутизация сообщений), `Room.js` (вся игровая логика комнаты, таймеры), `RoomManager.js`, `protocol.js`.
- `js/net/` — `Protocol.js` + `NetworkClient.js` (WS-клиент с реконнектом). **`MSG_TYPES` дублируются в `js/net/Protocol.js` и `server/src/protocol.js` — новый тип добавляй в оба.**
- `js/game.js` (~5000 строк) — весь UI ПК-хоста: локальная игра и сетевой режим (`initHostNetwork`, `hostNetworkClient.on(...)`). `index.html` + `css/style.css` (тёмная и светлая тема `body.light-theme`).
- `mobile/` — клиент игрока и пульт ведущего (`mobile.js`, один IIFE, экраны `join/waiting/buzzer/answer/auction/cat/host`). Пульт ведущего: `#screen-host[data-phase]` (`lobby|board|question|answering|finished|round_end|game_over`) задаёт, какие кнопки видны в нижнем `.host-dock`; фаза считается в `updateHostScreen`. Скрипт `mobile.js` исполняется сразу, поэтому разметка модалок должна стоять **до** `<script>` (BUG-40).
- `tests/` — клиентские тесты; многие — статические проверки исходников (`readFileSync` + `includes`), поэтому **переименование/перестановка кода может ломать тесты** — читай их при рефакторинге. `server/tests/` — настоящие unit/WS-тесты.
- Паки: `паки вопросов/**/*.json`, каталог `js/packs_catalog.json` (`tools/sync_all_catalog.js`), встроенные данные `js/packs_data.js`.

### Роли в LAN-комнате
Три типа сокетов: ПК-экран (`room.hostWs`, создаёт комнату), мобильный ведущий (`room.hostPlayer`, `role:'host'`), игроки (`room.players`). `sendToHost` шлёт и ПК, и мобильному ведущему; игроки получают санитизированные данные (**ответы `a`/`a_img` игрокам не уходят никогда** — `PackParser.sanitizeQuestionForPlayer`).

### Жизненный цикл вопроса (Room.js)
`BOARD → selectQuestion → QUESTION_READING (readingTimer) → activateBuzzer → BUZZ_ACTIVE (thinkingTimer) → handleBuzz → ANSWERING (answerTimer) → judgeAnswer → (reopen BUZZ_ACTIVE | finishQuestion → BOARD/ROUND_END/GAME_OVER)`. Особые типы **ждут ведущего** (ни таймеров, ни баззера, пока он не решит): `cat`/`secret` — `HOST_SET_CAT_TARGET` назначает отвечающего (он обязан ответить, пас запрещён); `auction_leader` — игроки ставят (`PLAYER_AUCTION_BET`, ограничено счётом), ведущий называет лидера `HOST_SET_AUCTION_LEADER` (цена = его ставка, баззер только лидеру); `auction`/`auction_all` — ведущий закрывает ставки `HOST_START_AUCTION_ANSWER`, ставившие вводят ответ текстом (фиксированные `AUCTION_ANSWER_SECONDS = 30` с, потом блокировка), судейство построчно через `HOST_UPDATE_SCORE`. Пас на обычном вопросе: `PLAYER_PASS` (`Room.handlePass`), все спасовали → `revealAndFinishQuestion()` (ответ на общем экране, вопрос остаётся открытым). На общее табло экран возвращается **только** по `HOST_CLOSE_QUESTION` («К табло» ведущего); выбор вопроса с телефона на табло сначала мигает ячейкой (`openQuestionFromHostPhone`). `QUESTION_ACTIVE` несёт `state`/`questionType` — клиенты по ним выбирают экран.
Оставшееся время размышления хранится в `remainingThinkingTime` и переносится между игроками.

## Инварианты (не ломать)

0. **ПК-экран не владеет состоянием игры**: `isGameStarted` ставится в `true` в `startOnlineGame` *до* обращения к серверу, иначе эхо `room_state: BOARD` перезапускает игру в бесконечном цикле (BUG-38). `HOST_ACTIVATE_BUZZER` на сервере игнорируется вне открытого вопроса.
1. **Сервер — единственный источник очков.** ПК-экран зеркалит `score_updated`; он не должен менять счёт сам при `judge_result` / судействе (иначе очки задваиваются — BUG-29). Ручные +/- на ПК идут через `changeTeamScore` → `HOST_UPDATE_SCORE`.
2. **Пауза** (`Room.setPaused`) замораживает и возобновляет все таймеры; причина `host` | `disconnect`. Авто-пауза при отключении снимается сама, когда все вернулись; кик не паузит. Любой новый таймер обязан учитывать `isPaused`.
3. **Баззер только для подключённых**: переоткрытие баззера считает `getEligibleBuzzerIds()` (подключены, не отвечали, в `allowedBuzzerPlayerIds`).
4. **Снимок состояния** (`getStateSnapshot`) должен хватать клиенту для восстановления экрана после реконнекта (`buzzerOpenFor`, `isPaused`, `currentQuestion`, `board`). Любое состояние, нужное клиенту после перезагрузки, клади туда.
5. **Оффлайн-режим не ломать** — локальная игра работает без сервера. Две темы (тёмная/светлая) для любого нового UI.
6. Таймеры: чистить `clearTimeout/clearInterval` перед созданием нового; серверные таймеры `unref()`.
7. Defensive DOM: `if (el)` перед обращением, `try/catch` вокруг `localStorage`, Audio, `JSON.parse`. `const`/`let`, строгое `===`, без `var`.
8. **Каждое серверное сообщение должно диспетчеризоваться в `NetworkClient._handleMessage`** (`case MSG.X → emit`), иначе клиенты его молча игнорируют (BUG-41) — это проверяет `tests/lan_score_authority.test.js`. Конец раунда/игры решает сервер (`ROUND_END`/`GAME_OVER`), ПК только отображает.

## Git и процесс

- Базовая ветка сетевой разработки — `feature/online-multiplayer`; фичи/фиксы — ветки от неё. **В `main` и `dev` не мержить** (заморожены под оффлайн-версию).
- **Не пушить без явного одобрения.** Перед пушем дать саммари: что сделано, затронутые файлы, результаты `npm test` (оба набора), состояние `docs/ROADMAP.md`/`docs/TASKS.md`, следующие шаги.
- Коммиты атомарные, Conventional Commits (`fix(server): ...`, `feat(mobile): ...`, `docs: ...`).
- При работе над задачей/багом обновляй `docs/TASKS.md` (таблица багов) и при необходимости `docs/ROADMAP.md`.
- Не коммитить `node_modules`, логи, `.idea`.
- Файлы в репо с CRLF-окончаниями; при правке скриптами сохраняй окончания (`git` предупреждает о LF→CRLF — это нормально).

## Документация (`docs/`)

| Файл | О чём |
|:---|:---|
| `README.md` | Фичи, запуск, сборки, тесты |
| `DEV_GUIDE.md` | Правила разработки, архитектура, Git workflow |
| `REVIEW_GUIDE.md` | Регламент код-ревью (Conventional Comments), план ревью проекта |
| `TASKS.md` | Трекер задач и багов (BUG-xx / TASK-xx) |
| `ROADMAP.md` | Релизные этапы |
| `DESIGN_GUIDE.md` | Steam-страница, ассеты, маркетинг — **пока вне работы** |

Стиль кода: `.aiassistant/rules/code style rules.md`. Шаблон PR: `.github/pull_request_template.md`.
Тесты `tests/review_guide_integrity.test.js` проверяют наличие и ссылки в `docs/README.md`, `DEV_GUIDE.md`, `TASKS.md`, `ROADMAP.md`, `REVIEW_GUIDE.md` — не удаляй эти файлы и ссылку на `REVIEW_GUIDE.md` в них.
