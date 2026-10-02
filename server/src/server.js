/**
 * Quiz U - Authoritative Game Room Server
 * Features:
 * - WebSocket Server with heartbeat ping/pong
 * - Authoritative room state, buzz race arbitration & anti-cheat
 * - Static file serving for /mobile web app
 * - JSON question packs serving with percent-encoded Cyrillic support
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { MSG_TYPES, ERROR_CODES, createMessage, parseMessage } = require('./protocol');
const RoomManager = require('./RoomManager');

const PORT = process.env.PORT || 8080;
const rootDir = path.resolve(__dirname, '..', '..');
const mobileDir = path.join(rootDir, 'mobile');
const packsDir = path.join(rootDir, 'паки вопросов');

const roomManager = new RoomManager();

// MIME Types Map
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4'
};

// HTTP Server: Handles static files and question pack requests
const server = http.createServer((req, res) => {
    // Health Check Endpoint
    if (req.url === '/health' || req.url === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    }

    // Stats Endpoint (Rooms count, active connections)
    if (req.url === '/stats' || req.url === '/api/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const stats = roomManager.getStats();
        return res.end(JSON.stringify({
            status: 'ok',
            totalRooms: stats.totalRooms,
            totalPlayers: stats.totalPlayers,
            activePlayers: stats.activePlayers,
            timestamp: Date.now()
        }));
    }

    // Decode percent-encoded URLs (e.g., %D0%BF%D0%B0%D0%BA%D0%B8)
    let decodedUrl;
    try {
        decodedUrl = decodeURIComponent(req.url);
    } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Bad Request');
    }

    const cleanPath = decodedUrl.split('?')[0];

    // Global Path Traversal Protection
    if (cleanPath.includes('..') || cleanPath.includes('/.') || cleanPath.includes('\\')) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Forbidden');
    }

    // Handle /mobile route -> serve mobile web app
    if (cleanPath === '/mobile' || cleanPath === '/mobile/') {
        return serveStaticFile(path.join(mobileDir, 'index.html'), res);
    }

    if (cleanPath.startsWith('/mobile/')) {
        const relativeMobilePath = cleanPath.slice('/mobile/'.length);
        const resolvedPath = path.resolve(mobileDir, relativeMobilePath);

        // Path Traversal Security Check
        if (!resolvedPath.startsWith(mobileDir)) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Forbidden');
        }

        return serveStaticFile(resolvedPath, res);
    }

    // Handle /js/net/ references from mobile app (Protocol.js, NetworkClient.js)
    if (cleanPath.startsWith('/js/net/')) {
        const netFile = cleanPath.slice('/js/net/'.length);
        const resolvedNetPath = path.resolve(rootDir, 'js', 'net', netFile);

        if (!resolvedNetPath.startsWith(path.resolve(rootDir, 'js', 'net'))) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Forbidden');
        }
        return serveStaticFile(resolvedNetPath, res);
    }

    // Handle question packs static requests
    if (cleanPath.startsWith('/паки вопросов/')) {
        const relativePackPath = cleanPath.slice('/паки вопросов/'.length);
        const resolvedPackPath = path.resolve(packsDir, relativePackPath);

        if (!resolvedPackPath.startsWith(packsDir)) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Forbidden');
        }
        return serveStaticFile(resolvedPackPath, res);
    }

    // Fallback 404
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
});

function serveStaticFile(filePath, res) {
    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('File Not Found');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stats.size,
            'Cache-Control': 'no-cache'
        });

        const readStream = fs.createReadStream(filePath);
        readStream.pipe(res);
    });
}

// WebSocket Server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.roomCode = null;
    ws.playerId = null;
    ws.isHost = false;

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', (data) => {
        try {
            const message = parseMessage(data);
            if (!message) {
                return ws.send(createMessage(MSG_TYPES.ERROR, {
                    code: ERROR_CODES.INVALID_PAYLOAD,
                    message: 'Некорректный формат сообщения'
                }));
            }
            handleClientMessage(ws, message);
        } catch (err) {
            console.error('Error handling WS message:', err);
            ws.send(createMessage(MSG_TYPES.ERROR, {
                code: ERROR_CODES.INVALID_ACTION,
                message: 'Внутренняя ошибка сервера'
            }));
        }
    });

    ws.on('close', () => {
        handleClientDisconnect(ws);
    });

    ws.on('error', (err) => {
        console.warn('WS Client error:', err.message);
    });
});

function handleClientMessage(ws, message) {
    const { type, payload } = message;

    switch (type) {
        // --- HOST ACTIONS ---
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

        case MSG_TYPES.HOST_SET_PACK: {
            const room = roomManager.getRoom(ws.roomCode);
            if (!room || !ws.isHost) return;
            room.setPack(payload.pack);
            ws.send(createMessage(MSG_TYPES.ROOM_STATE, room.getStateSnapshot(false)));
            break;
        }

        case MSG_TYPES.HOST_START_GAME: {
            const room = roomManager.getRoom(ws.roomCode);
            if (!room || !ws.isHost) return;
            const res = room.startGame();
            if (!res.success) {
                ws.send(createMessage(MSG_TYPES.ERROR, {
                    code: res.errorCode || ERROR_CODES.INVALID_ACTION,
                    message: res.message
                }));
            }
            break;
        }

        case MSG_TYPES.HOST_SET_LOCAL_HOST: {
            const room = roomManager.getRoom(ws.roomCode);
            if (!room || !ws.isHost) return;
            room.setHostOnPC(Boolean(payload && payload.isHostOnPC));
            break;
        }

        case MSG_TYPES.HOST_UPDATE_ROOM_SETTINGS: {
            const room = roomManager.getRoom(ws.roomCode);
            if (!room || !ws.isHost) return;
            const newOpts = payload && (payload.settings || payload.options);
            room.updateOptions(newOpts);
            break;
        }

        case MSG_TYPES.HOST_SELECT_QUESTION: {
            const room = roomManager.getRoom(ws.roomCode);
            if (!room || !ws.isHost) return;
            room.selectQuestion(payload.themeIdx, payload.questionIdx, payload.question);
            break;
        }

        case MSG_TYPES.HOST_ACTIVATE_BUZZER: {
            const room = roomManager.getRoom(ws.roomCode);
            if (!room || !ws.isHost) return;
            room.activateBuzzer();
            break;
        }

        case MSG_TYPES.HOST_JUDGE_ANSWER: {
            const room = roomManager.getRoom(ws.roomCode);
            if (!room || !ws.isHost) return;
            room.judgeAnswer(payload.isCorrect);
            break;
        }

        case MSG_TYPES.HOST_SHOW_ANSWER: {
            const room = roomManager.getRoom(ws.roomCode);
            if (!room || !ws.isHost) return;
            room.showAnswer();
            break;
        }

        case MSG_TYPES.HOST_TOGGLE_PAUSE: {
            const room = roomManager.getRoom(ws.roomCode);
            if (!room || !ws.isHost) return;
            room.togglePause(payload && payload.isPaused);
            break;
        }

        case MSG_TYPES.HOST_CLOSE_QUESTION:
        case MSG_TYPES.HOST_PASS_QUESTION: {
            const room = roomManager.getRoom(ws.roomCode);
            if (!room || !ws.isHost) return;
            room.closeQuestion();
            break;
        }

        case MSG_TYPES.HOST_UPDATE_SCORE: {
            const room = roomManager.getRoom(ws.roomCode);
            if (!room || !ws.isHost) return;
            room.updatePlayerScore(payload.playerId, payload.delta);
            break;
        }

        // --- PLAYER / PARTICIPANT ACTIONS ---
        case MSG_TYPES.PLAYER_JOIN: {
            const room = roomManager.getRoom(payload.roomCode);
            if (!room) {
                ws.send(createMessage(MSG_TYPES.ERROR, {
                    code: ERROR_CODES.ROOM_NOT_FOUND,
                    message: 'Комната с таким кодом не найдена'
                }));
                return;
            }

            const requestedRole = payload.role === 'host' ? 'host' : 'player';
            const joinResult = room.addPlayer(payload.name, payload.avatar, ws, payload.sessionToken, requestedRole);
            if (!joinResult.success) {
                ws.send(createMessage(MSG_TYPES.ERROR, {
                    code: joinResult.error,
                    message: joinResult.message
                }));
                return;
            }

            ws.roomCode = room.code;
            ws.playerId = joinResult.player.id;
            ws.isHost = (joinResult.role === 'host');
            break;
        }

        case MSG_TYPES.PLAYER_BUZZ: {
            const room = roomManager.getRoom(ws.roomCode);
            if (!room || !ws.playerId) return;
            room.handleBuzz(ws.playerId);
            break;
        }

        case MSG_TYPES.PLAYER_SUBMIT_ANSWER: {
            const room = roomManager.getRoom(ws.roomCode);
            if (!room || !ws.playerId) return;
            room.handleAnswerSubmit(ws.playerId, payload.answerText);
            break;
        }

        case MSG_TYPES.PLAYER_AUCTION_BET: {
            const room = roomManager.getRoom(ws.roomCode);
            if (!room || !ws.playerId) return;
            room.handleAuctionBet(ws.playerId, payload.amount);
            break;
        }

        case MSG_TYPES.PLAYER_CAT_TRANSFER: {
            const room = roomManager.getRoom(ws.roomCode);
            if (!room || !ws.playerId) return;
            room.handleCatTransfer(ws.playerId, payload.targetPlayerId);
            break;
        }

        case MSG_TYPES.PING: {
            ws.send(createMessage(MSG_TYPES.PONG, { timestamp: Date.now() }));
            break;
        }

        default:
            console.warn('Unknown message type:', type);
            break;
    }
}

function handleClientDisconnect(ws) {
    if (ws.roomCode) {
        const room = roomManager.getRoom(ws.roomCode);
        if (room) {
            if (ws.playerId) {
                room.removePlayer(ws.playerId);
            }
            if (room.hostWs === ws) {
                room.hostWs = null;
                room.broadcastRoomState();
            }
        }
    }
}

// Heartbeat interval to check alive connections
const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);
if (heartbeatInterval.unref) heartbeatInterval.unref();

wss.on('close', () => {
    clearInterval(heartbeatInterval);
});

// Start Server if launched directly
if (require.main === module) {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Quiz U Server running at http://localhost:${PORT}/`);
        console.log(`Mobile Remote accessible at http://localhost:${PORT}/mobile/`);
    });
}

module.exports = { server, wss, roomManager };
