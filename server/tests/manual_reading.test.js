const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const { server, roomManager } = require('../src/server');
const { createMessage, parseMessage, MSG_TYPES: MSG } = require('../src/protocol');

test('TASK-85: ручной запуск доступен только действующему ведущему и только для открытого вопроса', async (t) => {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(async () => {
        for (const ws of sockets) ws.terminate();
        if (room) roomManager.deleteRoom(room.code);
        await new Promise(resolve => server.close(resolve));
    });

    const sockets = [];
    let room;
    const open = async () => {
        const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}`);
        sockets.push(ws);
        await once(ws, 'open');
        return ws;
    };
    const send = (ws, type, payload = {}) => ws.send(createMessage(type, payload));
    const receive = (ws, type, predicate = () => true) => new Promise((resolve, reject) => {
        const onMessage = raw => {
            const message = parseMessage(raw);
            if (message?.type !== type || !predicate(message.payload)) return;
            clearTimeout(timeout);
            ws.off('message', onMessage);
            resolve(message.payload);
        };
        const timeout = setTimeout(() => {
            ws.off('message', onMessage);
            reject(new Error('Не получено сообщение ' + type));
        }, 2000);
        ws.on('message', onMessage);
    });
    const flush = async ws => {
        const pong = once(ws, 'pong');
        ws.ping();
        await pong;
    };
    const request = async (ws, type, payload, expected, predicate) => {
        const response = receive(ws, expected, predicate);
        send(ws, type, payload);
        return response;
    };

    const pc = await open();
    const created = await request(pc, MSG.HOST_CREATE_ROOM, {
        options: { isHostOnPC: true, readingTime: 1, thinkingTime: 20 }
    }, MSG.ROOM_CREATED);
    room = roomManager.getRoom(created.roomCode);
    const questions = [
        { q: 'Первый?', a: 'Ответ', cost: 100 },
        { q: 'Медиа?', a: 'Ответ', cost: 200, audio: 'question.mp3' },
        { q: 'Кот?', a: 'Ответ', cost: 300, type: 'cat' },
        { q: 'Фиксированный таймер?', a: 'Ответ', cost: 400 }
    ];
    room.setPack([{ themes: [{ name: 'Тема', questions }] }]);

    const player = await open();
    const joined = await request(player, MSG.PLAYER_JOIN, { roomCode: room.code, name: 'Игрок' }, MSG.ROOM_STATE);
    await request(pc, MSG.HOST_UPDATE_ROOM_SETTINGS, { settings: { readingMode: 'manual' } }, MSG.ROOM_SETTINGS_UPDATED);
    await request(pc, MSG.HOST_START_GAME, {}, MSG.ROOM_STATE, payload => payload.state === 'BOARD');
    const select = (ws, questionIdx) => request(ws, MSG.HOST_SELECT_QUESTION,
        { themeIdx: 0, questionIdx }, MSG.QUESTION_ACTIVE);
    const start = (ws, manualReadingId) => send(ws, MSG.HOST_START_THINKING, { manualReadingId });

    const playerQuestion = receive(player, MSG.QUESTION_ACTIVE);
    const first = await select(pc, 0);
    const sanitized = await playerQuestion;
    assert.equal(room.readingTimer, null);
    assert.equal(room.thinkingTimer, null);
    assert.equal(room.stateMachine.state, 'QUESTION_READING');
    assert.equal(typeof first.manualReadingId, 'string');
    assert.equal(sanitized.manualReadingId, undefined);
    await request(player, MSG.HOST_START_THINKING, first, MSG.ERROR, payload => payload.code === 'NOT_AUTHORIZED');
    await request(player, MSG.PLAYER_BUZZ, {}, MSG.ERROR);
    send(pc, MSG.HOST_ACTIVATE_BUZZER);
    await flush(pc);
    assert.equal(room.thinkingTimer, null);

    await request(pc, MSG.HOST_TOGGLE_PAUSE, { isPaused: true }, MSG.GAME_PAUSED);
    start(pc, first.manualReadingId);
    await flush(pc);
    assert.equal(room.thinkingTimer, null);
    await request(pc, MSG.HOST_TOGGLE_PAUSE, { isPaused: false }, MSG.GAME_PAUSED);
    assert.equal(room.readingTimer, null);

    const opened = await request(pc, MSG.HOST_START_THINKING, first, MSG.BUZZER_READY);
    assert.equal(opened.thinkingTime, 20);
    assert.deepEqual(opened.allowedPlayerIds, [joined.self.id]);
    const timer = room.thinkingTimer;
    start(pc, first.manualReadingId);
    await flush(pc);
    assert.equal(room.thinkingTimer, timer);
    await request(pc, MSG.HOST_CLOSE_QUESTION, {}, MSG.QUESTION_CLOSED);

    const phone = await open();
    const host = await request(phone, MSG.PLAYER_JOIN, { roomCode: room.code, role: 'host', name: 'Ведущий' }, MSG.ROOM_STATE);
    const media = await select(phone, 1);
    start(phone, first.manualReadingId);
    start(pc, media.manualReadingId);
    send(pc, MSG.HOST_ACTIVATE_BUZZER);
    await flush(phone);
    await flush(pc);
    assert.equal(room.thinkingTimer, null);

    const reconnected = await open();
    const restored = await request(reconnected, MSG.PLAYER_JOIN, {
        roomCode: room.code, role: 'host', name: 'Ведущий', sessionToken: host.sessionToken
    }, MSG.ROOM_STATE);
    assert.equal(restored.state, 'QUESTION_READING');
    assert.equal(restored.manualReadingId, media.manualReadingId);
    await request(reconnected, MSG.HOST_START_THINKING, restored, MSG.BUZZER_READY);
    await request(reconnected, MSG.HOST_CLOSE_QUESTION, {}, MSG.QUESTION_CLOSED);

    const cat = await select(reconnected, 2);
    start(reconnected, cat.manualReadingId);
    await flush(reconnected);
    assert.equal(room.stateMachine.state, 'CAT_CHOOSING');
    assert.equal(room.thinkingTimer, null);
    await request(reconnected, MSG.HOST_SET_CAT_TARGET, { targetPlayerId: joined.self.id }, MSG.CAT_TRANSFERRED);
    assert.equal(room.stateMachine.state, 'QUESTION_READING');
    assert.equal(room.readingTimer, null);
    const restricted = await request(reconnected, MSG.HOST_START_THINKING, cat, MSG.BUZZER_READY);
    assert.deepEqual(restricted.allowedPlayerIds, [joined.self.id]);
    await request(reconnected, MSG.HOST_CLOSE_QUESTION, {}, MSG.QUESTION_CLOSED);

    await request(pc, MSG.HOST_UPDATE_ROOM_SETTINGS, { settings: { readingMode: 'fixed' } }, MSG.ROOM_SETTINGS_UPDATED);
    const fixed = await select(reconnected, 3);
    assert.equal(fixed.manualReadingId, undefined);
    assert.ok(room.readingTimer);
    assert.equal(room.thinkingTimer, null);
    assert.equal((await receive(reconnected, MSG.BUZZER_READY)).thinkingTime, 20);
});
