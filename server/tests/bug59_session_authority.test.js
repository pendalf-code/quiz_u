const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const { server, wss, roomManager } = require('../src/server');
const { MSG_TYPES: MSG, ERROR_CODES, createMessage, parseMessage } = require('../src/protocol');

function response(ws, types) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            ws.off('message', onMessage);
            reject(new Error('Не получено сообщение: ' + types.join(', ')));
        }, 2000);
        function onMessage(raw) {
            const msg = parseMessage(raw);
            if (!msg || !types.includes(msg.type)) return;
            clearTimeout(timer);
            ws.off('message', onMessage);
            resolve(msg);
        }
        ws.on('message', onMessage);
    });
}

async function request(ws, type, payload, types) {
    const pending = response(ws, types);
    ws.send(createMessage(type, payload));
    return pending;
}

test('BUG-59: команды принимает только текущий сокет участника', async t => {
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
    async function createRoom() {
        const owner = await connect();
        const created = await request(owner, MSG.HOST_CREATE_ROOM, {}, [MSG.ROOM_CREATED]);
        return { owner, room: roomManager.getRoom(created.payload.roomCode) };
    }
    async function join(room, name, role = 'player', token = null) {
        const ws = await connect();
        const joined = await request(ws, MSG.PLAYER_JOIN,
            { roomCode: room.code, name, role, sessionToken: token }, [MSG.ROOM_STATE]);
        const member = role === 'host' ? room.hostPlayer : room.players.get(joined.payload.self.id);
        return { ws, member, token: joined.payload.sessionToken, id: joined.payload.self.id };
    }
    t.after(async () => {
        for (const ws of sockets) ws.terminate();
        roomManager.destroy();
        await new Promise(resolve => wss.close(resolve));
        await new Promise(resolve => server.close(resolve));
    });

    await t.test('реконнект ведущего отзывает полномочия старого сокета', async () => {
        const { room } = await createRoom();
        const player = await join(room, 'Игрок');
        const old = await join(room, 'Ведущий', 'host');
        const staleSocket = room.hostPlayer.ws;
        const current = await join(room, 'Ведущий', 'host', old.token);
        staleSocket.emit('message', Buffer.from(createMessage(MSG.HOST_UPDATE_SCORE,
            { playerId: player.id, delta: 999 })));
        assert.equal(room.players.get(player.id).score, 0);
        assert.equal(staleSocket.isHost, false);
        assert.equal(staleSocket.playerId, null);
        assert.equal(staleSocket.roomCode, null);
        assert.notEqual(staleSocket.readyState, WebSocket.OPEN);
        await request(current.ws, MSG.HOST_UPDATE_SCORE, { playerId: player.id, delta: 100 }, [MSG.SCORE_UPDATED]);
        assert.equal(room.players.get(player.id).score, 100);
        assert.equal(room.hostPlayer.isConnected, true);
    });

    await t.test('кик ведущего отзывает команды до отложенного закрытия', async () => {
        const { room } = await createRoom();
        const player = await join(room, 'Игрок');
        const host = await join(room, 'Ведущий', 'host');
        const staleSocket = room.hostPlayer.ws;
        room.removePlayer(host.id);
        staleSocket.emit('message', Buffer.from(createMessage(MSG.HOST_UPDATE_SCORE,
            { playerId: player.id, delta: 777 })));
        assert.equal(room.players.get(player.id).score, 0);
        assert.equal(staleSocket.isHost, false);
        assert.equal(staleSocket.roomCode, null);
        const roomsBefore = roomManager.rooms.size;
        staleSocket.emit('message', Buffer.from(createMessage(MSG.HOST_CREATE_ROOM)));
        assert.equal(roomManager.rooms.size, roomsBefore);
    });

    await t.test('реконнект игрока отзывает баззер старого сокета', async () => {
        const { room } = await createRoom();
        room.updateOptions({ readingTime: 0 });
        const old = await join(room, 'Игрок');
        const staleSocket = old.member.ws;
        const current = await join(room, 'Игрок', 'player', old.token);
        room.startGame();
        room.selectQuestion(0, 0, { q: 'Вопрос?', a: 'Ответ', cost: 100 });
        staleSocket.emit('message', Buffer.from(createMessage(MSG.PLAYER_BUZZ)));
        assert.equal(room.activeBuzzerPlayerId, null);
        assert.equal(staleSocket.playerId, null);
        assert.notEqual(staleSocket.readyState, WebSocket.OPEN);
        await request(current.ws, MSG.PLAYER_BUZZ, {}, [MSG.BUZZ_LOCKED]);
        assert.equal(room.activeBuzzerPlayerId, current.id);
        assert.equal(room.players.get(current.id).isConnected, true);
        room.finishGame();
    });

    await t.test('кик игрока сразу отзывает его баззер', async () => {
        const { room } = await createRoom();
        room.updateOptions({ readingTime: 0 });
        const player = await join(room, 'Первый');
        await join(room, 'Второй');
        const staleSocket = player.member.ws;
        room.startGame();
        room.selectQuestion(0, 0, { q: 'Вопрос?', a: 'Ответ', cost: 100 });
        room.removePlayer(player.id);
        staleSocket.emit('message', Buffer.from(createMessage(MSG.PLAYER_BUZZ)));
        assert.equal(room.activeBuzzerPlayerId, null);
        assert.equal(staleSocket.playerId, null);
        room.finishGame();
    });

    await t.test('ПК-владелец не может перепривязаться к роли игрока', async () => {
        const { owner, room } = await createRoom();
        const another = await createRoom();
        const reply = await request(owner, MSG.PLAYER_JOIN,
            { roomCode: another.room.code, name: 'Подмена' }, [MSG.ROOM_STATE, MSG.ERROR]);
        assert.equal(reply.type, MSG.ERROR);
        assert.equal(reply.payload.code, ERROR_CODES.NOT_AUTHORIZED);
        assert.equal(room.hostWs.roomCode, room.code);
        assert.equal(another.room.players.size, 0);
    });

    await t.test('участник не оставляет призрака сменой имени на том же сокете', async () => {
        const { room } = await createRoom();
        const player = await join(room, 'Первый');
        const reply = await request(player.ws, MSG.PLAYER_JOIN,
            { roomCode: room.code, name: 'Второй' }, [MSG.ROOM_STATE, MSG.ERROR]);
        assert.equal(reply.type, MSG.ERROR);
        assert.equal(reply.payload.code, ERROR_CODES.NOT_AUTHORIZED);
        assert.equal(room.players.size, 1);
        assert.equal(room.players.get(player.id).isConnected, true);
    });
});
