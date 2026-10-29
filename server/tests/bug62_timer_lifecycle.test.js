const test = require('node:test');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const Room = require('../src/Room');

function socket() {
    return { readyState: 1, messages: [], send(raw) { this.messages.push(JSON.parse(raw)); } };
}

function setup(t, options = {}) {
    const host = socket();
    const room = new Room('B62', host, { readingTime: 0, thinkingTime: 30, answerTime: 0.03, ...options });
    const first = room.addPlayer('Первый', '', socket()).player;
    room.addPlayer('Второй', '', socket());
    room.startGame();
    room.selectQuestion(0, 0, { q: 'Первый вопрос?', a: 'Ответ', cost: 100 });
    t.after(() => {
        for (const key of ['readingTimer', 'thinkingTimer', 'answerTimer']) clearTimeout(room[key]);
        room.destroy();
    });
    return { room, host, first };
}

test('BUG-62: реальный таймер ответа не оживляет завершённую игру', async t => {
    const { room, host, first } = setup(t);
    room.handleBuzz(first.id);
    room.finishGame();
    const count = host.messages.length;
    await delay(90);
    assert.equal(room.stateMachine.state, 'GAME_OVER');
    assert.equal(host.messages.length, count);
    for (const key of ['readingTimer', 'thinkingTimer', 'answerTimer']) assert.equal(room[key], null);
    assert.equal(room.remainingAnswerTime, 0);
    assert.equal(room.remainingThinkingTime, 0);
});

test('BUG-62: destroy останавливает реальный таймер размышления', async t => {
    const { room, host } = setup(t, { thinkingTime: 1 });
    room.destroy();
    const state = room.stateMachine.state;
    const count = host.messages.length;
    await delay(1100);
    assert.equal(room.stateMachine.state, state);
    assert.equal(host.messages.length, count);
    assert.equal(room.thinkingTimer, null);
});

test('BUG-62: callback чтения прежнего вопроса не меняет новый вопрос', t => {
    const { room, host } = setup(t, { readingTime: 30 });
    const stale = room.readingTimer._onTimeout;
    room.selectQuestion(0, 1, { q: 'Новый вопрос?', a: 'Новый ответ', cost: 200 });
    const timer = room.readingTimer;
    const count = host.messages.length;
    stale();
    assert.equal(room.stateMachine.state, 'QUESTION_READING');
    assert.equal(room.readingTimer, timer);
    assert.equal(host.messages.length, count);
});

test('BUG-62: callback старого ответа не завершает новый ответ', t => {
    const { room, host, first } = setup(t, { answerTime: 30 });
    room.handleBuzz(first.id);
    const stale = room.answerTimer._onTimeout;
    room.selectQuestion(0, 1, { q: 'Новый вопрос?', a: 'Новый ответ', cost: 200 });
    room.handleBuzz(first.id);
    const timer = room.answerTimer;
    const count = host.messages.length;
    stale();
    assert.equal(room.stateMachine.state, 'ANSWERING');
    assert.equal(room.answerTimer, timer);
    assert.equal(room.activeBuzzerPlayerId, first.id);
    assert.equal(host.messages.length, count);
});

test('BUG-62: callback до паузы не срабатывает после возобновления того же вопроса', t => {
    const { room, host } = setup(t);
    const stale = room.thinkingTimer._onTimeout;
    room.setPaused(true);
    room.setPaused(false);
    const timer = room.thinkingTimer;
    const count = host.messages.length;
    stale();
    assert.equal(room.stateMachine.state, 'BUZZ_ACTIVE');
    assert.equal(room.thinkingTimer, timer);
    assert.equal(host.messages.length, count);
});

test('BUG-62: обработчики истечения времени после GAME_OVER безопасны', t => {
    const { room, host, first } = setup(t);
    room.handleBuzz(first.id);
    room.finishGame();
    const count = host.messages.length;
    room.handleAnswerTimeout();
    room.handleThinkingTimeout();
    room.handleAuctionAnswerTimeout();
    assert.equal(room.stateMachine.state, 'GAME_OVER');
    assert.equal(host.messages.length, count);
});
