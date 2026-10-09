const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { WebSocket } = require('ws');
const { server, wss, roomManager } = require('../src/server');
const { MSG_TYPES, ERROR_CODES, createMessage, parseMessage } = require('../src/protocol');

test('Server: Real WebSocket Integration Test', async (t) => {
    let port;
    let wsUrl;

    // Helper to await client message of specific type
    function waitForMessage(ws, expectedType, timeoutMs = 3000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                ws.removeListener('message', onMsg);
                reject(new Error(`Timeout waiting for message type "${expectedType}"`));
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

    t.before(async () => {
        await new Promise((resolve) => {
            server.listen(0, '127.0.0.1', () => {
                port = server.address().port;
                wsUrl = `ws://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    t.after(async () => {
        roomManager.destroy();
        for (const client of wss.clients) {
            try { client.terminate(); } catch {}
        }
        await new Promise((resolve) => {
            wss.close(() => {
                server.close(resolve);
            });
        });
    });

    await t.test('HTTP health check and stats endpoints respond correctly', async () => {
        const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
        assert.equal(healthRes.status, 200);
        const healthData = await healthRes.json();
        assert.equal(healthData.status, 'ok');

        const statsRes = await fetch(`http://127.0.0.1:${port}/api/stats`);
        assert.equal(statsRes.status, 200);
        const statsData = await statsRes.json();
        assert.equal(typeof statsData.totalRooms, 'number');
    });

    await t.test('HTTP server correctly serves root and mobile index.html, styles and scripts', async () => {
        // Root /
        const rootRes = await fetch(`http://127.0.0.1:${port}/`);
        assert.equal(rootRes.status, 200);
        assert.ok(rootRes.headers.get('content-type').includes('text/html'));
        const rootHtml = await rootRes.text();
        assert.ok(rootHtml.includes('<!DOCTYPE html>'));

        // /index.html
        const indexRes = await fetch(`http://127.0.0.1:${port}/index.html`);
        assert.equal(indexRes.status, 200);

        // /mobile and /mobile/
        const mobileRes = await fetch(`http://127.0.0.1:${port}/mobile/`);
        assert.equal(mobileRes.status, 200);
        assert.ok(mobileRes.headers.get('content-type').includes('text/html'));

        // /css/style.css
        const cssRes = await fetch(`http://127.0.0.1:${port}/css/style.css`);
        assert.equal(cssRes.status, 200);
        assert.ok(cssRes.headers.get('content-type').includes('text/css'));

        // /js/game.js
        const jsRes = await fetch(`http://127.0.0.1:${port}/js/game.js`);
        assert.equal(jsRes.status, 200);
        assert.ok(jsRes.headers.get('content-type').includes('javascript'));
    });

    await t.test('End-to-End WebSocket Flow: Host creates room, Players join, Buzzer arbitration & Anti-Cheat', async () => {
        // 1. Connect Host WS
        const hostWs = new WebSocket(wsUrl);
        await new Promise((res) => hostWs.on('open', res));

        // Host requests room creation
        hostWs.send(createMessage(MSG_TYPES.HOST_CREATE_ROOM, { options: { readingTime: 1, answerTime: 2 } }));
        const roomCreatedMsg = await waitForMessage(hostWs, MSG_TYPES.ROOM_CREATED);
        const roomCode = roomCreatedMsg.payload.roomCode;
        assert.ok(roomCode);
        assert.equal(roomCode.length, 4);

        // 1b. Attempt to start game with 0 players -> must fail with NOT_ENOUGH_PLAYERS (TASK-05)
        hostWs.send(createMessage(MSG_TYPES.HOST_START_GAME));
        const errTooFew = await waitForMessage(hostWs, MSG_TYPES.ERROR);
        assert.equal(errTooFew.payload.code, ERROR_CODES.NOT_ENOUGH_PLAYERS);

        // 2. Connect Player 1 WS
        const p1Ws = new WebSocket(wsUrl);
        await new Promise((res) => p1Ws.on('open', res));
        p1Ws.send(createMessage(MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Кот Матроскин', avatar: '🐱' }));

        const p1StateMsg = await waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);
        assert.equal(p1StateMsg.payload.roomCode, roomCode);
        assert.equal(p1StateMsg.payload.self.name, 'Кот Матроскин');

        // 3. Connect Player 2 WS
        const p2Ws = new WebSocket(wsUrl);
        await new Promise((res) => p2Ws.on('open', res));
        p2Ws.send(createMessage(MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Шарик', avatar: '🐶' }));

        const p2StateMsg = await waitForMessage(p2Ws, MSG_TYPES.ROOM_STATE);
        assert.equal(p2StateMsg.payload.self.name, 'Шарик');

        // 4. Host starts game
        hostWs.send(createMessage(MSG_TYPES.HOST_START_GAME));
        await waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        // 5. Host selects question (verify Anti-Cheat!)
        hostWs.send(createMessage(MSG_TYPES.HOST_SELECT_QUESTION, {
            themeIdx: 0,
            questionIdx: 0,
            question: {
                q: 'Главный вопрос вселенной?',
                a: '42 (СЕКРЕТНЫЙ ОТВЕТ)',
                price: 400
            }
        }));

        const p1QuestionMsg = await waitForMessage(p1Ws, MSG_TYPES.QUESTION_ACTIVE);
        assert.equal(p1QuestionMsg.payload.question.q, 'Главный вопрос вселенной?');
        assert.equal(p1QuestionMsg.payload.question.a, undefined, 'Anti-Cheat: Answer field "a" must not reach player client');

        // 6. Host activates buzzer
        hostWs.send(createMessage(MSG_TYPES.HOST_ACTIVATE_BUZZER));
        await waitForMessage(p1Ws, MSG_TYPES.BUZZER_READY);

        // 7. Player 1 hits buzzer first
        p1Ws.send(createMessage(MSG_TYPES.PLAYER_BUZZ));

        const buzzLockedMsg = await waitForMessage(p2Ws, MSG_TYPES.BUZZ_LOCKED);
        assert.equal(buzzLockedMsg.payload.playerName, 'Кот Матроскин');

        // 8. Host judges answer as correct
        hostWs.send(createMessage(MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: true }));

        const scoreMsg = await waitForMessage(p1Ws, MSG_TYPES.SCORE_UPDATED);
        assert.equal(scoreMsg.payload.playerName, 'Кот Матроскин');
        assert.equal(scoreMsg.payload.newScore, 400);

        // Cleanup test sockets
        p1Ws.close();
        p2Ws.close();
        hostWs.close();
    });

    await t.test('HTTP server correctly serves question packs with percent-encoded Cyrillic paths', async () => {
        // Test standard encoded Cyrillic path
        const packPath = encodeURI('/паки вопросов/01_Мультфильмы_и_Сказки/001_Золотая классика Союзмультфильма.json');
        const res = await fetch(`http://127.0.0.1:${port}${packPath}`);
        assert.equal(res.status, 200, `Expected 200 for ${packPath}, got ${res.status}`);
        const packJson = await res.json();
        assert.ok(packJson.themes || packJson.rounds || Array.isArray(packJson), 'Pack JSON should contain themes or rounds');
    });

    await t.test('HTTP server rejects path traversal attempts with 403 Forbidden', async () => {
        const res = await fetch(`http://127.0.0.1:${port}/..%2fpackage.json`);
        assert.equal(res.status, 403);
    });

    await t.test('Server rejects messages with missing required payload fields with INVALID_PAYLOAD', async () => {
        const clientWs = new WebSocket(wsUrl);
        await new Promise((res) => clientWs.on('open', res));

        // 1. PLAYER_JOIN with empty payload
        clientWs.send(JSON.stringify({ type: MSG_TYPES.PLAYER_JOIN }));
        const errEmpty = await waitForMessage(clientWs, MSG_TYPES.ERROR);
        assert.equal(errEmpty.payload.code, ERROR_CODES.INVALID_PAYLOAD);

        // 2. PLAYER_JOIN with missing name
        clientWs.send(createMessage(MSG_TYPES.PLAYER_JOIN, { roomCode: 'ABCD' }));
        const errMissingName = await waitForMessage(clientWs, MSG_TYPES.ERROR);
        assert.equal(errMissingName.payload.code, ERROR_CODES.INVALID_PAYLOAD);

        clientWs.close();
    });

    await t.test('Host creating new room cleans up previously created room on same socket', async () => {
        const hostWs = new WebSocket(wsUrl);
        await new Promise((res) => hostWs.on('open', res));

        // 1. Create first room
        hostWs.send(createMessage(MSG_TYPES.HOST_CREATE_ROOM));
        const res1 = await waitForMessage(hostWs, MSG_TYPES.ROOM_CREATED);
        const code1 = res1.payload.roomCode;
        assert.ok(roomManager.getRoom(code1));

        // 2. Create second room on same socket -> first room should be deleted
        hostWs.send(createMessage(MSG_TYPES.HOST_CREATE_ROOM));
        const res2 = await waitForMessage(hostWs, MSG_TYPES.ROOM_CREATED);
        const code2 = res2.payload.roomCode;
        assert.notEqual(code1, code2);
        assert.equal(roomManager.getRoom(code1), null, 'Old room must be deleted');
        assert.ok(roomManager.getRoom(code2), 'New room must exist');

        hostWs.close();
    });
});
