const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const { server, wss, roomManager } = require('../src/server');
const { MSG_TYPES: MSG, createMessage, parseMessage } = require('../src/protocol');

function pack() {
    return [0, 1].map(round => ({
        roundName: 'Раунд ' + (round + 1),
        themes: [{ name: 'Тема ' + (round + 1), questions: [100, 200].map(cost => ({
            q: 'Вопрос за ' + cost + '?', a: 'Ответ', cost
        })) }]
    }));
}

function nextMessage(ws, type, predicate = () => true) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            ws.removeListener('message', onMessage);
            reject(new Error('Не получено ожидаемое событие ' + type));
        }, 3000);
        function onMessage(raw) {
            const message = parseMessage(raw);
            if (!message || message.type !== type || !predicate(message.payload)) return;
            clearTimeout(timer);
            ws.removeListener('message', onMessage);
            resolve(message.payload);
        }
        ws.on('message', onMessage);
    });
}

async function request(ws, type, payload, responseType, predicate) {
    const response = nextMessage(ws, responseType, predicate);
    ws.send(createMessage(type, payload));
    return response;
}

test('BUG-55: ПК и веб-пульт повторно запускают ту же комнату из другого раунда', async t => {
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

    const pc = await connect();
    const created = await request(pc, MSG.HOST_CREATE_ROOM,
        { options: { readingTime: 0, thinkingTime: 30, isHostOnPC: false, requireMobileHost: true } }, MSG.ROOM_CREATED);
    const code = created.roomCode;
    const remote = await connect();
    await request(remote, MSG.PLAYER_JOIN, { roomCode: code, name: 'Ведущий', role: 'host' },
        MSG.ROOM_STATE, state => state.role === 'host');
    const player = await connect();
    const joined = await request(player, MSG.PLAYER_JOIN, { roomCode: code, name: 'Игрок' },
        MSG.ROOM_STATE, state => state.role === 'player');
    const playerId = joined.self.id;
    const room = roomManager.getRoom(code);

    async function stateCommand(actor, type, payload, state, roundIndex) {
        const predicate = snapshot => snapshot.state === state && snapshot.currentRoundIndex === roundIndex;
        const replies = [pc, remote, player].map(ws => nextMessage(ws, MSG.ROOM_STATE, predicate));
        actor.send(createMessage(type, payload));
        const snapshots = await Promise.all(replies);
        assert.deepEqual(snapshots[0].board, snapshots[1].board, 'сетка ПК и пульта совпадает');
        return snapshots;
    }
    async function consumeQuestion(roundIndex) {
        await request(remote, MSG.HOST_SELECT_QUESTION, { themeIdx: 0, questionIdx: 0 }, MSG.QUESTION_ACTIVE);
        const snapshots = await stateCommand(remote, MSG.HOST_CLOSE_QUESTION, {}, 'BOARD', roundIndex);
        assert.equal(snapshots[0].board.themes[0].questions[0].used, true);
    }
    function allUsedFlags() {
        return room.currentPack.flatMap(round => round.themes.flatMap(theme => theme.questions.map(q => q.used)));
    }

    await request(pc, MSG.HOST_SET_PACK, { pack: pack() }, MSG.ROOM_STATE, snapshot => Boolean(snapshot.board));
    await stateCommand(pc, MSG.HOST_START_GAME, {}, 'BOARD', 0);

    for (const [label, actor] of [['ПК', pc], ['веб-пульт', remote]]) {
        for (const reload of [false, true]) {
            await t.test(label + ': повторный старт ' + (reload ? 'с перезагрузкой пака' : 'без перезагрузки пака'), async () => {
                await consumeQuestion(0);
                const duplicateStart = await stateCommand(actor, MSG.HOST_START_GAME, {}, 'BOARD', 0);
                assert.equal(duplicateStart[0].board.themes[0].questions[0].used, true,
                    'повторный startGame в текущей игре не сбрасывает использованную ячейку');
                await stateCommand(remote, MSG.HOST_NEXT_ROUND, {}, 'BOARD', 1);
                await consumeQuestion(1);
                assert.equal(allUsedFlags().filter(Boolean).length, 2);
                await request(pc, MSG.HOST_UPDATE_SCORE, { playerId, delta: 300 }, MSG.SCORE_UPDATED,
                    score => score.playerId === playerId && score.newScore === 300);

                const lobby = await stateCommand(actor, MSG.HOST_RESET_TO_LOBBY, {}, 'LOBBY', 0);
                assert.ok(allUsedFlags().every(used => used === false));
                for (const snapshot of lobby) assert.equal(snapshot.players.find(p => p.id === playerId).score, 0);
                if (reload) await request(pc, MSG.HOST_SET_PACK, { pack: pack() }, MSG.ROOM_STATE,
                    snapshot => snapshot.state === 'LOBBY' && Boolean(snapshot.board));
                const restarted = await stateCommand(actor, MSG.HOST_START_GAME, {}, 'BOARD', 0);
                assert.equal(room.code, code);
                assert.equal(restarted[0].board.roundIndex, 0);
                assert.ok(restarted[0].board.themes[0].questions.every(q => q.used === false));
                assert.ok(allUsedFlags().every(used => used === false));
                for (const snapshot of restarted) {
                    assert.equal(snapshot.roomCode, code);
                    assert.equal(snapshot.players.find(p => p.id === playerId).score, 0);
                }
            });
        }
    }
});
