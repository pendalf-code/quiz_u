const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const Room = require('../src/Room');
const { server, wss, roomManager } = require('../src/server');
const { MSG_TYPES: MSG, ERROR_CODES, createMessage, parseMessage } = require('../src/protocol');

function validPack() {
    return [{ roundName: 'Раунд', themes: [{ name: 'Тема', questions: [{ q: 'Вопрос?', a: 'Ответ', cost: 100 }] }] }];
}

function socket() {
    return { readyState: 1, messages: [], send(raw) { this.messages.push(parseMessage(raw)); } };
}

test('BUG-66: Room отклоняет неверный пак до изменения состояния и рассылки', t => {
    const host = socket();
    const room = new Room('B66', host);
    t.after(() => room.destroy());
    const pack = validPack();
    room.setPack(pack);
    const snapshot = room.getStateSnapshot(false);
    const count = host.messages.length;
    for (const invalid of [[null], [{ themes: [null] }], [{ themes: [{ questions: [] }] }], [], null]) {
        assert.throws(() => room.setPack(invalid), error => error.code === ERROR_CODES.INVALID_PAYLOAD);
        assert.equal(room.currentPack, pack);
        assert.deepEqual(room.getStateSnapshot(false), snapshot);
        assert.equal(host.messages.length, count);
    }
});

test('BUG-66: Room принимает поддерживаемую обёртку валидного пака', t => {
    const room = new Room('B66V', socket());
    t.after(() => room.destroy());
    const rounds = validPack();
    assert.equal(room.setPack({ rounds: { value: rounds } }), rounds);
    assert.equal(room.currentPack, rounds);
});

function request(ws, type, payload, expected) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            ws.off('message', onMessage);
            reject(new Error('Не получен ответ ' + expected.join(', ')));
        }, 2000);
        function onMessage(raw) {
            const message = parseMessage(raw);
            if (!message || !expected.includes(message.type)) return;
            clearTimeout(timer);
            ws.off('message', onMessage);
            resolve(message);
        }
        ws.on('message', onMessage);
        ws.send(createMessage(type, payload));
    });
}

test('BUG-66: WS возвращает INVALID_PAYLOAD и сохраняет рабочий пак', async t => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const ws = new WebSocket('ws://127.0.0.1:' + server.address().port);
    t.after(async () => {
        ws.terminate();
        roomManager.destroy();
        await new Promise(resolve => wss.close(resolve));
        await new Promise(resolve => server.close(resolve));
    });
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    const created = await request(ws, MSG.HOST_CREATE_ROOM, {}, [MSG.ROOM_CREATED]);
    const room = roomManager.getRoom(created.payload.roomCode);
    await request(ws, MSG.HOST_SET_PACK, { pack: validPack() }, [MSG.ROOM_STATE]);
    const original = room.currentPack;
    for (const invalid of [[null], { rounds: [{ themes: [null] }] }, [], { themes: [{ questions: [{ q: 'Q', a: 'A', cost: 0 }] }] }]) {
        const result = await request(ws, MSG.HOST_SET_PACK, { pack: invalid }, [MSG.ERROR, MSG.ROOM_STATE]);
        assert.equal(result.type, MSG.ERROR);
        assert.equal(result.payload.code, ERROR_CODES.INVALID_PAYLOAD);
        assert.match(result.payload.message, /Некорректный пак/);
        assert.equal(room.currentPack, original);
    }
    const accepted = await request(ws, MSG.HOST_SET_PACK, { pack: validPack() }, [MSG.ROOM_STATE]);
    assert.equal(accepted.payload.board.themes[0].name, 'Тема');
});
