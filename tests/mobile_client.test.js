const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocket } = require('../server/node_modules/ws');

const rootDir = path.resolve(__dirname, '..');
const { server, wss, roomManager } = require('../server/src/server');
const { MSG_TYPES, ERROR_CODES, createMessage, parseMessage } = require('../server/src/protocol');
const NetworkClient = require('../js/net/NetworkClient');

describe('Mobile Client (PWA / Buzzer / Touch UX) Test Suite', () => {
    const htmlPath = path.join(rootDir, 'mobile', 'index.html');
    const cssPath = path.join(rootDir, 'mobile', 'mobile.css');
    const jsPath = path.join(rootDir, 'mobile', 'mobile.js');

    test('mobile/ files exist and have valid structure', () => {
        assert.ok(fs.existsSync(htmlPath), 'mobile/index.html must exist');
        assert.ok(fs.existsSync(cssPath), 'mobile/mobile.css must exist');
        assert.ok(fs.existsSync(jsPath), 'mobile/mobile.js must exist');
    });

    test('mobile/index.html includes mobile-first viewport lock and touch settings', () => {
        const html = fs.readFileSync(htmlPath, 'utf8');
        assert.ok(html.includes('user-scalable=no'), 'Viewport meta must prevent zoom');
        assert.ok(html.includes('viewport-fit=cover'), 'Viewport meta must support edge-to-edge cover');
        assert.ok(html.includes('mobile.css'), 'Must link mobile.css');
        assert.ok(html.includes('mobile.js'), 'Must link mobile.js');
        assert.ok(html.includes('../js/net/Protocol.js'), 'Must link Protocol.js');
        assert.ok(html.includes('../js/net/NetworkClient.js'), 'Must link NetworkClient.js');
    });

    test('mobile/index.html contains all 6 required screens with unique IDs', () => {
        const html = fs.readFileSync(htmlPath, 'utf8');
        // Screen 1: Join
        assert.ok(html.includes('id="screen-join"'), 'Screen 1 #screen-join must exist');
        assert.ok(html.includes('id="room-code-input"'), '#room-code-input must exist');
        assert.ok(html.includes('id="player-name-input"'), '#player-name-input must exist');
        assert.ok(html.includes('id="avatar-grid"'), '#avatar-grid must exist');
        assert.ok(html.includes('id="reconnect-banner"'), '#reconnect-banner must exist');

        // Screen 2: Waiting
        assert.ok(html.includes('id="screen-waiting"'), 'Screen 2 #screen-waiting must exist');
        assert.ok(html.includes('id="waiting-score"'), '#waiting-score must exist');
        assert.ok(html.includes('id="waiting-players-list"'), '#waiting-players-list must exist');

        // Screen 3: Giant Buzzer
        assert.ok(html.includes('id="screen-buzzer"'), 'Screen 3 #screen-buzzer must exist');
        assert.ok(html.includes('id="buzzer-btn"'), '#buzzer-btn must exist');
        assert.ok(html.includes('id="buzzer-cost-badge"'), '#buzzer-cost-badge must exist');

        // Screen 4: Answer typing
        assert.ok(html.includes('id="screen-answer"'), 'Screen 4 #screen-answer must exist');
        assert.ok(html.includes('id="answer-input"'), '#answer-input must exist');
        assert.ok(html.includes('id="answer-timer-bar"'), '#answer-timer-bar must exist');
        assert.ok(html.includes('id="btn-submit-answer"'), '#btn-submit-answer must exist');

        // Screen 5: Auction
        assert.ok(html.includes('id="screen-auction"'), 'Screen 5 #screen-auction must exist');
        assert.ok(html.includes('id="bet-input"'), '#bet-input must exist');
        assert.ok(html.includes('id="btn-submit-bet"'), '#btn-submit-bet must exist');
        assert.ok(html.includes('id="btn-pass-bet"'), '#btn-pass-bet must exist');
        assert.ok(html.includes('id="btn-va-bank"'), '#btn-va-bank must exist');

        // Screen 6: Cat
        assert.ok(html.includes('id="screen-cat"'), 'Screen 6 #screen-cat must exist');
        assert.ok(html.includes('id="cat-players-list"'), '#cat-players-list must exist');
        assert.ok(html.includes('id="btn-confirm-cat"'), '#btn-confirm-cat must exist');
    });

    test('TASK-04: Host screen remote controls UI elements, buttons, and styles exist', () => {
        const html = fs.readFileSync(htmlPath, 'utf8');
        // Screen 7 elements
        assert.ok(html.includes('id="screen-host"'), 'Host screen #screen-host must exist');
        assert.ok(html.includes('id="host-question-text"'), '#host-question-text container must exist');
        assert.ok(html.includes('id="host-secret-box"'), '#host-secret-box must exist');
        assert.ok(html.includes('id="host-secret-answer"'), '#host-secret-answer element must exist');
        assert.ok(html.includes('id="host-answering-banner"'), '#host-answering-banner must exist');
        // Control buttons
        assert.ok(html.includes('id="btn-host-judge-correct"'), '#btn-host-judge-correct must exist');
        assert.ok(html.includes('id="btn-host-judge-wrong"'), '#btn-host-judge-wrong must exist');
        assert.ok(html.includes('id="btn-host-open-buzzer"'), '#btn-host-open-buzzer must exist');
        assert.ok(html.includes('id="btn-host-pause"'), '#btn-host-pause must exist');
        assert.ok(html.includes('id="btn-host-show-answer"'), '#btn-host-show-answer must exist');
        assert.ok(html.includes('id="btn-host-close-question"'), '#btn-host-close-question must exist');
        assert.ok(html.includes('id="btn-host-start-game"'), '#btn-host-start-game must exist');
        assert.ok(html.includes('id="host-players-list"'), '#host-players-list must exist');

        const css = fs.readFileSync(cssPath, 'utf8');
        assert.ok(css.includes('#screen-host'), '#screen-host styles must exist in mobile.css');
        assert.ok(css.includes('.host-secret-box'), '.host-secret-box styles must exist in mobile.css');
        assert.ok(css.includes('.btn-judge-accept'), '.btn-judge-accept styles must exist in mobile.css');
        assert.ok(css.includes('.btn-judge-reject'), '.btn-judge-reject styles must exist in mobile.css');
        assert.ok(css.includes('.score-step-btn'), '.score-step-btn styles must exist in mobile.css');

        const js = fs.readFileSync(jsPath, 'utf8');
        assert.ok(js.includes('updateHostScreen('), 'updateHostScreen method must exist in mobile.js');
        assert.ok(js.includes('renderHostPlayersList('), 'renderHostPlayersList method must exist in mobile.js');
        assert.ok(js.includes('btnHostJudgeCorrect'), 'btnHostJudgeCorrect listener must exist in mobile.js');
        assert.ok(js.includes('btnHostPause'), 'btnHostPause listener must exist in mobile.js');
    });

    test('TASK-04: NetworkClient exposes host remote control methods', () => {
        const client = new NetworkClient({ url: 'ws://127.0.0.1:8080', isHost: true });
        assert.equal(typeof client.showAnswer, 'function', 'showAnswer method must exist');
        assert.equal(typeof client.togglePause, 'function', 'togglePause method must exist');
        assert.equal(typeof client.closeQuestion, 'function', 'closeQuestion method must exist');
        assert.equal(typeof client.updateScore, 'function', 'updateScore method must exist');
        assert.equal(typeof client.judgeAnswer, 'function', 'judgeAnswer method must exist');
        assert.equal(typeof client.activateBuzzer, 'function', 'activateBuzzer method must exist');
        assert.equal(typeof client.startGame, 'function', 'startGame method must exist');
    });

    test('TASK-03: Role selection UI elements and styles exist in mobile files', () => {
        const html = fs.readFileSync(htmlPath, 'utf8');
        assert.ok(html.includes('id="role-selector"'), 'Role selector container must exist');
        assert.ok(html.includes('id="btn-role-player"'), 'Player role button must exist');
        assert.ok(html.includes('id="btn-role-host"'), 'Host role button must exist');
        assert.ok(html.includes('role="radiogroup"'), 'ARIA radiogroup must be present');

        const css = fs.readFileSync(cssPath, 'utf8');
        assert.ok(css.includes('.role-selector'), '.role-selector styling must exist');
        assert.ok(css.includes('.role-btn'), '.role-btn styling must exist');
        assert.ok(css.includes('.role-btn.selected'), '.role-btn.selected styling must exist');

        const js = fs.readFileSync(jsPath, 'utf8');
        assert.ok(js.includes('selectRole('), 'selectRole handler must exist in mobile.js');
        assert.ok(js.includes('HOST_ALREADY_EXISTS'), 'HOST_ALREADY_EXISTS error handler must exist in mobile.js');
    });

    test('mobile/mobile.css provides touch optimizations, themes and buzzer states', () => {
        const css = fs.readFileSync(cssPath, 'utf8');
        assert.ok(css.includes('touch-action: manipulation'), 'touch-action: manipulation must be defined');
        assert.ok(css.includes('-webkit-tap-highlight-color: transparent'), 'Tap highlight must be disabled');
        assert.ok(css.includes('body.light-theme'), 'Light theme support must exist');
        assert.ok(css.includes('.giant-buzzer-btn'), 'Giant buzzer styles must exist');
        assert.ok(css.includes('.state-locked'), 'Buzzer locked state must exist');
        assert.ok(css.includes('.state-ready'), 'Buzzer ready state must exist');
        assert.ok(css.includes('.state-self-buzzed'), 'Buzzer self state must exist');
        assert.ok(css.includes('.state-other-buzzed'), 'Buzzer other state must exist');
        assert.ok(css.includes('.state-locked-out'), 'Buzzer locked-out state must exist');
    });

    test('NetworkClient supports all mobile player actions and role parameter', () => {
        const client = new NetworkClient({ url: 'ws://127.0.0.1:8080', isHost: false });
        assert.equal(typeof client.joinRoom, 'function', 'joinRoom method must exist');
        assert.equal(typeof client.buzz, 'function', 'buzz method must exist');
        assert.equal(typeof client.submitAnswer, 'function', 'submitAnswer method must exist');
        assert.equal(typeof client.auctionBet, 'function', 'auctionBet method must exist');
        assert.equal(typeof client.catTransfer, 'function', 'catTransfer method must exist');
        assert.equal(typeof client.getHost, 'function', 'getHost method must exist');
        assert.equal(client.role, 'player');
    });

    test('Server HTTP routes /mobile and /mobile/ cleanly to mobile/index.html', async () => {
        let port;
        await new Promise((resolve) => {
            server.listen(0, '127.0.0.1', () => {
                port = server.address().port;
                resolve();
            });
        });

        try {
            // Test /mobile
            const res1 = await fetch(`http://127.0.0.1:${port}/mobile`);
            assert.equal(res1.status, 200);
            assert.ok(res1.headers.get('content-type').includes('text/html'));
            const text1 = await res1.text();
            assert.ok(text1.includes('Quiz U — Мобильный пульт'));

            // Test /mobile/
            const res2 = await fetch(`http://127.0.0.1:${port}/mobile/`);
            assert.equal(res2.status, 200);
            const text2 = await res2.text();
            assert.ok(text2.includes('id="screen-buzzer"'));

            // Test /mobile/mobile.css
            const res3 = await fetch(`http://127.0.0.1:${port}/mobile/mobile.css`);
            assert.equal(res3.status, 200);
            assert.ok(res3.headers.get('content-type').includes('text/css'));

            // Test /mobile/mobile.js
            const res4 = await fetch(`http://127.0.0.1:${port}/mobile/mobile.js`);
            assert.equal(res4.status, 200);
            assert.ok(res4.headers.get('content-type').includes('application/javascript'));
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    test('End-to-End WebSocket Flow: Mobile Host & Player join, buzzer, answer, auction & cat transfer', async () => {
        let port;
        let wsUrl;

        await new Promise((resolve) => {
            server.listen(0, '127.0.0.1', () => {
                port = server.address().port;
                wsUrl = `ws://127.0.0.1:${port}`;
                resolve();
            });
        });

        function createWaiter(ws) {
            const queue = [];
            const listeners = [];

            ws.on('message', (data) => {
                const parsed = parseMessage(data);
                if (!parsed) return;
                for (let i = 0; i < listeners.length; i++) {
                    const l = listeners[i];
                    if (l.type === parsed.type) {
                        listeners.splice(i, 1);
                        clearTimeout(l.timer);
                        l.resolve(parsed);
                        return;
                    }
                }
                queue.push(parsed);
            });

            return function waitFor(expectedType, timeoutMs = 3000) {
                const qIdx = queue.findIndex(m => m.type === expectedType);
                if (qIdx !== -1) {
                    const [msg] = queue.splice(qIdx, 1);
                    return Promise.resolve(msg);
                }

                return new Promise((resolve, reject) => {
                    const item = {
                        type: expectedType,
                        resolve,
                        reject,
                        timer: null
                    };
                    item.timer = setTimeout(() => {
                        const idx = listeners.indexOf(item);
                        if (idx !== -1) listeners.splice(idx, 1);
                        reject(new Error(`Timeout waiting for message "${expectedType}"`));
                    }, timeoutMs);
                    listeners.push(item);
                });
            };
        }

        try {
            // 1. Host screen (PC TV) connects and creates room
            const hostWs = new WebSocket(wsUrl);
            await new Promise((res) => hostWs.on('open', res));
            const waitHost = createWaiter(hostWs);

            hostWs.send(createMessage(MSG_TYPES.HOST_CREATE_ROOM, { options: { answerTime: 3 } }));
            const roomCreatedMsg = await waitHost(MSG_TYPES.ROOM_CREATED);
            const roomCode = roomCreatedMsg.payload.roomCode;
            assert.ok(roomCode);

            // 1b. Mobile Host connects with role 'host' (TASK-03)
            const mobileHostWs = new WebSocket(wsUrl);
            await new Promise((res) => mobileHostWs.on('open', res));
            const waitMobileHost = createWaiter(mobileHostWs);

            mobileHostWs.send(createMessage(MSG_TYPES.PLAYER_JOIN, {
                roomCode,
                name: 'Мобильный Ведущий',
                avatar: '🎙️',
                role: 'host'
            }));
            const mobileHostState = await waitMobileHost(MSG_TYPES.ROOM_STATE);
            assert.equal(mobileHostState.payload.self.role, 'host');
            assert.equal(mobileHostState.payload.host.name, 'Мобильный Ведущий');

            // 1c. Second Mobile Host attempted — must be rejected with HOST_ALREADY_EXISTS (TASK-03)
            const duplicateHostWs = new WebSocket(wsUrl);
            await new Promise((res) => duplicateHostWs.on('open', res));
            const waitDupHost = createWaiter(duplicateHostWs);
            duplicateHostWs.send(createMessage(MSG_TYPES.PLAYER_JOIN, {
                roomCode,
                name: 'Второй Ведущий',
                avatar: '🎙️',
                role: 'host'
            }));
            const errDupHost = await waitDupHost(MSG_TYPES.ERROR);
            assert.equal(errDupHost.payload.code, ERROR_CODES.HOST_ALREADY_EXISTS);
            duplicateHostWs.close();

            // 2. Mobile Player 1 connects
            const player1Ws = new WebSocket(wsUrl);
            await new Promise((res) => player1Ws.on('open', res));
            const waitP1 = createWaiter(player1Ws);

            player1Ws.send(createMessage(MSG_TYPES.PLAYER_JOIN, {
                roomCode,
                name: 'Мобильный Игрок',
                avatar: '🚀',
                role: 'player'
            }));

            const p1State = await waitP1(MSG_TYPES.ROOM_STATE);
            assert.equal(p1State.payload.roomCode, roomCode);
            assert.equal(p1State.payload.self.name, 'Мобильный Игрок');
            assert.equal(p1State.payload.self.avatar, '🚀');
            assert.equal(p1State.payload.self.role, 'player');
            const p1Id = p1State.payload.self.id;
            const p1Token = p1State.payload.sessionToken;
            assert.ok(p1Token, 'Player must receive sessionToken for fast reconnect');

            // 3. Mobile Player 2 connects
            const player2Ws = new WebSocket(wsUrl);
            await new Promise((res) => player2Ws.on('open', res));
            const waitP2 = createWaiter(player2Ws);
            player2Ws.send(createMessage(MSG_TYPES.PLAYER_JOIN, {
                roomCode,
                name: 'Второй Игрок',
                avatar: '🐼',
                role: 'player'
            }));
            const p2State = await waitP2(MSG_TYPES.ROOM_STATE);
            const p2Id = p2State.payload.self.id;

            // 4. Host starts game and selects question
            hostWs.send(createMessage(MSG_TYPES.HOST_START_GAME));
            await waitP1(MSG_TYPES.ROOM_STATE);

            hostWs.send(createMessage(MSG_TYPES.HOST_SELECT_QUESTION, {
                themeIdx: 0,
                questionIdx: 0,
                question: { q: 'Столица Франции?', a: 'Париж', price: 200 }
            }));
            await waitP1(MSG_TYPES.QUESTION_ACTIVE);
            // Mobile host also receives the question with secret answer
            const mobileHostQuestion = await waitMobileHost(MSG_TYPES.QUESTION_ACTIVE);
            assert.equal(mobileHostQuestion.payload.question.a, 'Париж', 'Mobile host receives secret answer');

            hostWs.send(createMessage(MSG_TYPES.HOST_ACTIVATE_BUZZER));
            await waitP1(MSG_TYPES.BUZZER_READY);

            // 5. Player 1 presses Buzzer
            player1Ws.send(createMessage(MSG_TYPES.PLAYER_BUZZ));
            const buzzLockedMsg = await waitP1(MSG_TYPES.BUZZ_LOCKED);
            assert.equal(buzzLockedMsg.payload.playerId, p1Id);

            // 6. Player 1 submits answer text from Screen 4
            player1Ws.send(createMessage(MSG_TYPES.PLAYER_SUBMIT_ANSWER, { answerText: 'Париж' }));
            const submittedMsg = await waitHost(MSG_TYPES.ANSWER_SUBMITTED);
            assert.equal(submittedMsg.payload.answerText, 'Париж');
            assert.equal(submittedMsg.payload.playerName, 'Мобильный Игрок');

            // 7. Host judges correct
            hostWs.send(createMessage(MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: true }));
            const scoreMsg = await waitP1(MSG_TYPES.SCORE_UPDATED);
            assert.equal(scoreMsg.payload.newScore, 200);

            // 8. Player 1 makes auction bet
            player1Ws.send(createMessage(MSG_TYPES.PLAYER_AUCTION_BET, { amount: 500 }));
            const betMsg = await waitHost(MSG_TYPES.AUCTION_BET_MADE);
            assert.equal(betMsg.payload.amount, 500);
            assert.equal(betMsg.payload.playerName, 'Мобильный Игрок');

            // 9. Player 1 transfers cat in bag to Player 2
            player1Ws.send(createMessage(MSG_TYPES.PLAYER_CAT_TRANSFER, { targetPlayerId: p2Id }));
            const catMsg = await waitHost(MSG_TYPES.CAT_TRANSFERRED);
            assert.equal(catMsg.payload.toPlayerId, p2Id);
            assert.equal(catMsg.payload.toPlayerName, 'Второй Игрок');

            // Close sockets
            mobileHostWs.close();
            player1Ws.close();
            player2Ws.close();
            hostWs.close();
        } finally {
            roomManager.destroy();
            await new Promise((resolve) => {
                wss.close(() => {
                    server.close(resolve);
                });
            });
        }
    });
});
