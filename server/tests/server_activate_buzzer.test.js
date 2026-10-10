const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const { server, roomManager } = require('../src/server');
const { MSG_TYPES, parseMessage } = require('../src/protocol');

test('Server: duplicate HOST_ACTIVATE_BUZZER from the PC screen does not break a running buzz race', async (t) => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `ws://127.0.0.1:${server.address().port}`;
    const open = () => new Promise((resolve) => {
        const ws = new WebSocket(url);
        ws.inbox = [];
        ws.on('message', (d) => ws.inbox.push(parseMessage(d)));
        ws.on('open', () => resolve(ws));
    });
    const send = (ws, type, payload = {}) => ws.send(JSON.stringify({ type, payload }));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    const pc = await open();
    send(pc, MSG_TYPES.HOST_CREATE_ROOM, { options: { readingTime: 0, thinkingTime: 30, answerTime: 5 } });
    await wait(100);
    const roomCode = pc.inbox.find((m) => m.type === MSG_TYPES.ROOM_CREATED).payload.roomCode;
    const room = roomManager.getRoom(roomCode);
    room.setPack([{ themes: [{ name: 'T', questions: [{ cost: 100, q: 'Q', a: 'A' }] }] }]);

    const player = await open();
    send(player, MSG_TYPES.PLAYER_JOIN, { roomCode, name: 'Алиса', avatar: '🦊' });
    await wait(100);
    send(pc, MSG_TYPES.HOST_START_GAME);
    send(pc, MSG_TYPES.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 0 });
    await wait(100);
    send(player, MSG_TYPES.PLAYER_BUZZ);
    await wait(100);
    assert.equal(room.stateMachine.state, 'ANSWERING');

    send(pc, MSG_TYPES.HOST_ACTIVATE_BUZZER, {}); // late duplicate
    await wait(100);
    assert.equal(room.stateMachine.state, 'ANSWERING', 'buzz race must stay intact');
    assert.ok(room.activeBuzzerPlayerId);

    pc.close();
    player.close();
    room.destroy();
    await new Promise((resolve) => server.close(resolve));
});
