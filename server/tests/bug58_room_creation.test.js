const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const { server, wss, roomManager } = require('../src/server');
const { MSG_TYPES, ERROR_CODES, createMessage, parseMessage } = require('../src/protocol');

function nextMessage(ws, expectedTypes) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            ws.removeListener('message', onMessage);
            reject(new Error('Не получено ожидаемое сообщение: ' + expectedTypes.join(', ')));
        }, 2000);
        function onMessage(data) {
            const message = parseMessage(data);
            if (!message || !expectedTypes.includes(message.type)) return;
            clearTimeout(timeout);
            ws.removeListener('message', onMessage);
            resolve(message);
        }
        ws.on('message', onMessage);
    });
}

async function request(ws, type, payload, responseTypes) {
    const response = nextMessage(ws, responseTypes);
    ws.send(createMessage(type, payload));
    return response;
}

test('BUG-58: создание комнаты не удаляет комнату другого владельца', async (t) => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const sockets = [];
    const url = 'ws://127.0.0.1:' + server.address().port;
    async function connect() {
        const ws = new WebSocket(url);
        sockets.push(ws);
        await new Promise((resolve, reject) => {
            ws.once('open', resolve);
            ws.once('error', reject);
        });
        return ws;
    }
    t.after(async () => {
        for (const ws of sockets) ws.terminate();
        roomManager.destroy();
        await new Promise(resolve => wss.close(resolve));
        await new Promise(resolve => server.close(resolve));
    });

    for (const role of ['player', 'host']) {
        await t.test('роль ' + role + ' не может заменить общую комнату', async () => {
            const owner = await connect();
            const created = await request(owner, MSG_TYPES.HOST_CREATE_ROOM, {}, [MSG_TYPES.ROOM_CREATED]);
            const code = created.payload.roomCode;
            const original = roomManager.getRoom(code);
            const participant = await connect();
            const joined = await request(participant, MSG_TYPES.PLAYER_JOIN,
                { roomCode: code, name: 'Участник', role }, [MSG_TYPES.ROOM_STATE]);
            const result = await request(participant, MSG_TYPES.HOST_CREATE_ROOM, {},
                [MSG_TYPES.ERROR, MSG_TYPES.ROOM_CREATED]);
            assert.equal(result.type, MSG_TYPES.ERROR);
            assert.equal(result.payload.code, ERROR_CODES.NOT_AUTHORIZED);
            assert.equal(roomManager.getRoom(code), original);
            assert.equal(original.hostWs.readyState, WebSocket.OPEN);
            assert.equal(roomManager.rooms.size, sockets.length / 2);
            const participantId = joined.payload.self.id;
            if (role === 'host') assert.equal(original.hostPlayer.id, participantId);
            else assert.ok(original.players.has(participantId));
        });
    }

    await t.test('владелец экрана может заменить собственную комнату', async () => {
        const owner = await connect();
        const first = await request(owner, MSG_TYPES.HOST_CREATE_ROOM, {}, [MSG_TYPES.ROOM_CREATED]);
        const firstCode = first.payload.roomCode;
        const oldRoom = roomManager.getRoom(firstCode);
        const second = await request(owner, MSG_TYPES.HOST_CREATE_ROOM, {}, [MSG_TYPES.ROOM_CREATED]);
        if (second.payload.roomCode !== firstCode) assert.equal(roomManager.getRoom(firstCode), null);
        const replacement = roomManager.getRoom(second.payload.roomCode);
        assert.notEqual(replacement, oldRoom);
        assert.equal(replacement.hostWs, [...wss.clients].find(ws => ws.roomCode === replacement.code));
        assert.equal(replacement.players.size, 0);
    });
});
