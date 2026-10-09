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

    waitForMessage(ws, expectedType, timeoutMs = 3000) {
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

    test('Flow 7: Common timer freezes and displays snowflake on player buzz (Requirement 2)', async () => {
        const desktopWs = await container.createRawSocket();
        container.sendMessage(desktopWs, MSG_TYPES.HOST_CREATE_ROOM, {
            options: { isHostOnPC: false, readingTime: 1, thinkingTime: 15 }
        });
        const { payload: { roomCode } } = await container.waitForMessage(desktopWs, MSG_TYPES.ROOM_CREATED);

        const mockPack = [{
            roundIndex: 0,
            themes: [{
                name: '????',
                questions: [{ cost: 200, q: '??????', a: '???????' }]
            }]
        }];
        container.sendMessage(desktopWs, MSG_TYPES.HOST_SET_PACK, { pack: mockPack });

        const p1Ws = await container.createRawSocket();
        container.sendMessage(p1Ws, MSG_TYPES.PLAYER_JOIN, { roomCode, name: '???', role: 'player' });
        const p1Join = await container.waitForMessage(p1Ws, MSG_TYPES.ROOM_STATE);
        const p1Id = p1Join.payload.self.id;

        const hostWs = await container.createRawSocket();
        container.sendMessage(hostWs, MSG_TYPES.PLAYER_JOIN, { roomCode, name: '???????', role: 'host' });
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
        assert.ok(gameJs.includes("timerElem.className = 'timer frozen';"), 'Must assign timer frozen class');
        assert.ok(gameJs.includes('timer frozen') && gameJs.includes('timer-hint'), 'Hint must show frozen snowflake text');
        assert.ok(gameJs.includes("stopTimer();"), 'Thinking timer must be stopped');
        assert.ok(gameJs.includes("isAnswerTimerActive = true;"), 'Answer timer state must be marked active');

        // Verify CSS styling for .timer.frozen has bright blue gradient, border and snowflake
        const styleCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
        assert.ok(styleCss.includes('.timer.frozen'), 'CSS must define .timer.frozen');
        assert.ok(styleCss.includes('#0284c7'), 'CSS must have blue gradient #0284c7');
        assert.ok(styleCss.includes('#38bdf8'), 'CSS must have cyan border #38bdf8');
        assert.ok(styleCss.includes('.timer.frozen::after'), 'CSS ::after must display snowflake');
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
});
