/**
 * Quiz U - Authoritative Multiplayer Game Room Server
 * Node.js WebSocket + HTTP Server
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const RoomManager = require('./RoomManager');
const { MSG_TYPES, ERROR_CODES, createMessage, parseMessage } = require('./protocol');

const PORT = process.env.PORT || 8080;
const ROOT_DIR = path.resolve(__dirname, '../../');

const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.js': 'application/javascript; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.woff2': 'font/woff2'
};

const roomManager = new RoomManager();

// HTTP Static Files & Health Check Server
const server = http.createServer((req, res) => {
    // CORS headers for local LAN play
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // Health check endpoint
    if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', time: Date.now() }));
        return;
    }

    // Room Server Stats
    if (url.pathname === '/api/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(roomManager.getStats()));
        return;
    }

    // Static files hosting for host and mobile clients
    let reqPath;
    try {
        reqPath = decodeURIComponent(url.pathname);
    } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('Bad Request');
        return;
    }

    if (reqPath === '/' || reqPath === '/mobile' || reqPath === '/mobile/') {
        reqPath = reqPath.startsWith('/mobile') ? '/mobile/index.html' : '/index.html';
    }

    // Normalize safe file path relative to ROOT_DIR
    const filePath = path.resolve(ROOT_DIR, '.' + reqPath);
    const rel = path.relative(ROOT_DIR, filePath);

    // Prevent directory traversal attacks
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
            res.end('File Not Found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
    });
});

// WebSocket Server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.roomCode = null;
    ws.playerId = null;
    ws.isHost = false;

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', (data) => {
        const message = parseMessage(data);
        if (!message) {
            ws.send(createMessage(MSG_TYPES.ERROR, {
                code: ERROR_CODES.INVALID_PAYLOAD,
                message: 'Некорректный JSON формат сообщения'
            }));
            return;
        }

        handleClientMessage(ws, message);
    });

    ws.on('close', () => {
        if (ws.roomCode) {
            const room = roomManager.getRoom(ws.roomCode);
            if (room) {
                if (ws.playerId) {
                    room.removePlayer(ws.playerId);
                } else if (ws.isHost) {
                    // Host screen disconnected; keep room for a while for reconnection
                    room.touch();
                }
            }
        }
    });

    ws.on('error', (err) => {
        console.error('WebSocket connection error:', err.message);
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
                    code: ERROR_CODES.INVALID_ACTION,
                    message: res.message
                }));
            }
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

            const isHostClient = ws.isHost;
            // Send initial state to the joined client (for host: full question; for player: answers stripped)
            ws.send(createMessage(MSG_TYPES.ROOM_STATE, {
                ...room.getStateSnapshot(!isHostClient),
                self: isHostClient ? room.sanitizeHost(joinResult.player) : room.sanitizePlayer(joinResult.player),
                sessionToken: joinResult.player.sessionToken,
                role: joinResult.role || 'player'
            }));
            break;
        }

        case MSG_TYPES.PLAYER_BUZZ: {
            const room = roomManager.getRoom(ws.roomCode);
            if (!room || !ws.playerId) {
                ws.send(createMessage(MSG_TYPES.ERROR, {
                    code: ERROR_CODES.INVALID_ACTION,
                    message: 'Вы не находитесь в комнате'
                }));
                return;
            }

            const res = room.handleBuzz(ws.playerId);
            if (!res.success) {
                ws.send(createMessage(MSG_TYPES.ERROR, {
                    code: res.error,
                    message: res.message
                }));
            }
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

        // --- SYSTEM ---
        case MSG_TYPES.PING: {
            ws.send(createMessage(MSG_TYPES.PONG, { time: Date.now() }));
            break;
        }
    }
}

// Heartbeat interval to check alive connections
const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
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

// Start Server if run directly
if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`Quiz U Server running at http://localhost:${PORT}`);
        console.log(`Mobile buzzer controller available at http://localhost:${PORT}/mobile/`);
    });

    const shutdown = () => {
        console.log('\nShutting down server gracefully...');
        clearInterval(heartbeatInterval);
        roomManager.destroy();
        wss.close(() => {
            server.close(() => {
                process.exit(0);
            });
        });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

module.exports = { server, wss, roomManager };
