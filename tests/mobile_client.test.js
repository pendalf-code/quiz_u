const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocket } = require('../server/node_modules/ws');

const rootDir = path.resolve(__dirname, '..');
const { server, wss, roomManager } = require('../server/src/server');
const { MSG_TYPES, createMessage, parseMessage } = require('../server/src/protocol');
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

    test('NetworkClient supports all mobile player actions', () => {
        const client = new NetworkClient({ url: 'ws://127.0.0.1:8080', isHost: false });
        assert.equal(typeof client.joinRoom, 'function', 'joinRoom method must exist');
        assert.equal(typeof client.buzz, 'function', 'buzz method must exist');
        assert.equal(typeof client.submitAnswer, 'function', 'submitAnswer method must exist');
        assert.equal(typeof client.auctionBet, 'function', 'auctionBet method must exist');
        assert.equal(typeof client.catTransfer, 'function', 'catTransfer method must exist');
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

    test('End-to-End WebSocket Flow: Mobile Player join, buzzer, answer, auction & cat transfer', async () => {
        let port;
        let wsUrl;

        await new Promise((resolve) => {
            server.listen(0, '127.0.0.1', () => {
                port = server.address().port;
                wsUrl = `ws://127.0.0.1:${port}`;
                resolve();
            });
        });

        function waitForMessage(ws, expectedType, timeoutMs = 3000) {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    ws.removeListener('message', onMsg);
                    reject(new Error(`Timeout waiting for message "${expectedType}"`));
                }, timeoutMs);

                function onMsg(data) {
                    const parsed = parseMessage(data);
                    if (parsed && parsed.type === expectedType) {
                        clearTimeout(timer);
                        ws.removeListener('message', onMsg);
                        resolve(parsed);
                    }
                }

                ws.on('message', onMsg);
            });
        }

        try {
            // 1. Host connects and creates room
            const hostWs = new WebSocket(wsUrl);
            await new Promise((res) => hostWs.on('open', res));

            hostWs.send(createMessage(MSG_TYPES.HOST_CREATE_ROOM, { options: { answerTime: 3 } }));
            const roomCreatedMsg = await waitForMessage(hostWs, MSG_TYPES.ROOM_CREATED);
            const roomCode = roomCreatedMsg.payload.roomCode;
            assert.ok(roomCode);

            // 2. Mobile Player 1 connects
            const player1Ws = new WebSocket(wsUrl);
            await new Promise((res) => player1Ws.on('open', res));

            player1Ws.send(createMessage(MSG_TYPES.PLAYER_JOIN, {
                roomCode,
                name: 'Мобильный Игрок',
                avatar: '🚀'
            }));

            const p1State = await waitForMessage(player1Ws, MSG_TYPES.ROOM_STATE);
            assert.equal(p1State.payload.roomCode, roomCode);
            assert.equal(p1State.payload.self.name, 'Мобильный Игрок');
            assert.equal(p1State.payload.self.avatar, '🚀');
            const p1Id = p1State.payload.self.id;
            const p1Token = p1State.payload.sessionToken;
            assert.ok(p1Token, 'Player must receive sessionToken for fast reconnect');

            // 3. Mobile Player 2 connects
            const player2Ws = new WebSocket(wsUrl);
            await new Promise((res) => player2Ws.on('open', res));
            player2Ws.send(createMessage(MSG_TYPES.PLAYER_JOIN, {
                roomCode,
                name: 'Второй Игрок',
                avatar: '🐼'
            }));
            const p2State = await waitForMessage(player2Ws, MSG_TYPES.ROOM_STATE);
            const p2Id = p2State.payload.self.id;

            // 4. Host starts question & activates buzzer
            hostWs.send(createMessage(MSG_TYPES.HOST_START_GAME));
            await waitForMessage(player1Ws, MSG_TYPES.ROOM_STATE);

            hostWs.send(createMessage(MSG_TYPES.HOST_SELECT_QUESTION, {
                themeIdx: 0,
                questionIdx: 0,
                question: { q: 'Столица Франции?', a: 'Париж', price: 200 }
            }));
            await waitForMessage(player1Ws, MSG_TYPES.QUESTION_ACTIVE);

            hostWs.send(createMessage(MSG_TYPES.HOST_ACTIVATE_BUZZER));
            await waitForMessage(player1Ws, MSG_TYPES.BUZZER_READY);

            // 5. Player 1 presses Buzzer
            player1Ws.send(createMessage(MSG_TYPES.PLAYER_BUZZ));
            const buzzLockedMsg = await waitForMessage(player1Ws, MSG_TYPES.BUZZ_LOCKED);
            assert.equal(buzzLockedMsg.payload.playerId, p1Id);

            // 6. Player 1 submits answer text from Screen 4
            player1Ws.send(createMessage(MSG_TYPES.PLAYER_SUBMIT_ANSWER, { answerText: 'Париж' }));
            const submittedMsg = await waitForMessage(hostWs, MSG_TYPES.ANSWER_SUBMITTED);
            assert.equal(submittedMsg.payload.answerText, 'Париж');
            assert.equal(submittedMsg.payload.playerName, 'Мобильный Игрок');

            // 7. Host judges correct
            hostWs.send(createMessage(MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: true }));
            const scoreMsg = await waitForMessage(player1Ws, MSG_TYPES.SCORE_UPDATED);
            assert.equal(scoreMsg.payload.newScore, 200);

            // 8. Player 1 makes auction bet
            player1Ws.send(createMessage(MSG_TYPES.PLAYER_AUCTION_BET, { amount: 500 }));
            const betMsg = await waitForMessage(hostWs, MSG_TYPES.AUCTION_BET_MADE);
            assert.equal(betMsg.payload.amount, 500);
            assert.equal(betMsg.payload.playerName, 'Мобильный Игрок');

            // 9. Player 1 transfers cat in bag to Player 2
            player1Ws.send(createMessage(MSG_TYPES.PLAYER_CAT_TRANSFER, { targetPlayerId: p2Id }));
            const catMsg = await waitForMessage(hostWs, MSG_TYPES.CAT_TRANSFERRED);
            assert.equal(catMsg.payload.toPlayerId, p2Id);
            assert.equal(catMsg.payload.toPlayerName, 'Второй Игрок');

            // Close sockets
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
