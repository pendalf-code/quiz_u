const test = require('node:test');
const assert = require('node:assert/strict');
const Room = require('../src/Room');
const { MSG_TYPES } = require('../src/protocol');

function setup(t, type = 'normal') {
    const clock = { now: 100000 };
    t.mock.method(Date, 'now', () => clock.now);
    const socket = () => ({ readyState: 1, messages: [], send(raw) { this.messages.push(JSON.parse(raw)); } });
    const host = socket();
    const room = new Room('D60', host, { readingTime: 0, thinkingTime: 30, answerTime: 5 });
    const first = room.addPlayer('Первый', '', socket()).player;
    const second = room.addPlayer('Второй', '', socket()).player;
    first.score = second.score = 1000;
    room.setPack([{ roundName: type === 'final' ? 'ФИНАЛ' : 'Раунд 1',
        themes: [{ name: 'Тема', questions: [{ q: 'Вопрос?', a: 'Ответ', cost: 100, type }] }] }]);
    room.startGame();
    room.selectQuestion(0, 0);
    t.after(() => room.destroy());
    return { room, host, first, second, clock };
}

function submitted(host) {
    return host.messages.filter(message => message.type === MSG_TYPES.ANSWER_SUBMITTED);
}

test('BUG-60: просроченный баззер отклоняется до callback таймера', t => {
    const { room, first, host, clock } = setup(t);
    clock.now += 30000;
    assert.equal(room.handleBuzz(first.id).success, false);
    assert.equal(room.activeBuzzerPlayerId, null);
    assert.equal(host.messages.some(message => message.type === MSG_TYPES.BUZZ_LOCKED), false);
    assert.notEqual(room.stateMachine.state, 'BUZZ_ACTIVE');
});

test('BUG-60: баззер за миллисекунду до дедлайна принимается', t => {
    const { room, first, clock } = setup(t);
    clock.now += 29999;
    assert.equal(room.handleBuzz(first.id).success, true);
});

test('BUG-60: личный ответ на границе дедлайна не передаётся ведущему', t => {
    const { room, first, host, clock } = setup(t);
    room.handleBuzz(first.id);
    clock.now += 5000;
    assert.equal(room.handleAnswerSubmit(first.id, 'Поздний ответ').success, false);
    assert.equal(submitted(host).length, 0);
    assert.equal(room.activeBuzzerPlayerId, null);
});

test('BUG-60: личный ответ за миллисекунду до дедлайна принимается', t => {
    const { room, first, host, clock } = setup(t);
    room.handleBuzz(first.id);
    clock.now += 4999;
    assert.equal(room.handleAnswerSubmit(first.id, 'Вовремя').success, true);
    assert.equal(submitted(host).length, 1);
});

for (const type of ['auction', 'final']) {
    test('BUG-60: дедлайн текстового ответа ' + type + ' проверяется до callback', t => {
        const { room, first, second, host, clock } = setup(t, type);
        room.handleAuctionBet(first.id, 100);
        room.handleAuctionBet(second.id, 100);
        assert.equal(room.startAuctionAnswer().success, true);
        clock.now += (type === 'final' ? 60 : 30) * 1000;
        assert.equal(room.handleAnswerSubmit(first.id, 'Поздно').success, false);
        assert.equal(room.auctionAnswers.has(first.id), false);
        assert.equal(submitted(host).length, 0);
        assert.equal(room.auctionAnswersLocked, true);
    });

    test('BUG-60: ответ ' + type + ' за миллисекунду до дедлайна принимается', t => {
        const { room, first, second, clock } = setup(t, type);
        room.handleAuctionBet(first.id, 100);
        room.handleAuctionBet(second.id, 100);
        room.startAuctionAnswer();
        clock.now += (type === 'final' ? 60 : 30) * 1000 - 1;
        assert.equal(room.handleAnswerSubmit(first.id, 'Вовремя').success, true);
    });
}

test('BUG-60: пауза не расходует остаток баззера после возобновления', t => {
    const { room, first, clock } = setup(t);
    clock.now += 5000;
    room.setPaused(true);
    clock.now += 120000;
    room.setPaused(false);
    clock.now += 24999;
    assert.equal(room.handleBuzz(first.id).success, true);
});

test('BUG-60: личный дедлайн после паузы ограничен оставшимся временем', t => {
    const { room, first, host, clock } = setup(t);
    room.handleBuzz(first.id);
    clock.now += 1000;
    room.setPaused(true);
    clock.now += 120000;
    room.setPaused(false);
    clock.now += 4000;
    assert.equal(room.handleAnswerSubmit(first.id, 'Поздно после паузы').success, false);
    assert.equal(submitted(host).length, 0);
});

test('BUG-60: аукционный дедлайн после паузы использует остаток', t => {
    const { room, first, second, clock } = setup(t, 'auction');
    room.handleAuctionBet(first.id, 100);
    room.handleAuctionBet(second.id, 100);
    room.startAuctionAnswer();
    clock.now += 2000;
    room.setPaused(true);
    clock.now += 120000;
    room.setPaused(false);
    clock.now += 27999;
    assert.equal(room.handleAnswerSubmit(first.id, 'Вовремя после паузы').success, true);
    clock.now += 1;
    assert.equal(room.handleAnswerSubmit(second.id, 'Уже поздно').success, false);
});

test('BUG-60: округлённое окно переоткрытого баззера совпадает с серверным дедлайном', t => {
    const { room, first, second, clock } = setup(t);
    clock.now += 420;
    room.handleBuzz(first.id);
    room.judgeAnswer(false, false);
    assert.equal(room.remainingThinkingTime, 30);
    clock.now += 29999;
    assert.equal(room.handleBuzz(second.id).success, true);
});
