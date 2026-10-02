#!/usr/bin/env node
/**
 * simulate_load.js
 * Нагрузочное стресс-тестирование WebSocket сервера Quiz U.
 *
 * Симулирует:
 * - 50 независимых игровых комнат (50 Host-соединений)
 * - 200 виртуальных игроков (по 4 игрока в каждой комнате)
 * - Синхронный арбитраж баззера (гонка одновременных нажатий)
 * - Замер времени отклика (латентность баззера min/avg/max), нагрузки на CPU и RAM (heapUsed).
 */

const http = require('http');
const { WebSocket, WebSocketServer } = require('ws');
const RoomManager = require('../src/RoomManager');
const { MSG_TYPES, createMessage, parseMessage } = require('../src/protocol');

/**
 * Создает изолированный тестовый сервер на указанном порту
 */
function createTestServer(port = 8099) {
    const roomManager = new RoomManager();
    const server = http.createServer((req, res) => {
        if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
            return;
        }
        res.writeHead(200);
        res.end('Quiz U Load Test Server');
    });

    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
        ws.isAlive = true;
        ws.roomCode = null;
        ws.playerId = null;
        ws.isHost = false;

        ws.on('message', (data) => {
            const message = parseMessage(data);
            if (!message) return;
            const { type, payload } = message;

            switch (type) {
                case MSG_TYPES.HOST_CREATE_ROOM: {
                    const room = roomManager.createRoom(ws, payload ? payload.options : {});
                    ws.isHost = true;
                    ws.roomCode = room.code;
                    ws.send(createMessage(MSG_TYPES.ROOM_CREATED, {
                        roomCode: room.code,
                        hostToken: room.hostToken,
                        state: room.getStateSnapshot(false)
                    }));
                    break;
                }
                case MSG_TYPES.HOST_START_GAME: {
                    const room = roomManager.getRoom(ws.roomCode);
                    if (room && ws.isHost) room.startGame();
                    break;
                }
                case MSG_TYPES.HOST_SELECT_QUESTION: {
                    const room = roomManager.getRoom(ws.roomCode);
                    if (room && ws.isHost) {
                        room.selectQuestion(payload.themeIdx, payload.questionIdx, payload.question);
                    }
                    break;
                }
                case MSG_TYPES.HOST_ACTIVATE_BUZZER: {
                    const room = roomManager.getRoom(ws.roomCode);
                    if (room && ws.isHost) room.activateBuzzer();
                    break;
                }
                case MSG_TYPES.HOST_JUDGE_ANSWER: {
                    const room = roomManager.getRoom(ws.roomCode);
                    if (room && ws.isHost) room.judgeAnswer(payload.isCorrect);
                    break;
                }
                case MSG_TYPES.PLAYER_JOIN: {
                    const room = roomManager.getRoom(payload.roomCode);
                    if (!room) return;
                    const resJoin = room.addPlayer(payload.name, payload.avatar, ws);
                    if (resJoin.success) {
                        ws.roomCode = room.code;
                        ws.playerId = resJoin.player.id;
                        ws.send(createMessage(MSG_TYPES.ROOM_STATE, {
                            ...room.getStateSnapshot(true),
                            self: room.sanitizePlayer(resJoin.player)
                        }));
                    }
                    break;
                }
                case MSG_TYPES.PLAYER_BUZZ: {
                    const room = roomManager.getRoom(ws.roomCode);
                    if (room && ws.playerId) {
                        room.handleBuzz(ws.playerId);
                    }
                    break;
                }
                case MSG_TYPES.PLAYER_SUBMIT_ANSWER: {
                    const room = roomManager.getRoom(ws.roomCode);
                    if (room && ws.playerId) {
                        room.submitAnswer(ws.playerId, payload.answerText);
                    }
                    break;
                }
            }
        });

        ws.on('close', () => {
            if (ws.roomCode) {
                const room = roomManager.getRoom(ws.roomCode);
                if (room && ws.playerId) room.removePlayer(ws.playerId);
            }
        });
    });

    return new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => {
            resolve({
                server,
                wss,
                roomManager,
                port,
                close: () => new Promise((done) => {
                    roomManager.destroy();
                    wss.close(() => {
                        server.close(done);
                    });
                })
            });
        });
    });
}

/**
 * Запуск нагрузочного стресс-теста
 * @param {Object} [config]
 * @param {number} [config.roomsCount=50]
 * @param {number} [config.playersPerRoom=4]
 * @param {number} [config.port=8099]
 */
async function runLoadTest(config = {}) {
    const roomsCount = config.roomsCount || 50;
    const playersPerRoom = config.playersPerRoom || 4;
    const totalPlayersCount = roomsCount * playersPerRoom;
    const port = config.port || 8099;
    const serverUrl = `ws://127.0.0.1:${port}`;

    const testServer = await createTestServer(port);

    const initialMem = process.memoryUsage();
    const startCpu = process.cpuUsage();
    const testStartTime = Date.now();

    const hosts = [];
    const players = [];
    const rooms = []; // { roomCode, hostWs, playerSockets: [] }
    const errors = [];
    const buzzLatencies = [];
    let totalMessagesProcessed = 0;

    try {
        // --- ФАЗА 1: Создание 50 комнат хостами ---
        const hostConnectPromises = [];
        for (let i = 0; i < roomsCount; i++) {
            hostConnectPromises.push(new Promise((resolve, reject) => {
                const ws = new WebSocket(serverUrl);
                ws.on('open', () => {
                    ws.send(createMessage(MSG_TYPES.HOST_CREATE_ROOM, {
                        options: { roomName: `LoadRoom-${i + 1}` }
                    }));
                });
                ws.on('message', (data) => {
                    totalMessagesProcessed++;
                    const msg = parseMessage(data);
                    if (msg && msg.type === MSG_TYPES.ROOM_CREATED) {
                        const roomCode = msg.payload.roomCode;
                        hosts.push(ws);
                        rooms.push({ roomIndex: i, roomCode, hostWs: ws, playerSockets: [] });
                        resolve();
                    }
                });
                ws.on('error', (err) => {
                    errors.push(`Host-${i} error: ${err.message}`);
                    reject(err);
                });
            }));
        }

        await Promise.all(hostConnectPromises);

        // --- ФАЗА 2: Подключение 200 игроков (по 4 в каждую комнату) ---
        const playerConnectPromises = [];
        for (const room of rooms) {
            for (let p = 0; p < playersPerRoom; p++) {
                const pIndex = p;
                playerConnectPromises.push(new Promise((resolve, reject) => {
                    const pWs = new WebSocket(serverUrl);
                    pWs.roomCode = room.roomCode;
                    pWs.playerName = `P${pIndex + 1}_${room.roomCode}`;

                    pWs.on('open', () => {
                        pWs.send(createMessage(MSG_TYPES.PLAYER_JOIN, {
                            roomCode: room.roomCode,
                            name: pWs.playerName,
                            avatar: '🐱'
                        }));
                    });

                    pWs.on('message', (data) => {
                        totalMessagesProcessed++;
                        const msg = parseMessage(data);
                        if (msg && msg.type === MSG_TYPES.ROOM_STATE && msg.payload && msg.payload.self && !pWs.playerId) {
                            pWs.playerId = msg.payload.self.id;
                            players.push(pWs);
                            room.playerSockets.push(pWs);
                            resolve();
                        }
                    });

                    pWs.on('error', (err) => {
                        errors.push(`Player error: ${err.message}`);
                        reject(err);
                    });
                }));
            }
        }

        await Promise.all(playerConnectPromises);

        // --- ФАЗА 3: Запуск игры во всех 50 комнатах и стресс-гонка баззеров ---
        const roundPromises = [];

        for (const room of rooms) {
            roundPromises.push(new Promise((resolve) => {
                let buzzSentTime = 0;

                // Слушаем хост на подтверждение BUZZ_LOCKED
                const hostMsgHandler = (data) => {
                    const msg = parseMessage(data);
                    if (msg && msg.type === MSG_TYPES.BUZZ_LOCKED) {
                        const latency = Date.now() - buzzSentTime;
                        buzzLatencies.push(latency);
                        room.hostWs.removeListener('message', hostMsgHandler);

                        // Хост принимает правильный ответ
                        room.hostWs.send(createMessage(MSG_TYPES.HOST_JUDGE_ANSWER, { isCorrect: true }));
                        resolve();
                    }
                };
                room.hostWs.on('message', hostMsgHandler);

                // Хост начинает игру и выбирает вопрос
                room.hostWs.send(createMessage(MSG_TYPES.HOST_START_GAME));
                room.hostWs.send(createMessage(MSG_TYPES.HOST_SELECT_QUESTION, {
                    themeIdx: 0,
                    questionIdx: 0,
                    question: { q: 'Stress test question?', cost: 100, a: 'OK' }
                }));

                // Открываем баззер
                room.hostWs.send(createMessage(MSG_TYPES.HOST_ACTIVATE_BUZZER));

                // Все игроки комнаты одновременно жмут баззер
                buzzSentTime = Date.now();
                for (const pWs of room.playerSockets) {
                    pWs.send(createMessage(MSG_TYPES.PLAYER_BUZZ));
                }
            }));
        }

        await Promise.all(roundPromises);

    } finally {
        // Завершение и закрытие всех сокетов
        for (const p of players) {
            try { p.terminate(); } catch (e) {}
        }
        for (const h of hosts) {
            try { h.terminate(); } catch (e) {}
        }
        await testServer.close();
    }

    const testDurationMs = Date.now() - testStartTime;
    const finalMem = process.memoryUsage();
    const cpuDiff = process.cpuUsage(startCpu);

    const minLatency = buzzLatencies.length ? Math.min(...buzzLatencies) : 0;
    const maxLatency = buzzLatencies.length ? Math.max(...buzzLatencies) : 0;
    const avgLatency = buzzLatencies.length ? (buzzLatencies.reduce((a, b) => a + b, 0) / buzzLatencies.length).toFixed(1) : 0;

    const report = {
        success: errors.length === 0 && rooms.length === roomsCount && players.length === totalPlayersCount,
        roomsCount,
        playersPerRoom,
        totalPlayersCount,
        totalSockets: hosts.length + players.length,
        durationMs: testDurationMs,
        totalMessagesProcessed,
        throughputMsgsPerSec: Math.round((totalMessagesProcessed / (testDurationMs / 1000))),
        latency: {
            minMs: minLatency,
            avgMs: Number(avgLatency),
            maxMs: maxLatency,
            samplesCount: buzzLatencies.length
        },
        memory: {
            initialHeapUsedMb: Number((initialMem.heapUsed / (1024 * 1024)).toFixed(2)),
            finalHeapUsedMb: Number((finalMem.heapUsed / (1024 * 1024)).toFixed(2)),
            heapDiffMb: Number(((finalMem.heapUsed - initialMem.heapUsed) / (1024 * 1024)).toFixed(2)),
            rssMb: Number((finalMem.rss / (1024 * 1024)).toFixed(2))
        },
        cpu: {
            userMs: Math.round(cpuDiff.user / 1000),
            systemMs: Math.round(cpuDiff.system / 1000)
        },
        errorsCount: errors.length,
        errors
    };

    return report;
}

if (require.main === module) {
    console.log('⚡ ЗАПУСК НАГРУЗОЧНОГО СТРЕСС-ТЕСТИРОВАНИЯ (50 комнат, 200 игроков)...');
    runLoadTest({ roomsCount: 50, playersPerRoom: 4, port: 8099 })
        .then((report) => {
            console.log('\n========================================================');
            console.log('📊 РЕЗУЛЬТАТЫ СТРЕСС-ТЕСТИРОВАНИЯ QUIZ U:');
            console.log('========================================================');
            console.log(`✅ Статус:                   ${report.success ? 'УСПЕШНО (PASSED)' : 'С ОШИБКАМИ'}`);
            console.log(`🏠 Виртуальных комнат:       ${report.roomsCount}`);
            console.log(`📱 Виртуальных игроков:      ${report.totalPlayersCount} (${report.playersPerRoom} на комнату)`);
            console.log(`🔌 Всего соединений (WS):    ${report.totalSockets} (50 хостов + 200 пультов)`);
            console.log(`⏱️ Общее время прогона:      ${report.durationMs} мс (${(report.durationMs / 1000).toFixed(2)} сек)`);
            console.log(`📨 Обработано сообщений:     ${report.totalMessagesProcessed}`);
            console.log(`⚡ Пропускная способность:   ${report.throughputMsgsPerSec} сообщений/сек`);
            console.log('--------------------------------------------------------');
            console.log('⏱️ ЛАТЕНТНОСТЬ АРБИТРАЖА БАЗЗЕРА (Round-trip time):');
            console.log(`   - Минимальная:            ${report.latency.minMs} мс`);
            console.log(`   - Средняя:                ${report.latency.avgMs} мс`);
            console.log(`   - Максимальная:           ${report.latency.maxMs} мс`);
            console.log('--------------------------------------------------------');
            console.log('💾 ИСПОЛЬЗОВАНИЕ ПАМЯТИ И РЕСУРСОВ:');
            console.log(`   - Начальный Heap Used:    ${report.memory.initialHeapUsedMb} МБ`);
            console.log(`   - Финальный Heap Used:    ${report.memory.finalHeapUsedMb} МБ (дельта: +${report.memory.heapDiffMb} МБ)`);
            console.log(`   - Общий RSS процесса:     ${report.memory.rssMb} МБ`);
            console.log(`   - Нагрузка CPU (user/sys): ${report.cpu.userMs} мс / ${report.cpu.systemMs} мс`);
            console.log('--------------------------------------------------------');
            console.log(`❌ Ошибок или сбросов:       ${report.errorsCount}`);
            console.log('========================================================\n');

            if (!report.success) {
                process.exit(1);
            }
        })
        .catch((err) => {
            console.error('Fatal load test error:', err);
            process.exit(1);
        });
}

module.exports = { runLoadTest, createTestServer };
