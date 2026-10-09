const { test, describe, before, after } = require('node:test');
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

    let sharedPort;
    let sharedWsUrl;

    before(async () => {
        if (!server.listening) {
            await new Promise((resolve) => {
                server.listen(0, '127.0.0.1', () => {
                    sharedPort = server.address().port;
                    sharedWsUrl = `ws://127.0.0.1:${sharedPort}`;
                    resolve();
                });
            });
        } else {
            sharedPort = server.address().port;
            sharedWsUrl = `ws://127.0.0.1:${sharedPort}`;
        }
    });

    after(async () => {
        roomManager.destroy();
        for (const client of wss.clients) {
            try { client.terminate(); } catch {}
        }
        if (server.listening) {
            await new Promise((resolve) => {
                wss.close(() => {
                    server.close(resolve);
                });
            });
        }
    });

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
        assert.ok(html.includes('id="btn-host-judge-wrong-penalty"'), '#btn-host-judge-wrong-penalty must exist');
        assert.ok(html.includes('id="btn-host-pass-turn"'), '#btn-host-pass-turn must exist');
        assert.ok(html.includes('id="btn-host-skip-round"'), '#btn-host-skip-round must exist');
        assert.ok(html.includes('id="btn-host-add-all-scores"'), '#btn-host-add-all-scores must exist');
        assert.ok(html.includes('id="modal-host-all-scores"'), '#modal-host-all-scores must exist');
        assert.ok(!html.includes('id="btn-host-open-buzzer"'), '#btn-host-open-buzzer must NOT exist');
        assert.ok(html.includes('id="btn-host-pause"'), '#btn-host-pause must exist');
        assert.ok(html.includes('id="btn-host-show-answer"'), '#btn-host-show-answer must exist');
        assert.ok(html.includes('id="btn-host-close-question"'), '#btn-host-close-question must exist');
        assert.ok(html.includes('id="btn-host-start-game"'), '#btn-host-start-game must exist');
        assert.ok(html.includes('id="host-players-list"'), '#host-players-list must exist');
        // Manual score adjustment and auction/cat controls
        assert.ok(html.includes('id="host-answering-details"'), '#host-answering-details must exist');
        assert.ok(html.includes('id="host-answering-secret-answer"'), '#host-answering-secret-answer must exist');
        assert.ok(!html.includes('id="btn-host-add-score"'), '#btn-host-add-score must NOT exist in host controls');
        assert.ok(!html.includes('id="btn-host-subtract-score"'), '#btn-host-subtract-score must NOT exist in host controls');
        assert.ok(html.includes('id="host-auction-panel"'), '#host-auction-panel must exist');
        assert.ok(html.includes('id="host-auction-list"'), '#host-auction-list must exist');

        const css = fs.readFileSync(cssPath, 'utf8');
        assert.ok(css.includes('#screen-host'), '#screen-host styles must exist in mobile.css');
        assert.ok(css.includes('.host-secret-box'), '.host-secret-box styles must exist in mobile.css');
        assert.ok(css.includes('.btn-judge-accept'), '.btn-judge-accept styles must exist in mobile.css');
        assert.ok(css.includes('.btn-judge-reject'), '.btn-judge-reject styles must exist in mobile.css');
        assert.ok(css.includes('.btn-judge-reject-penalty'), '.btn-judge-reject-penalty styles must exist in mobile.css');
        assert.ok(css.includes('.score-step-btn'), '.score-step-btn styles must exist in mobile.css');
        assert.ok(css.includes('.host-answering-details'), '.host-answering-details styles must exist in mobile.css');
        assert.ok(css.includes('.host-auction-panel'), '.host-auction-panel styles must exist in mobile.css');

        const js = fs.readFileSync(jsPath, 'utf8');
        assert.ok(js.includes('updateHostScreen('), 'updateHostScreen method must exist in mobile.js');
        assert.ok(js.includes('renderHostPlayersList('), 'renderHostPlayersList method must exist in mobile.js');
        assert.ok(js.includes('btnHostJudgeCorrect'), 'btnHostJudgeCorrect listener must exist in mobile.js');
        assert.ok(js.includes('btnHostPause'), 'btnHostPause listener must exist in mobile.js');
        assert.ok(js.includes("host: document.getElementById('screen-host')"), 'host screen must be registered in elements.screens');
        assert.ok(js.includes("btnHostJudgeCorrect: document.getElementById('btn-host-judge-correct')"), 'btnHostJudgeCorrect must be registered in elements');
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
        assert.equal(typeof client.startAuctionAnswer, 'function', 'startAuctionAnswer method must exist');
        assert.equal(typeof client.setAuctionBets, 'function', 'setAuctionBets method must exist');
        assert.equal(typeof client.setCatTarget, 'function', 'setCatTarget method must exist');
        assert.equal(typeof client.setAuctionLeader, 'function', 'setAuctionLeader method must exist');
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
        // Test /mobile
        const res1 = await fetch(`http://127.0.0.1:${sharedPort}/mobile`);
        assert.equal(res1.status, 200);
        assert.ok(res1.headers.get('content-type').includes('text/html'));
        const text1 = await res1.text();
        assert.ok(text1.includes('Quiz U — Мобильный пульт'));

        // Test /mobile/
        const res2 = await fetch(`http://127.0.0.1:${sharedPort}/mobile/`);
        assert.equal(res2.status, 200);
        const text2 = await res2.text();
        assert.ok(text2.includes('id="screen-buzzer"'));

        // Test /mobile/mobile.css
        const res3 = await fetch(`http://127.0.0.1:${sharedPort}/mobile/mobile.css`);
        assert.equal(res3.status, 200);
        assert.ok(res3.headers.get('content-type').includes('text/css'));

        // Test /mobile/mobile.js
        const res4 = await fetch(`http://127.0.0.1:${sharedPort}/mobile/mobile.js`);
        assert.equal(res4.status, 200);
        assert.ok(res4.headers.get('content-type').includes('application/javascript'));
    });

    test('End-to-End WebSocket Flow: Mobile Host & Player join, buzzer, answer, auction & cat transfer', async () => {
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

        // 1. Host screen (PC TV) connects and creates room
        const hostWs = new WebSocket(sharedWsUrl);
        await new Promise((res) => hostWs.on('open', res));
        const hostWait = createWaiter(hostWs);

        hostWs.send(createMessage(MSG_TYPES.HOST_CREATE_ROOM, {}));

        const created = await hostWait(MSG_TYPES.ROOM_CREATED);
        const roomCode = created.payload.roomCode;
        assert.ok(roomCode, 'Room code must be received');

        // 2. Mobile Host connects and joins as role host
        const mobileHostWs = new WebSocket(sharedWsUrl);
        await new Promise((res) => mobileHostWs.on('open', res));
        const mobileHostWait = createWaiter(mobileHostWs);

        mobileHostWs.send(createMessage(MSG_TYPES.PLAYER_JOIN, {
            roomCode,
            name: 'Ведущий',
            role: 'host',
            avatar: '🎙️'
        }));

        const mobileHostState = await mobileHostWait(MSG_TYPES.ROOM_STATE);
        assert.equal(mobileHostState.payload.role, 'host');
        assert.ok(mobileHostState.payload.sessionToken, 'Mobile host receives session token');

        // 3. Player 1 joins with role player
        const player1Ws = new WebSocket(sharedWsUrl);
        await new Promise((res) => player1Ws.on('open', res));
        const p1Wait = createWaiter(player1Ws);

        player1Ws.send(createMessage(MSG_TYPES.PLAYER_JOIN, {
            roomCode,
            name: 'Алиса',
            role: 'player',
            avatar: '🐱'
        }));

        const p1State = await p1Wait(MSG_TYPES.ROOM_STATE);
        assert.equal(p1State.payload.role, 'player');
        const p1Id = p1State.payload.self.id;

        // 4. Player 2 joins with role player
        const player2Ws = new WebSocket(sharedWsUrl);
        await new Promise((res) => player2Ws.on('open', res));
        const p2Wait = createWaiter(player2Ws);

        player2Ws.send(createMessage(MSG_TYPES.PLAYER_JOIN, {
            roomCode,
            name: 'Борис',
            role: 'player',
            avatar: '🦊'
        }));

        const p2State = await p2Wait(MSG_TYPES.ROOM_STATE);
        const p2Id = p2State.payload.self.id;

        // 4b. Host starts game (LOBBY -> BOARD)
        hostWs.send(createMessage(MSG_TYPES.HOST_START_GAME));
        await hostWait(MSG_TYPES.ROOM_STATE);

        // 5. Host activates question & opens buzzer
        hostWs.send(createMessage(MSG_TYPES.HOST_SELECT_QUESTION, {
            themeIdx: 0,
            questionIdx: 0,
            question: { q: 'Какой город?', a: 'Ю', theme: 'География', price: 200 }
        }));

        const p1Q = await p1Wait(MSG_TYPES.QUESTION_ACTIVE);
        assert.equal(p1Q.payload.cost, 200);
        assert.equal(p1Q.payload.question.a, undefined, 'Anti-Cheat: Player must NOT receive answer!');

        const mobileHostQ = await mobileHostWait(MSG_TYPES.QUESTION_ACTIVE);
        assert.equal(mobileHostQ.payload.question.a, 'Ю', 'Host receives answer for judging');

        // 6. Host opens buzzer
        hostWs.send(createMessage(MSG_TYPES.HOST_ACTIVATE_BUZZER, {
            allowedPlayerIds: [p1Id, p2Id]
        }));

        await p1Wait(MSG_TYPES.BUZZER_READY);
        await p2Wait(MSG_TYPES.BUZZER_READY);

        // 7. Player 1 buzzes
        player1Ws.send(createMessage(MSG_TYPES.PLAYER_BUZZ, {}));

        const lockedP1 = await p1Wait(MSG_TYPES.BUZZ_LOCKED);
        assert.equal(lockedP1.payload.playerId, p1Id);

        const lockedP2 = await p2Wait(MSG_TYPES.BUZZ_LOCKED);
        assert.equal(lockedP2.payload.playerId, p1Id);

        // 8. Player 1 submits answer
        player1Ws.send(createMessage(MSG_TYPES.PLAYER_SUBMIT_ANSWER, {
            answerText: 'Ю'
        }));

        const hostAnswer = await hostWait(MSG_TYPES.ANSWER_SUBMITTED);
        assert.equal(hostAnswer.payload.answerText, 'Ю');

        // 9. Host judges answer correct
        hostWs.send(createMessage(MSG_TYPES.HOST_JUDGE_ANSWER, {
            isCorrect: true
        }));

        const p1Score = await p1Wait(MSG_TYPES.SCORE_UPDATED);
        assert.equal(p1Score.payload.newScore, 200);

        // 10. Auction test
        player1Ws.send(createMessage(MSG_TYPES.PLAYER_AUCTION_BET, {
            amount: 300
        }));
        const betP1 = await hostWait(MSG_TYPES.AUCTION_BET_MADE);
        assert.equal(betP1.payload.amount, 300);

        // 11. Cat transfer test
        player1Ws.send(createMessage(MSG_TYPES.PLAYER_CAT_TRANSFER, {
            targetPlayerId: p2Id
        }));
        const catTransfer = await hostWait(MSG_TYPES.CAT_TRANSFERRED);
        assert.equal(catTransfer.payload.toPlayerId, p2Id);

        // Close sockets
        hostWs.close();
        mobileHostWs.close();
        player1Ws.close();
        player2Ws.close();
    });
    test('QR Code auto-fills room code and updates room badge on mobile', () => {
        const js = fs.readFileSync(jsPath, 'utf8');
        assert.ok(js.includes('getRoomCodeFromUrl'), 'mobile.js must define getRoomCodeFromUrl');
        assert.ok(js.includes("urlParams.get('room')"), 'mobile.js must extract room param');
        assert.ok(js.includes('elements.roomCodeInput.value = urlRoom'), 'mobile.js must automatically set roomCodeInput');
        assert.ok(js.includes('updateRoomBadge(urlRoom)'), 'mobile.js must update room badge on URL room code');
        assert.ok(js.includes("addEventListener('pageshow'"), 'mobile.js must handle pageshow for back-forward cache');
    });

    test('Kicking mobile host from desktop notifies mobile host and kicks them to main menu', async () => {
        const hostWs = new WebSocket(sharedWsUrl);
        const hostMessages = [];
        hostWs.on('message', (d) => hostMessages.push(JSON.parse(d.toString())));
        await new Promise(r => hostWs.on('open', r));

        hostWs.send(createMessage(MSG_TYPES.HOST_CREATE_ROOM, {}));
        const waitForMsg = (list, type) => new Promise(resolve => {
            const check = () => {
                const found = list.find(m => m.type === type);
                if (found) resolve(found);
                else setTimeout(check, 10);
            };
            check();
        });

        const created = await waitForMsg(hostMessages, MSG_TYPES.ROOM_CREATED);
        const roomCode = created.payload.roomCode;

        const mobileWs = new WebSocket(sharedWsUrl);
        const mobileMessages = [];
        mobileWs.on('message', (d) => mobileMessages.push(JSON.parse(d.toString())));
        await new Promise(r => mobileWs.on('open', r));

        mobileWs.send(createMessage(MSG_TYPES.PLAYER_JOIN, {
            roomCode,
            name: 'MobileHostUser',
            avatar: '🎙️',
            role: 'host'
        }));

        const joined = await waitForMsg(hostMessages, MSG_TYPES.PLAYER_JOINED);
        const mobileHostId = joined.payload.player.id;
        assert.equal(joined.payload.role, 'host');

        hostWs.send(createMessage(MSG_TYPES.HOST_KICK_PLAYER, {
            playerId: mobileHostId
        }));

        const kickMsg = await waitForMsg(mobileMessages, MSG_TYPES.PLAYER_KICKED);
        assert.equal(kickMsg.payload.playerId, mobileHostId);
        assert.equal(kickMsg.payload.role, 'host');

        const leftMsg = await waitForMsg(mobileMessages, MSG_TYPES.PLAYER_LEFT);
        assert.equal(leftMsg.payload.playerId, mobileHostId);
        assert.equal(leftMsg.payload.kicked, true);

        await new Promise(r => {
            if (mobileWs.readyState === WebSocket.CLOSED) return r();
            mobileWs.on('close', r);
            setTimeout(r, 200);
        });

        hostWs.close();
    });
});
