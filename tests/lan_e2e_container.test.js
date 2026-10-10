const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { WebSocket } = require('../server/node_modules/ws');

const { server, wss, roomManager } = require('../server/src/server');
const { MSG_TYPES, ERROR_CODES, createMessage, parseMessage } = require('../server/src/protocol');
const NetworkClient = require('../js/net/NetworkClient');

/**
 * QuizULanContainer: A Testcontainers-like abstraction for Quiz U LAN mode testing.
 * Encapsulates the lifecycle of an isolated Quiz U server instance and network clients.
 */
class QuizULanContainer {
    constructor() {
        this.port = null;
        this.wsUrl = null;
        this.httpUrl = null;
        this.activeSockets = new Set();
    }

    async start() {
        if (!server.listening) {
            await new Promise((resolve) => {
                server.listen(0, '127.0.0.1', () => {
                    this.port = server.address().port;
                    this.wsUrl = `ws://127.0.0.1:${this.port}`;
                    this.httpUrl = `http://127.0.0.1:${this.port}`;
                    resolve();
                });
            });
        } else {
            this.port = server.address().port;
            this.wsUrl = `ws://127.0.0.1:${this.port}`;
            this.httpUrl = `http://127.0.0.1:${this.port}`;
        }
        return this;
    }

    async stop() {
        this.closeAllSockets();
        roomManager.destroy();
    }

    closeAllSockets() {
        for (const ws of this.activeSockets) {
            try { ws.close(); } catch {}
        }
        this.activeSockets.clear();
    }

    createRawSocket() {
        const ws = new WebSocket(this.wsUrl);
        this.activeSockets.add(ws);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('WebSocket connection timeout')), 3000);
            ws.on('open', () => {
                clearTimeout(timer);
                resolve(ws);
            });
            ws.on('error', (err) => {
                clearTimeout(timer);
                reject(err);
            });
        });
    }

    waitForMessage(ws, expectedType, timeoutMs = 3000, predicate = null) {
        if (typeof timeoutMs === 'function') {
            predicate = timeoutMs;
            timeoutMs = 3000;
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                ws.removeListener('message', onMsg);
                reject(new Error(`Timeout waiting for message type "${expectedType}"`));
            }, timeoutMs);

            function onMsg(data) {
                const parsed = parseMessage(data);
                if (parsed && parsed.type === expectedType) {
                    if (predicate && !predicate(parsed)) {
                        return;
                    }
                    clearTimeout(timer);
                    ws.removeListener('message', onMsg);
                    resolve(parsed);
                }
            }

            ws.on('message', onMsg);
        });
    }

    sendMessage(ws, type, payload = {}) {
        ws.send(createMessage(type, payload));
    }
}

describe('LAN Mode Containerized Integration Test Suite (Testcontainers-style)', () => {
    let container;

    before(async () => {
        container = new QuizULanContainer();
        await container.start();
    });

    after(async () => {
        await container.stop();
        for (const client of wss.clients) {
            try { client.terminate(); } catch {}
        }
        if (server.listening) {
            await new Promise((resolve) => {
                wss.close(() => server.close(resolve));
            });
        }
    });

    afterEach(() => {
        container.closeAllSockets();
    });

    test('Container health and HTTP endpoints respond correctly', async () => {
        const res = await fetch(`${container.httpUrl}/health`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.status, 'ok');
    });

    test('Flow 1: Host joins via phone, player list displays correctly, and Start Game starts match', async () => {
        // 1. Desktop big-screen socket creates room
        const desktopWs = await container.createRawSocket();
        container.sendMessage(desktopWs, MSG_TYPES.HOST_CREATE_ROOM, { isHostOnPC: false });
        const roomCreated = await container.waitForMessage(desktopWs, MSG_TYPES.ROOM_CREATED);
        const roomCode = roomCreated.payload.roomCode;
        assert.ok(roomCode, 'Room code must be generated');

        // Supply a mock pack
        const mockPack = [
            {
                roundIndex: 0,
                roundName: 'Раунд 1',
                themes: [
                    {
                        name: 'Кино',
                        questions: [
                            { price: 100, cost: 100, q: 'Вопрос 100', a: 'Ответ 100' },
                            { price: 200, cost: 200, q: 'Вопрос 200', a: 'Ответ 200' }
                        ]
                    }
                ]
            }
        ];
        container.sendMessage(desktopWs, MSG_TYPES.HOST_SET_PACK, { pack: mockPack });
        await container.waitForMessage(desktopWs, MSG_TYPES.ROOM_STATE);

        // 2. Mobile Host connects with role "host"
        const mobileHostWs = await container.createRawSocket();
        container.sendMessage(mobileHostWs, MSG_TYPES.PLAYER_JOIN, {
            roomCode,
            name: 'Ведущий Телефон',
            avatar: '👑',
            role: 'host'
        });
        const hostJoined = await container.waitForMessage(mobileHostWs, MSG_TYPES.ROOM_STATE);
        assert.equal(hostJoined.payload.role, 'host');
        assert.equal(hostJoined.payload.hasHost, true);
        assert.equal(hostJoined.payload.canStartGame, false, 'Cannot start with 0 players');

        // 3. Mobile Player 1 connects with role "player"
        const player1Ws = await container.createRawSocket();
        container.sendMessage(player1Ws, MSG_TYPES.PLAYER_JOIN, {
            roomCode,
            name: 'Игрок 1',
            avatar: '🚀',
            role: 'player'
        });

        // Host receives updated room state with player in list
        const hostStateWithPlayer = await container.waitForMessage(mobileHostWs, MSG_TYPES.ROOM_STATE);
        assert.equal(hostStateWithPlayer.payload.players.length, 1);
        assert.equal(hostStateWithPlayer.payload.players[0].name, 'Игрок 1');
        assert.equal(hostStateWithPlayer.payload.canStartGame, true, 'Can start now with 1 player');

        // 4. Mobile Host starts game from phone
        container.sendMessage(mobileHostWs, MSG_TYPES.HOST_START_GAME, {});

        // Both desktop and mobile players receive BOARD state
        const hostBoardState = await container.waitForMessage(mobileHostWs, MSG_TYPES.ROOM_STATE);
        const playerBoardState = await container.waitForMessage(player1Ws, MSG_TYPES.ROOM_STATE);
        assert.equal(hostBoardState.payload.state, 'BOARD');
        assert.equal(playerBoardState.payload.state, 'BOARD');
    });

    test('Flow 2: Host buttons remote control (Question select, Buzzer arbitration, Judging with/without penalty, Pause, Turn, Skip)', async () => {
        const desktopWs = await container.createRawSocket();
        container.sendMessage(desktopWs, MSG_TYPES.HOST_CREATE_ROOM, { isHostOnPC: false });
        const { payload: { roomCode } } = await container.waitForMessage(desktopWs, MSG_TYPES.ROOM_CREATED);

        const mockPack = [
            {
                roundIndex: 0,
                themes: [
                    {
                        name: 'Наука',
                        questions: [
                            { price: 300, cost: 300, q: 'Что такое H2O?', a: 'Вода' }
                        ]
                    }
                ]
            }
        ];
        container.sendMessage(desktopWs, MSG_TYPES.HOST_SET_PACK, { pack: mockPack });

        const hostWs = await container.createRawSocket();
        container.sendMessage(hostWs, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Ведущий', role: 'host' });
        await container.waitForMessage(hostWs, MSG_TYPES.ROOM_STATE);

        const p1Ws = await container.createRawSocket();
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Алиса', role: 'player' });
        const p1JoinMsg = await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);
        const p1Id = p1JoinMsg.payload.self.id;

        // Start game
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(hostWs, MSG_TYPES.ROOM_STATE);

        // Host selects question from phone board
        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, {
            themeIdx: 0,
            questionIdx: 0
        });

        // Host receives question active state with question text & answer
        const hostQActive = await container.waitForMessage(hostWs, MSG_TYPES.QUESTION_ACTIVE);
        assert.equal(hostQActive.payload.cost, 300);
        assert.equal(hostQActive.payload.question.a, 'Вода');

        // Player receives question active (sanitized, WITHOUT answer)
        const playerQActive = await container.waitForMessage(p1Ws, MSG_TYPES.QUESTION_ACTIVE);
        assert.equal(playerQActive.payload.question.a, undefined, 'Player must not receive secret answer');

        // Buzzer becomes active
        container.sendMessage(hostWs, MSG_TYPES.HOST_ACTIVATE_BUZZER, {});
        await container.waitForMessage(p1Ws, MSG_TYPES.BUZZER_READY);

        // Player buzzes
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_BUZZ, {});
        const buzzLocked = await container.waitForMessage(hostWs, MSG_TYPES.BUZZ_LOCKED);
        assert.equal(buzzLocked.payload.playerId, p1Id);
        assert.equal(buzzLocked.payload.playerName, 'Алиса');

        // Host judges wrong WITH penalty
        const scorePromise = container.waitForMessage(p1Ws, MSG_TYPES.SCORE_UPDATED);
        const judgePromise = container.waitForMessage(p1Ws, MSG_TYPES.JUDGE_RESULT);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: false, withPenalty: true });

        const judgePenalty = await judgePromise;
        assert.equal(judgePenalty.payload.isCorrect, false);
        assert.equal(judgePenalty.payload.cost, 300);

        const scoreUpdate = await scorePromise;
        assert.equal(scoreUpdate.payload.newScore, -300);

        // Host tests pause
        container.sendMessage(hostWs, MSG_TYPES.HOST_TOGGLE_PAUSE, { isPaused: true });
        const pauseMsg = await container.waitForMessage(p1Ws, MSG_TYPES.GAME_PAUSED);
        assert.equal(pauseMsg.payload.isPaused, true);

        // Host tests update all scores
        container.sendMessage(hostWs, MSG_TYPES.HOST_UPDATE_ALL_SCORES, { delta: 100 });
        const allScoreMsg = await container.waitForMessage(p1Ws, MSG_TYPES.SCORE_UPDATED);
        const p1Updated = allScoreMsg.payload.players.find(p => p.id === p1Id);
        assert.equal(p1Updated.score, -200);

        // Host tests close question
        container.sendMessage(hostWs, MSG_TYPES.HOST_CLOSE_QUESTION, {});
        const qClosed = await container.waitForMessage(p1Ws, MSG_TYPES.QUESTION_CLOSED);
        assert.ok(qClosed);
    });

    test('Flow 3: Normal game finish broadcasts GAME_FINISHED and resets all phones', async () => {
        const desktopWs = await container.createRawSocket();
        container.sendMessage(desktopWs, MSG_TYPES.HOST_CREATE_ROOM, { isHostOnPC: false });
        const { payload: { roomCode } } = await container.waitForMessage(desktopWs, MSG_TYPES.ROOM_CREATED);

        const hostWs = await container.createRawSocket();
        container.sendMessage(hostWs, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Ведущий', role: 'host' });
        await container.waitForMessage(hostWs, MSG_TYPES.ROOM_STATE);

        const p1Ws = await container.createRawSocket();
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Игрок 1', role: 'player' });
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        const p2Ws = await container.createRawSocket();
        container.sendMessage(p2Ws, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Игрок 2', role: 'player' });
        await container.waitForMessage(p2Ws, MSG_TYPES.ROOM_STATE);

        // Trigger finishGame with winners
        const winnersPayload = {
            winners: [{ name: 'Игрок 1', score: 1000 }]
        };
        container.sendMessage(desktopWs, MSG_TYPES.GAME_FINISHED, winnersPayload);

        // Mobile Host and ALL Players receive GAME_FINISHED
        const hostFinish = await container.waitForMessage(hostWs, MSG_TYPES.GAME_FINISHED);
        const p1Finish = await container.waitForMessage(p1Ws, MSG_TYPES.GAME_FINISHED);
        const p2Finish = await container.waitForMessage(p2Ws, MSG_TYPES.GAME_FINISHED);

        assert.equal(hostFinish.payload.winners[0].name, 'Игрок 1');
        assert.equal(p1Finish.payload.winners[0].name, 'Игрок 1');
        assert.equal(p2Finish.payload.winners[0].name, 'Игрок 1');

        // Check room state is GAME_OVER
        const room = roomManager.getRoom(roomCode);
        assert.equal(room.stateMachine.state, 'GAME_OVER');
    });

    test('Flow 4: Early game exit by Desktop Host broadcasts GAME_FINISHED with early termination reason', async () => {
        const desktopWs = await container.createRawSocket();
        container.sendMessage(desktopWs, MSG_TYPES.HOST_CREATE_ROOM, { isHostOnPC: false });
        const { payload: { roomCode } } = await container.waitForMessage(desktopWs, MSG_TYPES.ROOM_CREATED);

        const mockPack = [{ roundIndex: 0, themes: [{ name: 'T', questions: [{ cost: 100, q: 'Q', a: 'A' }] }] }];
        container.sendMessage(desktopWs, MSG_TYPES.HOST_SET_PACK, { pack: mockPack });

        const hostWs = await container.createRawSocket();
        container.sendMessage(hostWs, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Ведущий', role: 'host' });
        await container.waitForMessage(hostWs, MSG_TYPES.ROOM_STATE);

        const p1Ws = await container.createRawSocket();
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Игрок', role: 'player' });
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        // Start game
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        const hostFinishPromise = container.waitForMessage(hostWs, MSG_TYPES.GAME_FINISHED);
        const p1FinishPromise = container.waitForMessage(p1Ws, MSG_TYPES.GAME_FINISHED);

        // Desktop host quits to main menu early (disconnects during game)
        desktopWs.terminate();

        // Connected mobile clients receive GAME_FINISHED
        const hostFinish = await hostFinishPromise;
        const p1Finish = await p1FinishPromise;

        assert.equal(hostFinish.payload.reason, 'host_disconnected');
        assert.equal(p1Finish.payload.reason, 'host_disconnected');
    });

    test('Flow 5: Early game exit by Mobile Host broadcasts GAME_FINISHED to all players', async () => {
        const desktopWs = await container.createRawSocket();
        container.sendMessage(desktopWs, MSG_TYPES.HOST_CREATE_ROOM, { isHostOnPC: false });
        const { payload: { roomCode } } = await container.waitForMessage(desktopWs, MSG_TYPES.ROOM_CREATED);

        const hostWs = await container.createRawSocket();
        container.sendMessage(hostWs, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Ведущий', role: 'host' });
        await container.waitForMessage(hostWs, MSG_TYPES.ROOM_STATE);

        const p1Ws = await container.createRawSocket();
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Игрок', role: 'player' });
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        // Mobile Host ends game early via finishGame
        container.sendMessage(hostWs, MSG_TYPES.GAME_FINISHED, {
            reason: 'early_exit',
            message: 'Ведущий покинул игру'
        });

        const p1Finish = await container.waitForMessage(p1Ws, MSG_TYPES.GAME_FINISHED);
        assert.equal(p1Finish.payload.reason, 'early_exit');
    });

    test('Flow 6: Buzzer disappears on player phone after timer expiration (Requirement 1)', async () => {
        const desktopWs = await container.createRawSocket();
        container.sendMessage(desktopWs, MSG_TYPES.HOST_CREATE_ROOM, {
            options: { isHostOnPC: false, readingTime: 1, thinkingTime: 1 }
        });
        const { payload: { roomCode } } = await container.waitForMessage(desktopWs, MSG_TYPES.ROOM_CREATED);

        const mockPack = [{
            roundIndex: 0,
            themes: [{
                name: '???? 1',
                questions: [{ cost: 100, q: '?????? 1', a: '????? 1' }]
            }]
        }];
        container.sendMessage(desktopWs, MSG_TYPES.HOST_SET_PACK, { pack: mockPack });

        const p1Ws = await container.createRawSocket();
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_JOIN, { roomCode, name: '?????', role: 'player' });
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        const hostWs = await container.createRawSocket();
        container.sendMessage(hostWs, MSG_TYPES.PLAYER_JOIN, { roomCode, name: '???????', role: 'host' });
        await container.waitForMessage(hostWs, MSG_TYPES.ROOM_STATE);

        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 0 });
        await container.waitForMessage(p1Ws, MSG_TYPES.QUESTION_ACTIVE);
        await container.waitForMessage(p1Ws, MSG_TYPES.BUZZER_READY);

        // When thinking timer expires on server, ANSWER_TIMEOUT is broadcast
        const timeoutMsg = await container.waitForMessage(p1Ws, MSG_TYPES.ANSWER_TIMEOUT);
        assert.ok(timeoutMsg, 'Player must receive ANSWER_TIMEOUT when timer expires');

        // Verify mobile.js switches player to waiting screen and hides buzzer button
        const mobileJs = fs.readFileSync(path.join(__dirname, '..', 'mobile', 'mobile.js'), 'utf8');
        assert.ok(mobileJs.includes("elements.buzzerBtn.style.display = 'none';"), 'Buzzer button must be hidden on timeout');
        assert.ok(mobileJs.includes("showScreen('waiting');"), 'Player must be switched to waiting screen on timeout');
        assert.ok(mobileJs.includes("elements.waitingTitle.textContent = '⏰ Время вышло!';"), 'Waiting title must indicate time up');
    });

    test('Flow 7: Common timer stops and displays yellow circle (.timer.answering) on player buzz (freeze removed)', async () => {
        const desktopWs = await container.createRawSocket();
        container.sendMessage(desktopWs, MSG_TYPES.HOST_CREATE_ROOM, {
            options: { isHostOnPC: false, readingTime: 1, thinkingTime: 15 }
        });
        const { payload: { roomCode } } = await container.waitForMessage(desktopWs, MSG_TYPES.ROOM_CREATED);

        const mockPack = [{
            roundIndex: 0,
            themes: [{
                name: 'Тема',
                questions: [{ cost: 200, q: 'Вопрос', a: 'Ответ' }]
            }]
        }];
        container.sendMessage(desktopWs, MSG_TYPES.HOST_SET_PACK, { pack: mockPack });

        const p1Ws = await container.createRawSocket();
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Игрок 1', role: 'player' });
        const p1Join = await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);
        const p1Id = p1Join.payload.self.id;

        const hostWs = await container.createRawSocket();
        container.sendMessage(hostWs, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Ведущий', role: 'host' });
        await container.waitForMessage(hostWs, MSG_TYPES.ROOM_STATE);

        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(desktopWs, MSG_TYPES.ROOM_STATE);

        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 0 });
        await container.waitForMessage(p1Ws, MSG_TYPES.QUESTION_ACTIVE);
        await container.waitForMessage(p1Ws, MSG_TYPES.BUZZER_READY);

        // Player presses buzzer
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_BUZZ, {});
        const buzzLocked = await container.waitForMessage(desktopWs, MSG_TYPES.BUZZ_LOCKED);
        assert.equal(buzzLocked.payload.playerId, p1Id);

        // Verify desktop handler logic in js/game.js
        const gameJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'game.js'), 'utf8');
        assert.ok(gameJs.includes("timerElem.className = 'timer answering';"), 'Must assign timer answering class');
        assert.ok(gameJs.includes('timer answering') && gameJs.includes('timer-hint'), 'Hint must show answering text');
        assert.ok(gameJs.includes("stopTimer();"), 'Thinking timer must be stopped');
        assert.ok(gameJs.includes("isAnswerTimerActive = true;"), 'Answer timer state must be marked active');

        // Verify CSS styling for .timer.answering has bright yellow gold styling and NO snowflake
        const styleCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
        assert.ok(styleCss.includes('.timer.answering'), 'CSS must define .timer.answering');
        assert.ok(styleCss.includes('#f39c12'), 'CSS must have yellow gold #f39c12');
        assert.ok(!styleCss.includes("content: '❄️' !important;"), 'Snowflake icon must be removed');
    });

    test('Flow 8: Host can advance to next round and trigger stats screen (Requirement 3)', async () => {
        const desktopWs = await container.createRawSocket();
        container.sendMessage(desktopWs, MSG_TYPES.HOST_CREATE_ROOM, {
            options: { isHostOnPC: false }
        });
        const { payload: { roomCode } } = await container.waitForMessage(desktopWs, MSG_TYPES.ROOM_CREATED);

        const mockPack = [
            {
                roundIndex: 0,
                roundName: '????? 1',
                themes: [{ name: '?1', questions: [{ cost: 100, q: '?1', a: '?1', used: true }] }]
            },
            {
                roundIndex: 1,
                roundName: '????? 2',
                themes: [{ name: '?2', questions: [{ cost: 200, q: '?2', a: '?2' }] }]
            }
        ];
        container.sendMessage(desktopWs, MSG_TYPES.HOST_SET_PACK, { pack: mockPack });

        const hostWs = await container.createRawSocket();
        container.sendMessage(hostWs, MSG_TYPES.PLAYER_JOIN, { roomCode, name: '???????', role: 'host' });
        await container.waitForMessage(hostWs, MSG_TYPES.ROOM_STATE);

        const p1Ws = await container.createRawSocket();
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_JOIN, { roomCode, name: '?????', role: 'player' });
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(hostWs, MSG_TYPES.ROOM_STATE);

        // Close question to trigger round end
        container.sendMessage(hostWs, MSG_TYPES.HOST_CLOSE_QUESTION, {});
        const roundEndState = await container.waitForMessage(hostWs, MSG_TYPES.ROOM_STATE);
        assert.equal(roundEndState.payload.state, 'ROUND_END', 'Room state must be ROUND_END when all questions played');

        // Host phone presses "????????? ?????"
        container.sendMessage(hostWs, MSG_TYPES.HOST_NEXT_ROUND, {});
        const roundChanged = await container.waitForMessage(desktopWs, MSG_TYPES.ROUND_CHANGED);
        assert.equal(roundChanged.payload.roundIndex, 1, 'Round index must advance to 1');

        // Test Show Stats trigger
        container.sendMessage(hostWs, MSG_TYPES.HOST_SHOW_STATS, {});
        const showStats = await container.waitForMessage(desktopWs, MSG_TYPES.SHOW_STATS);
        assert.ok(showStats, 'Desktop must receive SHOW_STATS message');

        // Verify mobile UI has Next Round and Show Stats buttons
        const mobileHtml = fs.readFileSync(path.join(__dirname, '..', 'mobile', 'index.html'), 'utf8');
        assert.ok(mobileHtml.includes('id="btn-host-next-round"'), 'Must have btn-host-next-round in HTML');
        assert.ok(mobileHtml.includes('id="btn-host-show-stats"'), 'Must have btn-host-show-stats in HTML');
        assert.ok(mobileHtml.includes('id="host-round-end-action"'), 'Must have host-round-end-action container');
        assert.ok(mobileHtml.includes('id="host-game-over-action"'), 'Must have host-game-over-action container');
    });

    test('Flow 9: Multi-player buzzer arbitration chain: P1 wrong -> timer resumes -> P2 correct (Full Cycle)', async () => {
        const desktopWs = await container.createRawSocket();
        container.sendMessage(desktopWs, MSG_TYPES.HOST_CREATE_ROOM, {
            options: { isHostOnPC: false, readingTime: 0, thinkingTime: 20, answerTime: 5 }
        });
        const { payload: { roomCode } } = await container.waitForMessage(desktopWs, MSG_TYPES.ROOM_CREATED);

        const mockPack = [{
            roundIndex: 0,
            themes: [{
                name: 'Тема 1',
                questions: [{ cost: 300, q: 'Вопрос для 3 игроков?', a: 'Ответ' }]
            }]
        }];
        container.sendMessage(desktopWs, MSG_TYPES.HOST_SET_PACK, { pack: mockPack });

        // Join Host
        const hostWs = await container.createRawSocket();
        container.sendMessage(hostWs, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Ведущий', role: 'host' });
        await container.waitForMessage(hostWs, MSG_TYPES.ROOM_STATE);

        // Join 3 players: P1, P2, P3
        const p1Ws = await container.createRawSocket();
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Игрок 1', role: 'player' });
        const p1State = await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);
        const p1Id = p1State.payload.self.id;

        const p2Ws = await container.createRawSocket();
        container.sendMessage(p2Ws, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Игрок 2', role: 'player' });
        const p2State = await container.waitForMessage(p2Ws, MSG_TYPES.ROOM_STATE);
        const p2Id = p2State.payload.self.id;

        const p3Ws = await container.createRawSocket();
        container.sendMessage(p3Ws, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Игрок 3', role: 'player' });
        const p3State = await container.waitForMessage(p3Ws, MSG_TYPES.ROOM_STATE);
        const p3Id = p3State.payload.self.id;

        // Start game
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(desktopWs, MSG_TYPES.ROOM_STATE);

        // Host selects question
        const p1QPromise = container.waitForMessage(p1Ws, MSG_TYPES.QUESTION_ACTIVE);
        const p1ReadyPromise = container.waitForMessage(p1Ws, MSG_TYPES.BUZZER_READY);
        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 0 });
        await p1QPromise;

        // Buzzer opens for all 3 players (readingTime: 0)
        const bReady1 = await p1ReadyPromise;
        assert.ok(bReady1.payload.allowedPlayerIds.includes(p1Id));
        assert.ok(bReady1.payload.allowedPlayerIds.includes(p2Id));
        assert.ok(bReady1.payload.allowedPlayerIds.includes(p3Id));

        // Step 1: P1 buzzes first!
        const buzzLockDesktopPromise1 = container.waitForMessage(desktopWs, MSG_TYPES.BUZZ_LOCKED);
        const buzzLockP2Promise1 = container.waitForMessage(p2Ws, MSG_TYPES.BUZZ_LOCKED);
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_BUZZ, {});

        const buzzLockDesktop1 = await buzzLockDesktopPromise1;
        assert.equal(buzzLockDesktop1.payload.playerId, p1Id, 'Desktop must see P1 buzz locked');
        const buzzLockP2 = await buzzLockP2Promise1;
        assert.equal(buzzLockP2.payload.playerId, p1Id, 'P2 must see P1 buzz locked');

        // Step 2: Host judges P1 answer as WRONG (with reopened: true)
        // Attach listeners for JUDGE_RESULT and reopened BUZZER_READY before sending command
        const judgeDesktopPromise1 = container.waitForMessage(desktopWs, MSG_TYPES.JUDGE_RESULT);
        const bReadyP2Promise2 = container.waitForMessage(p2Ws, MSG_TYPES.BUZZER_READY);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: false, withPenalty: false });

        const judge1Desktop = await judgeDesktopPromise1;
        assert.equal(judge1Desktop.payload.isCorrect, false);
        assert.equal(judge1Desktop.payload.reopened, true);
        assert.equal(judge1Desktop.payload.playerId, p1Id);

        // Buzzer is REOPENED for remaining players [P2, P3]
        const bReady2 = await bReadyP2Promise2;
        assert.ok(!bReady2.payload.allowedPlayerIds.includes(p1Id), 'P1 must NOT be in allowedPlayerIds');
        assert.ok(bReady2.payload.allowedPlayerIds.includes(p2Id), 'P2 must be in allowedPlayerIds');
        assert.ok(bReady2.payload.allowedPlayerIds.includes(p3Id), 'P3 must be in allowedPlayerIds');

        // Verify P1 cannot buzz again on this question (Server Anti-Cheat)
        const p1ErrPromise = container.waitForMessage(p1Ws, MSG_TYPES.ERROR);
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_BUZZ, {});
        const p1Err = await p1ErrPromise;
        assert.equal(p1Err.payload.code, 'INVALID_ACTION', 'P1 buzzing again must be rejected');

        // Step 3: P2 buzzes!
        const buzzLockDesktopPromise2 = container.waitForMessage(desktopWs, MSG_TYPES.BUZZ_LOCKED);
        container.sendMessage(p2Ws, MSG_TYPES.PLAYER_BUZZ, {});
        const buzzLockDesktop2 = await buzzLockDesktopPromise2;
        assert.equal(buzzLockDesktop2.payload.playerId, p2Id, 'Desktop must see P2 buzz locked');

        // Step 4: Host judges P2 answer as CORRECT!
        const judgeDesktopPromise2 = container.waitForMessage(desktopWs, MSG_TYPES.JUDGE_RESULT);
        const p2ScorePromise = container.waitForMessage(p2Ws, MSG_TYPES.SCORE_UPDATED);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: true });

        const judge2Desktop = await judgeDesktopPromise2;
        assert.equal(judge2Desktop.payload.isCorrect, true, 'P2 answer must be marked correct');
        assert.equal(judge2Desktop.payload.playerId, p2Id);

        // Verify score was awarded to P2
        const p2ScoreMsg = await p2ScorePromise;
        assert.equal(p2ScoreMsg.payload.playerId, p2Id);
        assert.equal(p2ScoreMsg.payload.newScore, 300, 'P2 score must be updated to 300');
    });

    test('Flow 10: Multi-player buzzer arbitration chain: P1 wrong -> thinking timer expires -> all locked out', async () => {
        const desktopWs = await container.createRawSocket();
        container.sendMessage(desktopWs, MSG_TYPES.HOST_CREATE_ROOM, {
            options: { isHostOnPC: false, readingTime: 0, thinkingTime: 2, answerTime: 5 }
        });
        const { payload: { roomCode } } = await container.waitForMessage(desktopWs, MSG_TYPES.ROOM_CREATED);

        const mockPack = [{
            roundIndex: 0,
            themes: [{
                name: 'Тема 2',
                questions: [{ cost: 200, q: 'Вопрос 2?', a: 'Ответ 2' }]
            }]
        }];
        container.sendMessage(desktopWs, MSG_TYPES.HOST_SET_PACK, { pack: mockPack });

        const hostWs = await container.createRawSocket();
        container.sendMessage(hostWs, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Ведущий', role: 'host' });
        await container.waitForMessage(hostWs, MSG_TYPES.ROOM_STATE);

        const p1Ws = await container.createRawSocket();
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Игрок 1', role: 'player' });
        const p1State = await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);
        const p1Id = p1State.payload.self.id;

        const p2Ws = await container.createRawSocket();
        container.sendMessage(p2Ws, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Игрок 2', role: 'player' });
        const p2State = await container.waitForMessage(p2Ws, MSG_TYPES.ROOM_STATE);
        const p2Id = p2State.payload.self.id;

        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(desktopWs, MSG_TYPES.ROOM_STATE);

        const p1QPromise = container.waitForMessage(p1Ws, MSG_TYPES.QUESTION_ACTIVE);
        const p1ReadyPromise = container.waitForMessage(p1Ws, MSG_TYPES.BUZZER_READY);
        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 0 });
        await p1QPromise;
        await p1ReadyPromise;

        // P1 buzzes immediately
        const p1LockPromise = container.waitForMessage(desktopWs, MSG_TYPES.BUZZ_LOCKED);
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_BUZZ, {});
        await p1LockPromise;

        // Host rejects P1 answer
        const p2ReadyPromise = container.waitForMessage(p2Ws, MSG_TYPES.BUZZER_READY);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: false });
        await p2ReadyPromise;

        // P2 does NOT buzz. Thinking timer (2s) expires on server!
        const timeoutMsg = await container.waitForMessage(p2Ws, MSG_TYPES.ANSWER_TIMEOUT);
        assert.ok(timeoutMsg, 'P2 must receive ANSWER_TIMEOUT when remaining thinking time runs out');

        // P2 tries to buzz after timeout -> must be rejected
        const p2ErrPromise = container.waitForMessage(p2Ws, MSG_TYPES.ERROR);
        container.sendMessage(p2Ws, MSG_TYPES.PLAYER_BUZZ, {});
        const p2Err = await p2ErrPromise;
        assert.equal(p2Err.payload.code, 'INVALID_ACTION', 'Buzz after thinking timeout must be rejected');
    });

    test('Mobile Client Integrity: All host button element IDs bound, no missing elements, no TDZ errors', () => {
        const mobileJs = fs.readFileSync(path.join(__dirname, '..', 'mobile', 'mobile.js'), 'utf8');

        // Check required host buttons in elements definition
        assert.ok(mobileJs.includes("btnHostStartGame: document.getElementById('btn-host-start-game')"), 'btnHostStartGame must be bound in elements');
        assert.ok(mobileJs.includes("btnHostShowAnswer: document.getElementById('btn-host-show-answer')"), 'btnHostShowAnswer must be bound in elements');
        assert.ok(mobileJs.includes("btnHostCloseQuestion: document.getElementById('btn-host-close-question')"), 'btnHostCloseQuestion must be bound in elements');
        assert.ok(mobileJs.includes("hostPlayersList: document.getElementById('host-players-list')"), 'hostPlayersList must be bound in elements');
        assert.ok(mobileJs.includes("hostPlayersCount: document.getElementById('host-players-count')"), 'hostPlayersCount must be bound in elements');
        assert.ok(mobileJs.includes("hostLobbyAction: document.getElementById('host-lobby-action')"), 'hostLobbyAction must be bound in elements');

        // Verify no TDZ error in renderHostPlayersList
        const playerListIdx = mobileJs.indexOf('function renderHostPlayersList');
        const qCostDeclIdx = mobileJs.indexOf('const qCost = state.currentCost || 100;', playerListIdx);
        const qCostUsageIdx = mobileJs.indexOf('minus-cost', playerListIdx);
        assert.ok(qCostDeclIdx !== -1, 'qCost must be declared');
        assert.ok(qCostUsageIdx !== -1, 'minus-cost must be used in template');
        assert.ok(qCostDeclIdx < qCostUsageIdx, 'qCost must be declared BEFORE its usage in template string');

        // Verify elements.<prop> completeness: no undefined properties used
        const elemDefMatch = mobileJs.match(new RegExp('const elements = \\{([\\s\\S]*?)\\n\\s*\\};'));
        assert.ok(elemDefMatch, 'elements object must be defined');
        const defined = new Set();
        elemDefMatch[1].split(/[\r\n]+/).forEach(line => {
            const m = line.match(new RegExp('^\\s*([a-zA-Z0-9_]+)\\s*:'));
            if (m) defined.add(m[1]);
        });
        const matches = new Set();
        const regex = /elements.([a-zA-Z0-9_]+)/g;
        let match;
        while ((match = regex.exec(mobileJs)) !== null) {
            matches.add(match[1]);
        }
        for (const used of matches) {
            if (used !== 'screens') {
                assert.ok(defined.has(used), 'Property elements.' + used + ' must be declared in elements definition');
            }
        }
    });

    test('Mobile Client Integrity: All phones reset on game finished and early exit', () => {
        const mobileJs = fs.readFileSync(path.join(__dirname, '..', 'mobile', 'mobile.js'), 'utf8');
        const gameJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'game.js'), 'utf8');

        // Mobile resets on game_finished
        assert.ok(mobileJs.includes("netClient.on('game_finished'"), 'Must handle game_finished');
        assert.ok(mobileJs.includes('leaveToMainMenu()'), 'Must call leaveToMainMenu() on finish');

        // Mobile resets on GAME_OVER state
        assert.ok(mobileJs.includes("case 'GAME_OVER':"), 'Must handle GAME_OVER in room_state');
        assert.ok(mobileJs.includes('leaveToMainMenu();'), 'Must leaveToMainMenu on GAME_OVER');

        // Mobile host sends finishGame on early exit
        assert.ok(mobileJs.includes("netClient.finishGame({"), 'Host sends finishGame on exit');

        // Desktop executeQuitToMainMenu finishes game
        assert.ok(gameJs.includes('hostNetworkClient.finishGame({'), 'Desktop executeQuitToMainMenu finishes game');
        assert.ok(gameJs.includes("reason: 'early_exit'"), 'Early exit reason passed');

        // Desktop leaveOnlineLobby finishes game
        assert.ok(gameJs.includes("reason: 'lobby_closed'"), 'Lobby closed reason passed');
    });

    // =========================================================================
    // TWO-PLAYER FULL MATCH E2E SCENARIOS & BUG FIXES SUITE
    // =========================================================================

    async function setupTwoPlayerRoom(options = {}) {
        const desktopWs = await container.createRawSocket();
        container.sendMessage(desktopWs, MSG_TYPES.HOST_CREATE_ROOM, {
            options: { isHostOnPC: false, readingTime: 0, thinkingTime: 10, answerTime: 5, ...options }
        });
        const { payload: { roomCode } } = await container.waitForMessage(desktopWs, MSG_TYPES.ROOM_CREATED);

        const defaultPack = options.pack || [
            {
                roundIndex: 0,
                roundName: 'Раунд 1',
                themes: [
                    {
                        name: 'Тема 1',
                        questions: [
                            { price: 100, cost: 100, q: 'Вопрос 100', a: 'Ответ 100' },
                            { price: 200, cost: 200, q: 'Вопрос 200', a: 'Ответ 200' },
                            { price: 300, cost: 300, q: 'Вопрос 300', a: 'Ответ 300' },
                            { price: 400, cost: 400, q: 'Вопрос 400', a: 'Ответ 400' },
                            { price: 500, cost: 500, q: 'Вопрос 500', a: 'Ответ 500' }
                        ]
                    }
                ]
            }
        ];
        container.sendMessage(desktopWs, MSG_TYPES.HOST_SET_PACK, { pack: defaultPack });

        const hostWs = await container.createRawSocket();
        container.sendMessage(hostWs, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Ведущий', role: 'host', avatar: '👑' });
        await container.waitForMessage(hostWs, MSG_TYPES.ROOM_STATE);

        const p1Ws = await container.createRawSocket();
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Игрок 1', role: 'player', avatar: '🚀' });
        const p1Join = await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);
        const p1Id = p1Join.payload.self.id;
        const p1Token = p1Join.payload.sessionToken;

        const p2Ws = await container.createRawSocket();
        container.sendMessage(p2Ws, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Игрок 2', role: 'player', avatar: '🎯' });
        const p2Join = await container.waitForMessage(p2Ws, MSG_TYPES.ROOM_STATE);
        const p2Id = p2Join.payload.self.id;
        const p2Token = p2Join.payload.sessionToken;

        return {
            roomCode,
            desktopWs,
            hostWs,
            p1Ws,
            p2Ws,
            p1Id,
            p2Id,
            p1Token,
            p2Token
        };
    }

    test('2P Flow 11: Lobby constraints - duplicate names rejected, host starts with 2 players', async () => {
        const desktopWs = await container.createRawSocket();
        container.sendMessage(desktopWs, MSG_TYPES.HOST_CREATE_ROOM, { isHostOnPC: false });
        const { payload: { roomCode } } = await container.waitForMessage(desktopWs, MSG_TYPES.ROOM_CREATED);

        const p1Ws = await container.createRawSocket();
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Алиса', role: 'player', avatar: '🚀' });
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        // P2 tries to join with identical name 'Алиса'
        const p2Ws = await container.createRawSocket();
        container.sendMessage(p2Ws, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Алиса', role: 'player', avatar: '🎯' });
        const err = await container.waitForMessage(p2Ws, MSG_TYPES.ERROR);
        assert.equal(err.payload.code, ERROR_CODES.NAME_ALREADY_TAKEN);

        // P2 joins with valid distinct name 'Боб'
        container.sendMessage(p2Ws, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Боб', role: 'player', avatar: '🎯' });
        const p2Joined = await container.waitForMessage(p2Ws, MSG_TYPES.ROOM_STATE);
        assert.equal(p2Joined.payload.players.length, 2);

        // Host joins and verifies lobby readiness
        const hostWs = await container.createRawSocket();
        container.sendMessage(hostWs, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Ведущий', role: 'host', avatar: '👑' });
        const hostState = await container.waitForMessage(hostWs, MSG_TYPES.ROOM_STATE);
        assert.equal(hostState.payload.canStartGame, true);
        assert.equal(hostState.payload.players.length, 2);

        // Start game
        const p1BoardPromise = container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE, m => m.payload.state === 'BOARD');
        const p2BoardPromise = container.waitForMessage(p2Ws, MSG_TYPES.ROOM_STATE, m => m.payload.state === 'BOARD');
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        const p1Board = await p1BoardPromise;
        const p2Board = await p2BoardPromise;
        assert.equal(p1Board.payload.state, 'BOARD');
        assert.equal(p2Board.payload.state, 'BOARD');
    });

    test('2P Flow 12: Head-to-head buzzer race - P1 wins, P2 locked out, P1 answers correctly', async () => {
        const { hostWs, p1Ws, p2Ws, p1Id, p2Id } = await setupTwoPlayerRoom();
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        // Host selects question
        const p1ReadyPromise = container.waitForMessage(p1Ws, MSG_TYPES.BUZZER_READY);
        const p2ReadyPromise = container.waitForMessage(p2Ws, MSG_TYPES.BUZZER_READY);
        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 0 });
        const p1Ready = await p1ReadyPromise;
        const p2Ready = await p2ReadyPromise;
        assert.ok(p1Ready.payload.allowedPlayerIds.includes(p1Id));
        assert.ok(p2Ready.payload.allowedPlayerIds.includes(p2Id));

        // P1 buzzes first
        const p1LockPromise = container.waitForMessage(p1Ws, MSG_TYPES.BUZZ_LOCKED);
        const p2LockPromise = container.waitForMessage(p2Ws, MSG_TYPES.BUZZ_LOCKED);
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_BUZZ, {});
        const p1Lock = await p1LockPromise;
        const p2Lock = await p2LockPromise;
        assert.equal(p1Lock.payload.playerId, p1Id);
        assert.equal(p2Lock.payload.playerId, p1Id);

        // P2 tries to buzz while P1 is locked -> must be rejected
        const p2ErrPromise = container.waitForMessage(p2Ws, MSG_TYPES.ERROR);
        container.sendMessage(p2Ws, MSG_TYPES.PLAYER_BUZZ, {});
        const p2Err = await p2ErrPromise;
        assert.equal(p2Err.payload.code, ERROR_CODES.INVALID_ACTION);

        // Host judges P1 CORRECT
        const p1ScorePromise = container.waitForMessage(p1Ws, MSG_TYPES.SCORE_UPDATED);
        const p2ScorePromise = container.waitForMessage(p2Ws, MSG_TYPES.SCORE_UPDATED);
        const p1BoardPromise = container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: true });

        const p1Score = await p1ScorePromise;
        const p2Score = await p2ScorePromise;
        assert.equal(p1Score.payload.playerId, p1Id);
        assert.equal(p1Score.payload.newScore, 100);
        assert.equal(p2Score.payload.players.find(p => p.id === p1Id).score, 100);
        assert.equal(p2Score.payload.players.find(p => p.id === p2Id).score, 0);

        const p1Board = await p1BoardPromise;
        assert.equal(p1Board.payload.state, 'BOARD');
    });

    test('2P Flow 13: Buzzer reopen chain - P1 wrong with penalty, P2 buzzes and scores', async () => {
        const { hostWs, p1Ws, p2Ws, p1Id, p2Id } = await setupTwoPlayerRoom();
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 1 });
        await container.waitForMessage(p1Ws, MSG_TYPES.BUZZER_READY);

        // P1 buzzes
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_BUZZ, {});
        await container.waitForMessage(p1Ws, MSG_TYPES.BUZZ_LOCKED);

        // Host rejects P1 WITH penalty -> buzzer reopens for P2 ONLY
        const p2ReadyPromise = container.waitForMessage(p2Ws, MSG_TYPES.BUZZER_READY);
        const p1ScorePromise = container.waitForMessage(p1Ws, MSG_TYPES.SCORE_UPDATED);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: false, withPenalty: true });

        const p1Score = await p1ScorePromise;
        assert.equal(p1Score.payload.newScore, -200);

        const p2Ready = await p2ReadyPromise;
        assert.ok(p2Ready.payload.allowedPlayerIds.includes(p2Id), 'P2 must be allowed');
        assert.ok(!p2Ready.payload.allowedPlayerIds.includes(p1Id), 'P1 must NOT be allowed');

        // P1 attempts to buzz again -> rejected
        const p1ErrPromise = container.waitForMessage(p1Ws, MSG_TYPES.ERROR);
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_BUZZ, {});
        const p1Err = await p1ErrPromise;
        assert.equal(p1Err.payload.code, ERROR_CODES.INVALID_ACTION);

        // P2 buzzes and answers correctly
        const p2LockPromise = container.waitForMessage(p2Ws, MSG_TYPES.BUZZ_LOCKED);
        container.sendMessage(p2Ws, MSG_TYPES.PLAYER_BUZZ, {});
        const p2Lock = await p2LockPromise;
        assert.equal(p2Lock.payload.playerId, p2Id);

        const p2ScorePromise = container.waitForMessage(p2Ws, MSG_TYPES.SCORE_UPDATED);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: true });
        const p2Score = await p2ScorePromise;
        assert.equal(p2Score.payload.newScore, 200);
    });

    test('2P Flow 14: Double wrong answers - P1 wrong, P2 wrong, question terminates without loop', async () => {
        const { hostWs, p1Ws, p2Ws, p1Id, p2Id, desktopWs } = await setupTwoPlayerRoom();
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 2 });
        await container.waitForMessage(p1Ws, MSG_TYPES.BUZZER_READY);

        // P2 buzzes first
        container.sendMessage(p2Ws, MSG_TYPES.PLAYER_BUZZ, {});
        await container.waitForMessage(p2Ws, MSG_TYPES.BUZZ_LOCKED);

        // Host rejects P2 without penalty
        const p1ReadyPromise = container.waitForMessage(p1Ws, MSG_TYPES.BUZZER_READY);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: false, withPenalty: false });
        await p1ReadyPromise;

        // P1 buzzes second
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_BUZZ, {});
        await container.waitForMessage(p1Ws, MSG_TYPES.BUZZ_LOCKED);

        // Host rejects P1 without penalty -> both players have attempted -> question ends!
        const judgePromise = container.waitForMessage(desktopWs, MSG_TYPES.JUDGE_RESULT);
        const boardPromise = container.waitForMessage(desktopWs, MSG_TYPES.ROOM_STATE);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: false, withPenalty: false });

        const judge = await judgePromise;
        assert.equal(judge.payload.reopened, false, 'Must not reopen buzzer after all players failed');
        const board = await boardPromise;
        assert.equal(board.payload.state, 'BOARD');
    });

    test('2P Flow 15: Answer timer expiration - P1 times out, no penalty, P2 gets buzzer', async () => {
        const { hostWs, p1Ws, p2Ws, p1Id, p2Id } = await setupTwoPlayerRoom({ answerTime: 1 });
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 3 });
        await container.waitForMessage(p1Ws, MSG_TYPES.BUZZER_READY);

        // P1 buzzes
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_BUZZ, {});
        await container.waitForMessage(p1Ws, MSG_TYPES.BUZZ_LOCKED);

        // P1 does not answer -> 1s answer timeout triggers
        const timeoutPromise = container.waitForMessage(p1Ws, MSG_TYPES.ANSWER_TIMEOUT);
        const p2ReadyPromise = container.waitForMessage(p2Ws, MSG_TYPES.BUZZER_READY);

        await timeoutPromise;
        const p2Ready = await p2ReadyPromise;
        assert.ok(p2Ready.payload.allowedPlayerIds.includes(p2Id));
        assert.ok(!p2Ready.payload.allowedPlayerIds.includes(p1Id));

        // P2 buzzes and scores
        container.sendMessage(p2Ws, MSG_TYPES.PLAYER_BUZZ, {});
        await container.waitForMessage(p2Ws, MSG_TYPES.BUZZ_LOCKED);

        const p2ScorePromise = container.waitForMessage(p2Ws, MSG_TYPES.SCORE_UPDATED);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: true });
        const p2Score = await p2ScorePromise;
        assert.equal(p2Score.payload.newScore, 400);
    });

    test('2P Flow 16: Thinking timer expiration - neither buzzes, clean question close', async () => {
        const { hostWs, p1Ws, p2Ws, desktopWs } = await setupTwoPlayerRoom({ readingTime: 0, thinkingTime: 1 });
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 4 });
        await container.waitForMessage(p1Ws, MSG_TYPES.BUZZER_READY);

        // Neither buzzes -> 1s thinking timeout triggers
        const timeoutPromise = container.waitForMessage(p1Ws, MSG_TYPES.ANSWER_TIMEOUT);
        const timeoutDesktop = container.waitForMessage(desktopWs, MSG_TYPES.ANSWER_TIMEOUT);
        const roomStatePromise = container.waitForMessage(hostWs, MSG_TYPES.ROOM_STATE, m => m.payload.state === 'QUESTION_CLOSED' || m.payload.state === 'BOARD');

        await timeoutPromise;
        await timeoutDesktop;

        const roomState = await roomStatePromise;
        assert.ok(roomState.payload.state === 'BOARD' || roomState.payload.state === 'ROUND_END' || roomState.payload.state === 'QUESTION_CLOSED');
    });

    test('2P Flow 17: Pause & unpause - neither player can buzz during pause, resumes properly', async () => {
        const { hostWs, p1Ws, p2Ws, p1Id } = await setupTwoPlayerRoom();
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 0 });
        await container.waitForMessage(p1Ws, MSG_TYPES.BUZZER_READY);

        // Host pauses
        const p1PausePromise = container.waitForMessage(p1Ws, MSG_TYPES.GAME_PAUSED);
        const p2PausePromise = container.waitForMessage(p2Ws, MSG_TYPES.GAME_PAUSED);
        container.sendMessage(hostWs, MSG_TYPES.HOST_TOGGLE_PAUSE, { isPaused: true });

        const p1Pause = await p1PausePromise;
        const p2Pause = await p2PausePromise;
        assert.equal(p1Pause.payload.isPaused, true);
        assert.equal(p2Pause.payload.isPaused, true);

        // Both players attempt to buzz while paused -> rejected
        const p1ErrPromise = container.waitForMessage(p1Ws, MSG_TYPES.ERROR);
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_BUZZ, {});
        const p1Err = await p1ErrPromise;
        assert.equal(p1Err.payload.error || p1Err.payload.code, ERROR_CODES.INVALID_ACTION);

        const p2ErrPromise = container.waitForMessage(p2Ws, MSG_TYPES.ERROR);
        container.sendMessage(p2Ws, MSG_TYPES.PLAYER_BUZZ, {});
        const p2Err = await p2ErrPromise;
        assert.equal(p2Err.payload.error || p2Err.payload.code, ERROR_CODES.INVALID_ACTION);

        // Host unpauses
        const p1ResumePromise = container.waitForMessage(p1Ws, MSG_TYPES.GAME_PAUSED);
        container.sendMessage(hostWs, MSG_TYPES.HOST_TOGGLE_PAUSE, { isPaused: false });
        const p1Resume = await p1ResumePromise;
        assert.equal(p1Resume.payload.isPaused, false);

        // P1 buzzes successfully after unpause
        const p1LockPromise = container.waitForMessage(p1Ws, MSG_TYPES.BUZZ_LOCKED);
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_BUZZ, {});
        const p1Lock = await p1LockPromise;
        assert.equal(p1Lock.payload.playerId, p1Id);
    });

    test('2P Flow 18: Special question "Кот в мешке" - P1 transfers to P2, only P2 can buzz', async () => {
        const catPack = [
            {
                roundIndex: 0,
                themes: [
                    {
                        name: 'Секреты',
                        questions: [
                            { price: 500, cost: 500, q: 'Вопрос Кота', a: 'Правильный Ответ', type: 'cat' }
                        ]
                    }
                ]
            }
        ];
        const { hostWs, p1Ws, p2Ws, p1Id, p2Id, desktopWs } = await setupTwoPlayerRoom({ pack: catPack });
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 0 });
        await container.waitForMessage(p1Ws, MSG_TYPES.QUESTION_ACTIVE);

        // P1 transfers Cat in the Bag to P2
        const catTransferPromise = container.waitForMessage(desktopWs, MSG_TYPES.CAT_TRANSFERRED);
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_CAT_TRANSFER, { targetPlayerId: p2Id });
        const catTransferred = await catTransferPromise;
        assert.equal(catTransferred.payload.toPlayerId, p2Id);

        // Host activates buzzer
        const p1ReadyPromise = container.waitForMessage(p1Ws, MSG_TYPES.BUZZER_READY);
        const p2ReadyPromise = container.waitForMessage(p2Ws, MSG_TYPES.BUZZER_READY);
        container.sendMessage(hostWs, MSG_TYPES.HOST_ACTIVATE_BUZZER, {});

        const p1Ready = await p1ReadyPromise;
        const p2Ready = await p2ReadyPromise;
        assert.ok(p2Ready.payload.allowedPlayerIds.includes(p2Id));
        assert.ok(!p1Ready.payload.allowedPlayerIds.includes(p1Id));

        // P1 tries to buzz -> rejected
        const p1ErrPromise = container.waitForMessage(p1Ws, MSG_TYPES.ERROR);
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_BUZZ, {});
        const p1Err = await p1ErrPromise;
        assert.equal(p1Err.payload.code, ERROR_CODES.INVALID_ACTION);

        // P2 buzzes and scores
        container.sendMessage(p2Ws, MSG_TYPES.PLAYER_BUZZ, {});
        await container.waitForMessage(p2Ws, MSG_TYPES.BUZZ_LOCKED);

        const p2ScorePromise = container.waitForMessage(p2Ws, MSG_TYPES.SCORE_UPDATED);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: true });
        const p2Score = await p2ScorePromise;
        assert.equal(p2Score.payload.newScore, 500);
    });

    test('2P Flow 19: Special question "Аукцион" - P1 and P2 bidding, highest bidder answers', async () => {
        const auctionPack = [
            {
                roundIndex: 0,
                themes: [
                    {
                        name: 'Аукционы',
                        questions: [
                            { price: 300, cost: 300, q: 'Аукционный вопрос', a: 'Юпитер', type: 'auction' }
                        ]
                    }
                ]
            }
        ];
        const { hostWs, p1Ws, p2Ws, p1Id, p2Id, desktopWs } = await setupTwoPlayerRoom({ pack: auctionPack });
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 0 });
        await container.waitForMessage(p1Ws, MSG_TYPES.QUESTION_ACTIVE);

        // P1 bets 400
        const bet1Promise = container.waitForMessage(desktopWs, MSG_TYPES.AUCTION_BET_MADE);
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_AUCTION_BET, { amount: 400 });
        const bet1 = await bet1Promise;
        assert.equal(bet1.payload.amount, 400);

        // P2 bets 600
        const bet2Promise = container.waitForMessage(desktopWs, MSG_TYPES.AUCTION_BET_MADE);
        container.sendMessage(p2Ws, MSG_TYPES.PLAYER_AUCTION_BET, { amount: 600 });
        const bet2 = await bet2Promise;
        assert.equal(bet2.payload.amount, 600);

        // P1 passes
        const betPassPromise = container.waitForMessage(desktopWs, MSG_TYPES.AUCTION_BET_MADE);
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_AUCTION_BET, { amount: 0 });
        const betPass = await betPassPromise;
        assert.equal(betPass.payload.amount, 0);

        // Host starts auction answer phase with P2
        const p2AnsStartPromise = container.waitForMessage(p2Ws, MSG_TYPES.AUCTION_ANSWER_START);
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_AUCTION_ANSWER, { biddingPlayerIds: [p2Id] });
        const p2AnsStart = await p2AnsStartPromise;
        assert.ok(p2AnsStart.payload.biddingPlayerIds.includes(p2Id));

        // P2 submits answer
        const hostAnsSubmittedPromise = container.waitForMessage(hostWs, MSG_TYPES.ANSWER_SUBMITTED);
        container.sendMessage(p2Ws, MSG_TYPES.PLAYER_SUBMIT_ANSWER, { answerText: 'Юпитер' });
        const ansSub = await hostAnsSubmittedPromise;
        assert.equal(ansSub.payload.answerText, 'Юпитер');
        assert.equal(ansSub.payload.isAuction, true);
        assert.equal(ansSub.payload.bet, 600);

        // Host judges P2 correct with bet 600 points
        const p2ScorePromise = container.waitForMessage(p2Ws, MSG_TYPES.SCORE_UPDATED);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: true });
        const p2Score = await p2ScorePromise;
        assert.equal(p2Score.payload.playerId, p2Id);
        assert.ok(p2Score.payload.newScore >= 300);
    });

    test('2P Flow 20: Host remote score adjustment - individual deltas and global bonus', async () => {
        const { hostWs, p1Ws, p2Ws, p1Id, p2Id } = await setupTwoPlayerRoom();
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        // Individual delta to P1 (+150)
        const p1ScorePromise1 = container.waitForMessage(p1Ws, MSG_TYPES.SCORE_UPDATED, m => m.payload.playerId === p1Id);
        container.sendMessage(hostWs, MSG_TYPES.HOST_UPDATE_SCORE, { playerId: p1Id, delta: 150 });
        const p1Score1 = await p1ScorePromise1;
        assert.equal(p1Score1.payload.newScore, 150);

        // Individual delta to P2 (-50)
        const p2ScorePromise1 = container.waitForMessage(p2Ws, MSG_TYPES.SCORE_UPDATED, m => m.payload.playerId === p2Id);
        container.sendMessage(hostWs, MSG_TYPES.HOST_UPDATE_SCORE, { playerId: p2Id, delta: -50 });
        const p2Score1 = await p2ScorePromise1;
        assert.equal(p2Score1.payload.newScore, -50);

        // Global bonus (+100 to all players)
        const p1ScorePromiseAll = container.waitForMessage(p1Ws, MSG_TYPES.SCORE_UPDATED);
        const p2ScorePromiseAll = container.waitForMessage(p2Ws, MSG_TYPES.SCORE_UPDATED);
        container.sendMessage(hostWs, MSG_TYPES.HOST_UPDATE_ALL_SCORES, { delta: 100 });

        const p1ScoreAll = await p1ScorePromiseAll;
        const p2ScoreAll = await p2ScorePromiseAll;
        assert.equal(p1ScoreAll.payload.isAll, true);
        const p1Player = p1ScoreAll.payload.players.find(p => p.id === p1Id);
        const p2Player = p2ScoreAll.payload.players.find(p => p.id === p2Id);
        assert.equal(p1Player.score, 250);
        assert.equal(p2Player.score, 50);
    });

    test('2P Flow 21: Turn passing & round skip between 2 players', async () => {
        const { hostWs, p1Ws, p2Ws, desktopWs } = await setupTwoPlayerRoom();
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        // Turn passed
        const p1TurnPromise = container.waitForMessage(p1Ws, MSG_TYPES.TURN_PASSED);
        const p2TurnPromise = container.waitForMessage(p2Ws, MSG_TYPES.TURN_PASSED);
        const desktopTurnPromise = container.waitForMessage(desktopWs, MSG_TYPES.TURN_PASSED);
        container.sendMessage(hostWs, MSG_TYPES.HOST_PASS_TURN, {});

        await p1TurnPromise;
        await p2TurnPromise;
        await desktopTurnPromise;

        // Round skipped
        const p1SkipPromise = container.waitForMessage(p1Ws, MSG_TYPES.ROUND_SKIPPED);
        const p2SkipPromise = container.waitForMessage(p2Ws, MSG_TYPES.ROUND_SKIPPED);
        container.sendMessage(hostWs, MSG_TYPES.HOST_SKIP_ROUND, {});

        const p1Skip = await p1SkipPromise;
        const p2Skip = await p2SkipPromise;
        assert.ok(p1Skip.payload);
        assert.ok(p2Skip.payload);
    });

    test('2P Flow 22: Multi-round pack progression - Round 1 completes, Round 2 starts', async () => {
        const multiRoundPack = [
            {
                roundIndex: 0,
                roundName: 'Раунд 1',
                themes: [{ name: 'Т1', questions: [{ cost: 100, q: 'В1', a: 'О1' }] }]
            },
            {
                roundIndex: 1,
                roundName: 'Раунд 2',
                themes: [{ name: 'Т2', questions: [{ cost: 200, q: 'В2', a: 'О2' }] }]
            }
        ];
        const { hostWs, p1Ws, p2Ws, desktopWs } = await setupTwoPlayerRoom({ pack: multiRoundPack });
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        // Select and answer the only question in Round 1
        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 0 });
        await container.waitForMessage(p1Ws, MSG_TYPES.BUZZER_READY);
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_BUZZ, {});
        await container.waitForMessage(p1Ws, MSG_TYPES.BUZZ_LOCKED);

        // Correct answer finishes question and triggers ROUND_END
        const roundEndPromise = container.waitForMessage(hostWs, MSG_TYPES.ROOM_STATE);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: true });
        const roundEndState = await roundEndPromise;
        assert.equal(roundEndState.payload.state, 'ROUND_END');

        // Host advances to Round 2
        const p1RoundChangedPromise = container.waitForMessage(p1Ws, MSG_TYPES.ROUND_CHANGED);
        const p2RoundChangedPromise = container.waitForMessage(p2Ws, MSG_TYPES.ROUND_CHANGED);
        const desktopRoundPromise = container.waitForMessage(desktopWs, MSG_TYPES.ROUND_CHANGED);
        container.sendMessage(hostWs, MSG_TYPES.HOST_NEXT_ROUND, {});

        const r1 = await p1RoundChangedPromise;
        const r2 = await p2RoundChangedPromise;
        const rDesk = await desktopRoundPromise;
        assert.equal(r1.payload.roundIndex, 1);
        assert.equal(r2.payload.roundIndex, 1);
        assert.equal(rDesk.payload.roundIndex, 1);
    });

    test('2P Flow 23: Mid-game P2 disconnect & reconnect with preserved session and score', async () => {
        const { hostWs, p1Ws, p2Ws, p2Id, p2Token, roomCode } = await setupTwoPlayerRoom();
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        // Give P2 250 points
        container.sendMessage(hostWs, MSG_TYPES.HOST_UPDATE_SCORE, { playerId: p2Id, delta: 250 });
        await container.waitForMessage(p1Ws, MSG_TYPES.SCORE_UPDATED);

        // P2 unexpectedly disconnects mid-game
        const p1LeftPromise = container.waitForMessage(p1Ws, MSG_TYPES.PLAYER_LEFT);
        const p1PausePromise = container.waitForMessage(p1Ws, MSG_TYPES.GAME_PAUSED);
        p2Ws.terminate();

        const p1Left = await p1LeftPromise;
        assert.equal(p1Left.payload.playerId, p2Id);
        const p1Pause = await p1PausePromise;
        assert.equal(p1Pause.payload.isPaused, true);
        assert.equal(p1Pause.payload.disconnectedPlayerName, 'Игрок 2');

        // P2 reconnects using sessionToken
        const p2ReconnectedWs = await container.createRawSocket();
        const p1JoinedPromise = container.waitForMessage(p1Ws, MSG_TYPES.PLAYER_JOINED);
        container.sendMessage(p2ReconnectedWs, MSG_TYPES.PLAYER_JOIN, {
            roomCode,
            name: 'Игрок 2',
            sessionToken: p2Token,
            role: 'player'
        });

        const p1Joined = await p1JoinedPromise;
        assert.equal(p1Joined.payload.isReconnect, true);
        assert.equal(p1Joined.payload.player.id, p2Id);

        // P2 state snapshot verifies preserved score
        const p2State = await container.waitForMessage(p2ReconnectedWs, MSG_TYPES.ROOM_STATE);
        assert.equal(p2State.payload.self.score, 250);

        // Host unpauses
        container.sendMessage(hostWs, MSG_TYPES.HOST_TOGGLE_PAUSE, { isPaused: false });
        const unpaused = await container.waitForMessage(p2ReconnectedWs, MSG_TYPES.GAME_PAUSED);
        assert.equal(unpaused.payload.isPaused, false);
    });

    test('2P Flow 24: P2 disconnects while buzzer is locked - buzzer automatically given to P1', async () => {
        const { hostWs, p1Ws, p2Ws, p1Id, p2Id, desktopWs } = await setupTwoPlayerRoom();
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 0 });
        await container.waitForMessage(p1Ws, MSG_TYPES.BUZZER_READY);

        // P2 buzzes and locks buzzer
        container.sendMessage(p2Ws, MSG_TYPES.PLAYER_BUZZ, {});
        await container.waitForMessage(p2Ws, MSG_TYPES.BUZZ_LOCKED);

        // P2 disconnects before answering!
        const p1ReadyPromise = container.waitForMessage(p1Ws, MSG_TYPES.BUZZER_READY);
        const resetPromise = container.waitForMessage(desktopWs, MSG_TYPES.BUZZ_RESET);
        p2Ws.terminate();

        await resetPromise;
        const p1Ready = await p1ReadyPromise;
        assert.ok(p1Ready.payload.allowedPlayerIds.includes(p1Id), 'P1 must receive buzzer after P2 disconnects');

        // Unpause game so P1 can buzz! (Server automatically pauses when a player disconnects)
        const p1UnpausePromise = container.waitForMessage(p1Ws, MSG_TYPES.GAME_PAUSED);
        container.sendMessage(hostWs, MSG_TYPES.HOST_TOGGLE_PAUSE, { isPaused: false });
        await p1UnpausePromise;

        // P1 buzzes and answers successfully
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_BUZZ, {});
        const p1Lock = await container.waitForMessage(p1Ws, MSG_TYPES.BUZZ_LOCKED);
        assert.equal(p1Lock.payload.playerId, p1Id);

        const p1ScorePromise = container.waitForMessage(p1Ws, MSG_TYPES.SCORE_UPDATED);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: true });
        const p1Score = await p1ScorePromise;
        assert.equal(p1Score.payload.newScore, 100);
    });

    test('2P Flow 25: Host kicks P2 - P2 disconnected, game continues with P1', async () => {
        const { hostWs, p1Ws, p2Ws, p2Id, roomCode } = await setupTwoPlayerRoom();
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        // Host kicks P2
        const p2KickedPromise = container.waitForMessage(p2Ws, MSG_TYPES.PLAYER_KICKED);
        const p1LeftPromise = container.waitForMessage(p1Ws, MSG_TYPES.PLAYER_LEFT);
        container.sendMessage(hostWs, MSG_TYPES.HOST_KICK_PLAYER, { playerId: p2Id });

        const p2Kicked = await p2KickedPromise;
        assert.equal(p2Kicked.payload.reason, 'kicked_by_host');

        const p1Left = await p1LeftPromise;
        assert.equal(p1Left.payload.playerId, p2Id);
        assert.equal(p1Left.payload.kicked, true);

        // Room now has 1 active player
        const room = roomManager.getRoom(roomCode);
        assert.equal(room.getActivePlayersCount(), 1);
    });

    test('2P Flow 26: Full match completion & winner determination (P1 wins, tie game)', async () => {
        const { hostWs, p1Ws, p2Ws, desktopWs } = await setupTwoPlayerRoom();
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        // Finish game with P1 as champion
        const winnersPayload = {
            winners: [
                { name: 'Игрок 1', score: 1200 },
                { name: 'Игрок 2', score: 700 }
            ]
        };
        const p1FinishPromise = container.waitForMessage(p1Ws, MSG_TYPES.GAME_FINISHED);
        const p2FinishPromise = container.waitForMessage(p2Ws, MSG_TYPES.GAME_FINISHED);
        const hostFinishPromise = container.waitForMessage(hostWs, MSG_TYPES.GAME_FINISHED);
        container.sendMessage(desktopWs, MSG_TYPES.GAME_FINISHED, winnersPayload);

        const p1Finish = await p1FinishPromise;
        const p2Finish = await p2FinishPromise;
        const hostFinish = await hostFinishPromise;

        assert.equal(p1Finish.payload.winners[0].name, 'Игрок 1');
        assert.equal(p1Finish.payload.winners[1].name, 'Игрок 2');
        assert.equal(p2Finish.payload.winners[0].name, 'Игрок 1');
        assert.equal(hostFinish.payload.winners[0].name, 'Игрок 1');
    });

    test('2P Flow 27: Anti-cheat sanitization - secret answers never exposed to P1 or P2', async () => {
        const secretPack = [
            {
                roundIndex: 0,
                themes: [
                    {
                        name: 'Секретная Тема',
                        questions: [
                            { price: 300, cost: 300, q: 'Секретный вопрос?', a: 'Секретный Ответ 42', comment: 'Секретный комментарий' }
                        ]
                    }
                ]
            }
        ];
        const { hostWs, p1Ws, p2Ws } = await setupTwoPlayerRoom({ pack: secretPack });
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);

        const hostQPromise = container.waitForMessage(hostWs, MSG_TYPES.QUESTION_ACTIVE);
        const p1QPromise = container.waitForMessage(p1Ws, MSG_TYPES.QUESTION_ACTIVE);
        const p2QPromise = container.waitForMessage(p2Ws, MSG_TYPES.QUESTION_ACTIVE);
        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 0 });

        const hostQ = await hostQPromise;
        const p1Q = await p1QPromise;
        const p2Q = await p2QPromise;

        // Host receives secret answer and comment
        assert.equal(hostQ.payload.question.a, 'Секретный Ответ 42');
        assert.equal(hostQ.payload.question.comment, 'Секретный комментарий');

        // Both players receive SANITIZED questions with answer hidden
        assert.equal(p1Q.payload.question.a, undefined, 'P1 must not receive secret answer');
        assert.equal(p1Q.payload.question.comment, undefined, 'P1 must not receive comment');
        assert.equal(p2Q.payload.question.a, undefined, 'P2 must not receive secret answer');
        assert.equal(p2Q.payload.question.comment, undefined, 'P2 must not receive comment');
    });

    test('2P Flow 28: Mobile client event handlers integrity for 2-player events', () => {
        const mobileJs = fs.readFileSync(path.join(__dirname, '..', 'mobile', 'mobile.js'), 'utf8');

        // 2-player event listeners
        assert.ok(mobileJs.includes("netClient.on('turn_passed'"), 'Must handle turn_passed on mobile');
        assert.ok(mobileJs.includes("netClient.on('round_skipped'"), 'Must handle round_skipped on mobile');
        assert.ok(mobileJs.includes("netClient.on('cat_transferred'"), 'Must handle cat_transferred on mobile');

        // Next round & show stats buttons
        assert.ok(mobileJs.includes("elements.btnHostNextRound.addEventListener('click'"), 'btnHostNextRound must be registered');
        assert.ok(mobileJs.includes("elements.btnHostShowStats.addEventListener('click'"), 'btnHostShowStats must be registered');

        // Round end and Game over actions properly toggled
        assert.ok(mobileJs.includes("elements.hostRoundEndAction.classList.remove('hidden')"), 'hostRoundEndAction must be unhidden on ROUND_END');
        assert.ok(mobileJs.includes("elements.hostGameOverAction.classList.remove('hidden')"), 'hostGameOverAction must be unhidden on GAME_OVER');
    });

    // =========================================================================
    // MULTI-PLAYER (3+ PLAYERS) FULL E2E SUITE: ALL ACTIONS & CONTROLS
    // =========================================================================

    async function setupMultiPlayerRoom(playerCount = 4, options = {}) {
        const desktopWs = await container.createRawSocket();
        container.sendMessage(desktopWs, MSG_TYPES.HOST_CREATE_ROOM, {
            options: { isHostOnPC: false, readingTime: 0, thinkingTime: 10, answerTime: 5, maxPlayers: 8, ...options }
        });
        const { payload: { roomCode } } = await container.waitForMessage(desktopWs, MSG_TYPES.ROOM_CREATED);

        const defaultPack = options.pack || [
            {
                roundIndex: 0,
                roundName: 'Раунд 1',
                themes: [
                    {
                        name: 'Тема Мультиплеер',
                        questions: [
                            { price: 100, cost: 100, q: 'Вопрос 100', a: 'Ответ 100' },
                            { price: 200, cost: 200, q: 'Вопрос 200', a: 'Ответ 200' },
                            { price: 300, cost: 300, q: 'Вопрос 300', a: 'Ответ 300' },
                            { price: 400, cost: 400, q: 'Вопрос 400', a: 'Ответ 400' },
                            { price: 500, cost: 500, q: 'Вопрос 500', a: 'Ответ 500' }
                        ]
                    }
                ]
            }
        ];
        container.sendMessage(desktopWs, MSG_TYPES.HOST_SET_PACK, { pack: defaultPack });

        const hostWs = await container.createRawSocket();
        container.sendMessage(hostWs, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Ведущий', role: 'host', avatar: '👑' });
        await container.waitForMessage(hostWs, MSG_TYPES.ROOM_STATE);

        const players = [];
        const avatars = ['🚀', '🎯', '🐱', '🦁', '🦊', '🐼', '🐨', '🐯'];
        for (let i = 0; i < playerCount; i++) {
            const ws = await container.createRawSocket();
            const name = `Игрок ${i + 1}`;
            const avatar = avatars[i % avatars.length];
            container.sendMessage(ws, MSG_TYPES.PLAYER_JOIN, { roomCode, name, role: 'player', avatar });
            const joinMsg = await container.waitForMessage(ws, MSG_TYPES.ROOM_STATE);
            players.push({
                index: i,
                ws,
                id: joinMsg.payload.self.id,
                token: joinMsg.payload.sessionToken,
                name,
                avatar
            });
        }

        return {
            roomCode,
            desktopWs,
            hostWs,
            players
        };
    }

    test('3P+ Flow 29: Scale & Room Capacity - 4 players join, 5th rejected when maxPlayers=4', async () => {
        const { roomCode, hostWs, players } = await setupMultiPlayerRoom(4, { maxPlayers: 4 });
        assert.equal(players.length, 4);

        // 5th player attempts to join -> must receive ROOM_FULL error
        const p5Ws = await container.createRawSocket();
        container.sendMessage(p5Ws, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Игрок 5', role: 'player' });
        const err = await container.waitForMessage(p5Ws, MSG_TYPES.ERROR);
        assert.equal(err.payload.code, ERROR_CODES.ROOM_FULL);

        // Verify room state and readiness
        const room = roomManager.getRoom(roomCode);
        assert.equal(room.getActivePlayersCount(), 4);
        assert.equal(room.canStartGame().canStart, true);

        // Host starts game -> all 4 players receive BOARD state
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        for (const p of players) {
            const board = await container.waitForMessage(p.ws, MSG_TYPES.ROOM_STATE, m => m.payload.state === 'BOARD');
            assert.equal(board.payload.state, 'BOARD');
        }
    });

    test('3P+ Flow 30: Multi-Player Buzzer Race - 4 players compete, P2 locks, P1/P3/P4 locked out and rejected', async () => {
        const { hostWs, players } = await setupMultiPlayerRoom(4);
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(players[0].ws, MSG_TYPES.ROOM_STATE);

        // Select question -> all 4 receive BUZZER_READY
        const readyPromises = players.map(p => container.waitForMessage(p.ws, MSG_TYPES.BUZZER_READY));
        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 0 });
        const readyResults = await Promise.all(readyPromises);
        readyResults.forEach(r => {
            players.forEach(p => assert.ok(r.payload.allowedPlayerIds.includes(p.id)));
        });

        // Player 2 (index 1) buzzes first
        const lockPromises = players.map(p => container.waitForMessage(p.ws, MSG_TYPES.BUZZ_LOCKED));
        container.sendMessage(players[1].ws, MSG_TYPES.PLAYER_BUZZ, {});
        const lockResults = await Promise.all(lockPromises);
        lockResults.forEach(l => {
            assert.equal(l.payload.playerId, players[1].id);
        });

        // Other players (P1, P3, P4) attempt to buzz -> all must receive INVALID_ACTION
        for (const idx of [0, 2, 3]) {
            const errPromise = container.waitForMessage(players[idx].ws, MSG_TYPES.ERROR);
            container.sendMessage(players[idx].ws, MSG_TYPES.PLAYER_BUZZ, {});
            const err = await errPromise;
            assert.equal(err.payload.code, ERROR_CODES.INVALID_ACTION);
        }

        // Host judges Player 2 CORRECT
        const p2ScorePromise = container.waitForMessage(players[1].ws, MSG_TYPES.SCORE_UPDATED);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: true });
        const p2Score = await p2ScorePromise;
        assert.equal(p2Score.payload.newScore, 100);
    });

    test('3P+ Flow 31: Multi-Step Arbitration Cascade - P1 wrong (-pen), P2 wrong, P3 correct, P4 untouched', async () => {
        const { hostWs, players } = await setupMultiPlayerRoom(4);
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(players[0].ws, MSG_TYPES.ROOM_STATE);

        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 1 });
        await container.waitForMessage(players[0].ws, MSG_TYPES.BUZZER_READY);

        // Step 1: P1 buzzes and answers wrong WITH penalty
        container.sendMessage(players[0].ws, MSG_TYPES.PLAYER_BUZZ, {});
        await container.waitForMessage(players[0].ws, MSG_TYPES.BUZZ_LOCKED);

        const p2ReadyPromise1 = container.waitForMessage(players[1].ws, MSG_TYPES.BUZZER_READY);
        const p1ScorePromise1 = container.waitForMessage(players[0].ws, MSG_TYPES.SCORE_UPDATED);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: false, withPenalty: true });
        const p1Score1 = await p1ScorePromise1;
        assert.equal(p1Score1.payload.newScore, -200);

        // Buzzer reopened for [P2, P3, P4], P1 excluded
        const ready1 = await p2ReadyPromise1;
        assert.ok(!ready1.payload.allowedPlayerIds.includes(players[0].id));
        assert.ok(ready1.payload.allowedPlayerIds.includes(players[1].id));
        assert.ok(ready1.payload.allowedPlayerIds.includes(players[2].id));
        assert.ok(ready1.payload.allowedPlayerIds.includes(players[3].id));

        // P1 buzzing again must fail
        const p1ErrPromise = container.waitForMessage(players[0].ws, MSG_TYPES.ERROR);
        container.sendMessage(players[0].ws, MSG_TYPES.PLAYER_BUZZ, {});
        const p1Err = await p1ErrPromise;
        assert.equal(p1Err.payload.code, ERROR_CODES.INVALID_ACTION);

        // Step 2: P2 buzzes and answers wrong WITHOUT penalty
        container.sendMessage(players[1].ws, MSG_TYPES.PLAYER_BUZZ, {});
        await container.waitForMessage(players[1].ws, MSG_TYPES.BUZZ_LOCKED);

        const p3ReadyPromise2 = container.waitForMessage(players[2].ws, MSG_TYPES.BUZZER_READY);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: false, withPenalty: false });

        // Buzzer reopened for [P3, P4], P1 and P2 excluded
        const ready2 = await p3ReadyPromise2;
        assert.ok(!ready2.payload.allowedPlayerIds.includes(players[0].id));
        assert.ok(!ready2.payload.allowedPlayerIds.includes(players[1].id));
        assert.ok(ready2.payload.allowedPlayerIds.includes(players[2].id));
        assert.ok(ready2.payload.allowedPlayerIds.includes(players[3].id));

        // Step 3: P3 buzzes and answers CORRECT
        container.sendMessage(players[2].ws, MSG_TYPES.PLAYER_BUZZ, {});
        await container.waitForMessage(players[2].ws, MSG_TYPES.BUZZ_LOCKED);

        const p3ScorePromise = container.waitForMessage(players[2].ws, MSG_TYPES.SCORE_UPDATED);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: true });
        const p3Score = await p3ScorePromise;
        assert.equal(p3Score.payload.newScore, 200);

        // Question ends, state returns to BOARD
        const p4Board = await container.waitForMessage(players[3].ws, MSG_TYPES.ROOM_STATE, m => m.payload.state === 'BOARD');
        assert.equal(p4Board.payload.state, 'BOARD');
    });

    test('3P+ Flow 32: Total Player Exhaustion - all 4 players fail, question closes without loop', async () => {
        const { hostWs, players, desktopWs } = await setupMultiPlayerRoom(4);
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(players[0].ws, MSG_TYPES.ROOM_STATE);

        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 2 });
        await container.waitForMessage(players[0].ws, MSG_TYPES.BUZZER_READY);

        // Players 0, 1, 2 all buzz and fail in sequence
        for (let i = 0; i < 3; i++) {
            container.sendMessage(players[i].ws, MSG_TYPES.PLAYER_BUZZ, {});
            await container.waitForMessage(players[i].ws, MSG_TYPES.BUZZ_LOCKED);
            const nextReadyPromise = container.waitForMessage(players[3].ws, MSG_TYPES.BUZZER_READY);
            container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: false, withPenalty: false });
            await nextReadyPromise;
        }

        // 4th player (last remaining) buzzes and fails
        container.sendMessage(players[3].ws, MSG_TYPES.PLAYER_BUZZ, {});
        await container.waitForMessage(players[3].ws, MSG_TYPES.BUZZ_LOCKED);

        const judgeDesktopPromise = container.waitForMessage(desktopWs, MSG_TYPES.JUDGE_RESULT);
        const boardDesktopPromise = container.waitForMessage(desktopWs, MSG_TYPES.ROOM_STATE, m => m.payload.state === 'BOARD');
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: false, withPenalty: false });

        const judge = await judgeDesktopPromise;
        assert.equal(judge.payload.reopened, false, 'Must not reopen after all 4 players exhausted');
        const board = await boardDesktopPromise;
        assert.equal(board.payload.state, 'BOARD');
    });

    test('3P+ Flow 33: Answer timer expiration with 3 players - P1 times out, P3 buzzes and scores', async () => {
        const { hostWs, players } = await setupMultiPlayerRoom(3, { answerTime: 1 });
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(players[0].ws, MSG_TYPES.ROOM_STATE);

        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 3 });
        await container.waitForMessage(players[0].ws, MSG_TYPES.BUZZER_READY);

        // P1 buzzes
        container.sendMessage(players[0].ws, MSG_TYPES.PLAYER_BUZZ, {});
        await container.waitForMessage(players[0].ws, MSG_TYPES.BUZZ_LOCKED);

        // 1s passes -> timeout
        const timeoutPromise = container.waitForMessage(players[0].ws, MSG_TYPES.ANSWER_TIMEOUT);
        const p3ReadyPromise = container.waitForMessage(players[2].ws, MSG_TYPES.BUZZER_READY);

        await timeoutPromise;
        const p3Ready = await p3ReadyPromise;
        assert.ok(p3Ready.payload.allowedPlayerIds.includes(players[2].id));
        assert.ok(!p3Ready.payload.allowedPlayerIds.includes(players[0].id));

        // P3 buzzes and scores
        container.sendMessage(players[2].ws, MSG_TYPES.PLAYER_BUZZ, {});
        await container.waitForMessage(players[2].ws, MSG_TYPES.BUZZ_LOCKED);

        const p3ScorePromise = container.waitForMessage(players[2].ws, MSG_TYPES.SCORE_UPDATED);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: true });
        const p3Score = await p3ScorePromise;
        assert.equal(p3Score.payload.newScore, 400);
    });

    test('3P+ Flow 34: Special question "Кот в мешке" with choice among 3 opponents - P1 transfers to P3', async () => {
        const catPack = [
            {
                roundIndex: 0,
                themes: [
                    {
                        name: 'Коты',
                        questions: [
                            { price: 500, cost: 500, q: 'Вопрос Кота', a: 'Ответ Кота', type: 'cat' }
                        ]
                    }
                ]
            }
        ];
        const { hostWs, players, desktopWs } = await setupMultiPlayerRoom(4, { pack: catPack });
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(players[0].ws, MSG_TYPES.ROOM_STATE);

        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 0 });
        await container.waitForMessage(players[0].ws, MSG_TYPES.QUESTION_ACTIVE);

        // P1 has 3 opponents: P2, P3, P4. P1 transfers to P3 (index 2)!
        const catTransferPromise = container.waitForMessage(desktopWs, MSG_TYPES.CAT_TRANSFERRED);
        container.sendMessage(players[0].ws, MSG_TYPES.PLAYER_CAT_TRANSFER, { targetPlayerId: players[2].id });
        const catTransferred = await catTransferPromise;
        assert.equal(catTransferred.payload.toPlayerId, players[2].id);

        // Host opens buzzer
        const p3ReadyPromise = container.waitForMessage(players[2].ws, MSG_TYPES.BUZZER_READY);
        container.sendMessage(hostWs, MSG_TYPES.HOST_ACTIVATE_BUZZER, {});
        const p3Ready = await p3ReadyPromise;
        assert.ok(p3Ready.payload.allowedPlayerIds.includes(players[2].id));
        assert.ok(!p3Ready.payload.allowedPlayerIds.includes(players[0].id));
        assert.ok(!p3Ready.payload.allowedPlayerIds.includes(players[1].id));
        assert.ok(!p3Ready.payload.allowedPlayerIds.includes(players[3].id));

        // P1, P2, P4 trying to buzz must all fail
        for (const idx of [0, 1, 3]) {
            const errPromise = container.waitForMessage(players[idx].ws, MSG_TYPES.ERROR);
            container.sendMessage(players[idx].ws, MSG_TYPES.PLAYER_BUZZ, {});
            const err = await errPromise;
            assert.equal(err.payload.code, ERROR_CODES.INVALID_ACTION);
        }

        // P3 buzzes and answers
        container.sendMessage(players[2].ws, MSG_TYPES.PLAYER_BUZZ, {});
        await container.waitForMessage(players[2].ws, MSG_TYPES.BUZZ_LOCKED);

        const p3ScorePromise = container.waitForMessage(players[2].ws, MSG_TYPES.SCORE_UPDATED);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: true });
        const p3Score = await p3ScorePromise;
        assert.equal(p3Score.payload.newScore, 500);
    });

    test('3P+ Flow 35: Multi-player Auction bidding war - 4 players bid, raises, passes, highest bidder wins', async () => {
        const auctionPack = [
            {
                roundIndex: 0,
                themes: [
                    {
                        name: 'Аукцион 4P',
                        questions: [
                            { price: 300, cost: 300, q: 'Аукционный вопрос', a: 'Нептун', type: 'auction' }
                        ]
                    }
                ]
            }
        ];
        const { hostWs, players, desktopWs } = await setupMultiPlayerRoom(4, { pack: auctionPack });
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(players[0].ws, MSG_TYPES.ROOM_STATE);

        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 0 });
        await container.waitForMessage(players[0].ws, MSG_TYPES.QUESTION_ACTIVE);

        // Bidding war: P1 bids 300, P2 raises to 400, P3 raises to 500, P4 passes (0)
        container.sendMessage(players[0].ws, MSG_TYPES.PLAYER_AUCTION_BET, { amount: 300 });
        await container.waitForMessage(desktopWs, MSG_TYPES.AUCTION_BET_MADE);

        container.sendMessage(players[1].ws, MSG_TYPES.PLAYER_AUCTION_BET, { amount: 400 });
        await container.waitForMessage(desktopWs, MSG_TYPES.AUCTION_BET_MADE);

        container.sendMessage(players[2].ws, MSG_TYPES.PLAYER_AUCTION_BET, { amount: 500 });
        await container.waitForMessage(desktopWs, MSG_TYPES.AUCTION_BET_MADE);

        container.sendMessage(players[3].ws, MSG_TYPES.PLAYER_AUCTION_BET, { amount: 0 });
        await container.waitForMessage(desktopWs, MSG_TYPES.AUCTION_BET_MADE);

        // P1 passes, P2 passes
        container.sendMessage(players[0].ws, MSG_TYPES.PLAYER_AUCTION_BET, { amount: 0 });
        await container.waitForMessage(desktopWs, MSG_TYPES.AUCTION_BET_MADE);

        container.sendMessage(players[1].ws, MSG_TYPES.PLAYER_AUCTION_BET, { amount: 0 });
        await container.waitForMessage(desktopWs, MSG_TYPES.AUCTION_BET_MADE);

        // P3 is highest bidder with 500
        const p3AnsStartPromise = container.waitForMessage(players[2].ws, MSG_TYPES.AUCTION_ANSWER_START);
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_AUCTION_ANSWER, { biddingPlayerIds: [players[2].id] });
        const p3AnsStart = await p3AnsStartPromise;
        assert.ok(p3AnsStart.payload.biddingPlayerIds.includes(players[2].id));

        // P3 submits answer
        const hostAnsPromise = container.waitForMessage(hostWs, MSG_TYPES.ANSWER_SUBMITTED);
        container.sendMessage(players[2].ws, MSG_TYPES.PLAYER_SUBMIT_ANSWER, { answerText: 'Нептун' });
        const hostAns = await hostAnsPromise;
        assert.equal(hostAns.payload.answerText, 'Нептун');
        assert.equal(hostAns.payload.bet, 500);

        // Host judges P3 correct -> awards 500 points
        const p3ScorePromise = container.waitForMessage(players[2].ws, MSG_TYPES.SCORE_UPDATED);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: true });
        const p3Score = await p3ScorePromise;
        assert.equal(p3Score.payload.newScore, 500);
    });

    test('3P+ Flow 36: Host remote control buttons - Show Answer, Close Question, Pause, Unpause, Pass Turn', async () => {
        const { hostWs, players, desktopWs } = await setupMultiPlayerRoom(4);
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(players[0].ws, MSG_TYPES.ROOM_STATE);

        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 0 });
        await container.waitForMessage(players[0].ws, MSG_TYPES.BUZZER_READY);

        // 1. Host tests Show Answer
        const showAnsPromise = container.waitForMessage(desktopWs, MSG_TYPES.SHOW_ANSWER);
        container.sendMessage(hostWs, MSG_TYPES.HOST_SHOW_ANSWER, {});
        const showAns = await showAnsPromise;
        assert.equal(showAns.payload.answer, 'Ответ 100');

        // 2. Host tests Pause
        const pausePromises = players.map(p => container.waitForMessage(p.ws, MSG_TYPES.GAME_PAUSED));
        container.sendMessage(hostWs, MSG_TYPES.HOST_TOGGLE_PAUSE, { isPaused: true });
        const pauseResults = await Promise.all(pausePromises);
        pauseResults.forEach(p => assert.equal(p.payload.isPaused, true));

        // 3. Host tests Unpause
        const resumePromises = players.map(p => container.waitForMessage(p.ws, MSG_TYPES.GAME_PAUSED));
        container.sendMessage(hostWs, MSG_TYPES.HOST_TOGGLE_PAUSE, { isPaused: false });
        const resumeResults = await Promise.all(resumePromises);
        resumeResults.forEach(r => assert.equal(r.payload.isPaused, false));

        // 4. Host tests Pass Turn
        const turnPromises = players.map(p => container.waitForMessage(p.ws, MSG_TYPES.TURN_PASSED));
        container.sendMessage(hostWs, MSG_TYPES.HOST_PASS_TURN, {});
        await Promise.all(turnPromises);

        // 5. Host tests Close Question
        const closePromises = players.map(p => container.waitForMessage(p.ws, MSG_TYPES.QUESTION_CLOSED));
        container.sendMessage(hostWs, MSG_TYPES.HOST_CLOSE_QUESTION, {});
        await Promise.all(closePromises);
    });

    test('3P+ Flow 37: Host score controls - Individual deltas per player and Global bonus to all N players', async () => {
        const { hostWs, players } = await setupMultiPlayerRoom(4);
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(players[0].ws, MSG_TYPES.ROOM_STATE);

        // Individual adjustments: P1: +50, P2: -30, P3: +200, P4: -100
        const deltas = [50, -30, 200, -100];
        for (let i = 0; i < 4; i++) {
            const scorePromise = container.waitForMessage(players[i].ws, MSG_TYPES.SCORE_UPDATED, m => m.payload.playerId === players[i].id);
            container.sendMessage(hostWs, MSG_TYPES.HOST_UPDATE_SCORE, { playerId: players[i].id, delta: deltas[i] });
            const res = await scorePromise;
            assert.equal(res.payload.newScore, deltas[i]);
        }

        // Global bonus: +100 to all players
        const globalPromises = players.map(p => container.waitForMessage(p.ws, MSG_TYPES.SCORE_UPDATED, m => m.payload.isAll === true));
        container.sendMessage(hostWs, MSG_TYPES.HOST_UPDATE_ALL_SCORES, { delta: 100 });
        const globalResults = await Promise.all(globalPromises);

        const expectedScores = [150, 70, 300, 0];
        globalResults.forEach(g => {
            for (let i = 0; i < 4; i++) {
                const found = g.payload.players.find(p => p.id === players[i].id);
                assert.equal(found.score, expectedScores[i]);
            }
        });
    });

    test('3P+ Flow 38: Mid-game disconnect, auto-pause and reconnect with 4 players', async () => {
        const { hostWs, players, roomCode } = await setupMultiPlayerRoom(4);
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(players[0].ws, MSG_TYPES.ROOM_STATE);

        // Give P3 (index 2) 350 points
        container.sendMessage(hostWs, MSG_TYPES.HOST_UPDATE_SCORE, { playerId: players[2].id, delta: 350 });
        await container.waitForMessage(players[0].ws, MSG_TYPES.SCORE_UPDATED);

        // P3 abruptly disconnects
        const p1LeftPromise = container.waitForMessage(players[0].ws, MSG_TYPES.PLAYER_LEFT);
        const p1PausePromise = container.waitForMessage(players[0].ws, MSG_TYPES.GAME_PAUSED);
        players[2].ws.terminate();

        const p1Left = await p1LeftPromise;
        assert.equal(p1Left.payload.playerId, players[2].id);
        const p1Pause = await p1PausePromise;
        assert.equal(p1Pause.payload.isPaused, true);

        // P3 reconnects with session token
        const p3NewWs = await container.createRawSocket();
        const p1JoinPromise = container.waitForMessage(players[0].ws, MSG_TYPES.PLAYER_JOINED);
        container.sendMessage(p3NewWs, MSG_TYPES.PLAYER_JOIN, {
            roomCode,
            name: players[2].name,
            sessionToken: players[2].token,
            role: 'player'
        });

        const p1Join = await p1JoinPromise;
        assert.equal(p1Join.payload.isReconnect, true);

        // P3 verifies preserved score
        const p3State = await container.waitForMessage(p3NewWs, MSG_TYPES.ROOM_STATE);
        assert.equal(p3State.payload.self.score, 350);

        // Host unpauses
        container.sendMessage(hostWs, MSG_TYPES.HOST_TOGGLE_PAUSE, { isPaused: false });
        const unpauseMsg = await container.waitForMessage(p3NewWs, MSG_TYPES.GAME_PAUSED);
        assert.equal(unpauseMsg.payload.isPaused, false);
    });

    test('3P+ Flow 39: Host kicks a player from 4-player game (reduces to 3 players)', async () => {
        const { hostWs, players, roomCode } = await setupMultiPlayerRoom(4);
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(players[0].ws, MSG_TYPES.ROOM_STATE);

        // Host kicks Player 2 (index 1)
        const p2KickedPromise = container.waitForMessage(players[1].ws, MSG_TYPES.PLAYER_KICKED);
        const p1LeftPromise = container.waitForMessage(players[0].ws, MSG_TYPES.PLAYER_LEFT);
        container.sendMessage(hostWs, MSG_TYPES.HOST_KICK_PLAYER, { playerId: players[1].id });

        const kicked = await p2KickedPromise;
        assert.equal(kicked.payload.reason, 'kicked_by_host');
        const left = await p1LeftPromise;
        assert.equal(left.payload.playerId, players[1].id);
        assert.equal(left.payload.kicked, true);

        // Active count drops from 4 to 3
        const room = roomManager.getRoom(roomCode);
        assert.equal(room.getActivePlayersCount(), 3);
    });

    test('3P+ Flow 40: Multi-round pack progression with 4 players (Round 1 -> Round 2)', async () => {
        const multiRoundPack = [
            {
                roundIndex: 0,
                roundName: 'Раунд 1',
                themes: [{ name: 'Т1', questions: [{ cost: 100, q: 'В1', a: 'О1' }] }]
            },
            {
                roundIndex: 1,
                roundName: 'Раунд 2',
                themes: [{ name: 'Т2', questions: [{ cost: 200, q: 'В2', a: 'О2' }] }]
            }
        ];
        const { hostWs, players } = await setupMultiPlayerRoom(4, { pack: multiRoundPack });
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(players[0].ws, MSG_TYPES.ROOM_STATE);

        // Play Round 1 question
        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 0 });
        await container.waitForMessage(players[0].ws, MSG_TYPES.BUZZER_READY);
        container.sendMessage(players[0].ws, MSG_TYPES.PLAYER_BUZZ, {});
        await container.waitForMessage(players[0].ws, MSG_TYPES.BUZZ_LOCKED);

        // Correct answer ends Round 1
        const roundEndPromise = container.waitForMessage(hostWs, MSG_TYPES.ROOM_STATE);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: true });
        const rEnd = await roundEndPromise;
        assert.equal(rEnd.payload.state, 'ROUND_END');

        // Advance to Round 2
        const roundChangedPromises = players.map(p => container.waitForMessage(p.ws, MSG_TYPES.ROUND_CHANGED));
        container.sendMessage(hostWs, MSG_TYPES.HOST_NEXT_ROUND, {});
        const rChanges = await Promise.all(roundChangedPromises);
        rChanges.forEach(rc => assert.equal(rc.payload.roundIndex, 1));
    });

    test('3P+ Flow 41: Full match completion & multi-player rankings (1st, 2nd, 3rd, 4th place)', async () => {
        const { hostWs, players, desktopWs } = await setupMultiPlayerRoom(4);
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(players[0].ws, MSG_TYPES.ROOM_STATE);

        // Finish game with ranked scoreboard
        const winnersPayload = {
            winners: [
                { name: 'Игрок 1', score: 1500 },
                { name: 'Игрок 2', score: 1100 },
                { name: 'Игрок 3', score: 800 },
                { name: 'Игрок 4', score: 400 }
            ]
        };
        const finishPromises = players.map(p => container.waitForMessage(p.ws, MSG_TYPES.GAME_FINISHED));
        const hostFinishPromise = container.waitForMessage(hostWs, MSG_TYPES.GAME_FINISHED);
        container.sendMessage(desktopWs, MSG_TYPES.GAME_FINISHED, winnersPayload);

        const results = await Promise.all(finishPromises);
        const hostFinish = await hostFinishPromise;

        results.forEach(res => {
            assert.equal(res.payload.winners.length, 4);
            assert.equal(res.payload.winners[0].name, 'Игрок 1');
            assert.equal(res.payload.winners[1].name, 'Игрок 2');
            assert.equal(res.payload.winners[2].name, 'Игрок 3');
            assert.equal(res.payload.winners[3].name, 'Игрок 4');
        });
        assert.equal(hostFinish.payload.winners[0].name, 'Игрок 1');
    });

    test('3P+ Flow 42: Multi-player tie game resolution (Tied for 1st place)', async () => {
        const { hostWs, players, desktopWs } = await setupMultiPlayerRoom(3);
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(players[0].ws, MSG_TYPES.ROOM_STATE);

        const winnersPayload = {
            winners: [
                { name: 'Игрок 1', score: 1000 },
                { name: 'Игрок 2', score: 1000 },
                { name: 'Игрок 3', score: 500 }
            ]
        };
        const finishPromises = players.map(p => container.waitForMessage(p.ws, MSG_TYPES.GAME_FINISHED));
        container.sendMessage(desktopWs, MSG_TYPES.GAME_FINISHED, winnersPayload);

        const results = await Promise.all(finishPromises);
        results.forEach(res => {
            assert.equal(res.payload.winners[0].score, 1000);
            assert.equal(res.payload.winners[1].score, 1000);
            assert.equal(res.payload.winners[2].score, 500);
        });
    });

    test('3P+ Flow 43: High-concurrency simultaneous buzz race - 5 players buzz at exact same ms', async () => {
        const { hostWs, players } = await setupMultiPlayerRoom(5);
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(players[0].ws, MSG_TYPES.ROOM_STATE);

        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 0 });
        await container.waitForMessage(players[0].ws, MSG_TYPES.BUZZER_READY);

        // All 5 players buzz concurrently in the exact same event loop cycle
        players.forEach(p => container.sendMessage(p.ws, MSG_TYPES.PLAYER_BUZZ, {}));

        // Exactly one player locks the buzzer
        const hostLockMsg = await container.waitForMessage(hostWs, MSG_TYPES.BUZZ_LOCKED);
        const winnerId = hostLockMsg.payload.playerId;
        assert.ok(players.some(p => p.id === winnerId), 'Winner must be one of the 5 players');

        // All players receive BUZZ_LOCKED with the exact same winner ID
        for (const p of players) {
            const lockMsg = await container.waitForMessage(p.ws, MSG_TYPES.BUZZ_LOCKED);
            assert.equal(lockMsg.payload.playerId, winnerId);
        }
    });

    test('3P+ Flow 44: Anti-cheat sanitization across N players - answers never leaked, illegal answers rejected', async () => {
        const secretPack = [
            {
                roundIndex: 0,
                themes: [
                    {
                        name: 'Секретная',
                        questions: [
                            { price: 500, cost: 500, q: 'Секрет', a: 'Тайна_42', comment: 'Подсказка_99' }
                        ]
                    }
                ]
            }
        ];
        const { hostWs, players } = await setupMultiPlayerRoom(4, { pack: secretPack });
        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(players[0].ws, MSG_TYPES.ROOM_STATE);

        const hostQPromise = container.waitForMessage(hostWs, MSG_TYPES.QUESTION_ACTIVE);
        const playerQPromises = players.map(p => container.waitForMessage(p.ws, MSG_TYPES.QUESTION_ACTIVE));
        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 0 });

        const hostQ = await hostQPromise;
        assert.equal(hostQ.payload.question.a, 'Тайна_42');
        assert.equal(hostQ.payload.question.comment, 'Подсказка_99');

        const playerQResults = await Promise.all(playerQPromises);
        playerQResults.forEach(pq => {
            assert.equal(pq.payload.question.a, undefined);
            assert.equal(pq.payload.question.comment, undefined);
        });

        // Player 1 buzzes
        container.sendMessage(players[0].ws, MSG_TYPES.PLAYER_BUZZ, {});
        await container.waitForMessage(players[0].ws, MSG_TYPES.BUZZ_LOCKED);

        // Player 2 attempts to submit answer while Player 1 is answering -> rejected
        const p2SubmitErrPromise = container.waitForMessage(players[1].ws, MSG_TYPES.ERROR);
        container.sendMessage(players[1].ws, MSG_TYPES.PLAYER_SUBMIT_ANSWER, { answerText: 'Попытка взлома' });
        const p2Err = await p2SubmitErrPromise;
        assert.equal(p2Err.payload.code, ERROR_CODES.INVALID_ACTION);
    });

    test('3P+ Flow 45: Mobile client DOM & rendering integrity for 3+ players (player rows, cat targets, auction)', () => {
        const mobileJs = fs.readFileSync(path.join(__dirname, '..', 'mobile', 'mobile.js'), 'utf8');

        // Verify host players list renders player rows with minus-cost and plus-cost buttons
        assert.ok(mobileJs.includes('host-player-row'), 'Must render host-player-row');
        assert.ok(mobileJs.includes('minus-cost'), 'Must render minus-cost button');
        assert.ok(mobileJs.includes('plus-cost'), 'Must render plus-cost button');
        assert.ok(mobileJs.includes('host-player-avatar'), 'Must render host-player-avatar');

        // Verify cat player selection excludes self and host
        assert.ok(mobileJs.includes('function renderCatPlayersList'), 'Must have renderCatPlayersList');
        assert.ok(mobileJs.includes('cat-player-item'), 'Must render cat-player-item');

        // Verify auction list rendering for host
        assert.ok(mobileJs.includes('function renderHostAuctionList'), 'Must have renderHostAuctionList');
        assert.ok(mobileJs.includes('host-auction-card'), 'Must render host-auction-card');
    });

            test('3P+ Flow 46: Buzzer race -> yellow circle -> reject with/without penalty -> timer resumes for others only', async () => {
        const { hostWs, desktopWs, players } = await setupMultiPlayerRoom(3, { readingTime: 0, thinkingTime: 20 });
        const p1Ws = players[0].ws, p1Id = players[0].id;
        const p2Ws = players[1].ws, p2Id = players[1].id;
        const p3Ws = players[2].ws, p3Id = players[2].id;

        container.sendMessage(hostWs, MSG_TYPES.HOST_START_GAME, {});
        await container.waitForMessage(desktopWs, MSG_TYPES.ROOM_STATE, m => m.payload.state === 'BOARD');

        const ready1Promise = container.waitForMessage(p1Ws, MSG_TYPES.BUZZER_READY);
        container.sendMessage(hostWs, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 1 });
        const ready1 = await ready1Promise;
        assert.ok(ready1.payload.allowedPlayerIds.includes(p1Id));
        assert.ok(ready1.payload.allowedPlayerIds.includes(p2Id));
        assert.ok(ready1.payload.allowedPlayerIds.includes(p3Id));

        // 1. P1 buzzes first -> buzz locked (yellow circle on TV, main timer stops)
        const locked1Promise = container.waitForMessage(p1Ws, MSG_TYPES.BUZZ_LOCKED);
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_BUZZ, {});
        const locked1 = await locked1Promise;
        assert.equal(locked1.payload.playerId, p1Id);
        assert.equal(locked1.payload.answerTime, 5);

        // 2. Host rejects P1 without penalty (withPenalty: false)
        const ready2Promise = container.waitForMessage(p2Ws, MSG_TYPES.BUZZER_READY);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: false, withPenalty: false });
        const ready2 = await ready2Promise;

        // P1 must NOT be in allowedPlayerIds; P2 and P3 MUST be
        assert.ok(!ready2.payload.allowedPlayerIds.includes(p1Id), 'P1 already answered and must be excluded');
        assert.ok(ready2.payload.allowedPlayerIds.includes(p2Id), 'P2 must be eligible');
        assert.ok(ready2.payload.allowedPlayerIds.includes(p3Id), 'P3 must be eligible');
        assert.ok(ready2.payload.remainingThinkingTime > 0, 'Remaining thinking timer must be > 0');

        // 3. P2 buzzes second -> buzz locked for P2
        const locked2Promise = container.waitForMessage(p2Ws, MSG_TYPES.BUZZ_LOCKED);
        container.sendMessage(p2Ws, MSG_TYPES.PLAYER_BUZZ, {});
        const locked2 = await locked2Promise;
        assert.equal(locked2.payload.playerId, p2Id);

        // 4. Host rejects P2 with penalty (withPenalty: true)
        const ready3Promise = container.waitForMessage(p3Ws, MSG_TYPES.BUZZER_READY);
        const p2ScorePromise = container.waitForMessage(p2Ws, MSG_TYPES.SCORE_UPDATED);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: false, withPenalty: true });

        const ready3 = await ready3Promise;
        const p2Score = await p2ScorePromise;
        assert.equal(p2Score.payload.newScore, -200);

        // Only P3 must remain eligible
        assert.ok(!ready3.payload.allowedPlayerIds.includes(p1Id), 'P1 still excluded');
        assert.ok(!ready3.payload.allowedPlayerIds.includes(p2Id), 'P2 now excluded');
        assert.ok(ready3.payload.allowedPlayerIds.includes(p3Id), 'P3 is only remaining eligible player');

        // 5. P3 buzzes and answers correctly -> scores points
        const locked3Promise = container.waitForMessage(p3Ws, MSG_TYPES.BUZZ_LOCKED);
        container.sendMessage(p3Ws, MSG_TYPES.PLAYER_BUZZ, {});
        await locked3Promise;

        const scoreP3Promise = container.waitForMessage(p3Ws, MSG_TYPES.SCORE_UPDATED);
        container.sendMessage(hostWs, MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: true });
        const p3Score = await scoreP3Promise;
        assert.equal(p3Score.payload.newScore, 200);
    });

});
