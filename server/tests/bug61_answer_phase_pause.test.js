const test = require('node:test');
const assert = require('node:assert/strict');
const Room = require('../src/Room');
const { MSG_TYPES } = require('../src/protocol');

function setup(t, type = 'normal') {
    const socket = () => ({ readyState: 1, messages: [], send(raw) { this.messages.push(JSON.parse(raw)); } });
    const host = socket();
    const room = new Room('B61', host, { readingTime: 0, thinkingTime: 30, answerTime: 30 });
    const first = room.addPlayer('Первый', '', socket()).player;
    const second = room.addPlayer('Второй', '', socket()).player;
    first.score = second.score = 1000;
    room.setPack([{ roundName: type === 'final' ? 'ФИНАЛ' : 'Раунд 1',
        themes: [{ name: 'Тема', questions: [{ q: 'Вопрос?', a: 'Ответ', cost: 100, type }] }] }]);
    room.startGame();
    room.selectQuestion(0, 0);
    t.after(() => room.destroy());
    return { room, host, first, second };
}

function submitted(host) {
    return host.messages.filter(message => message.type === MSG_TYPES.ANSWER_SUBMITTED);
}

function beginTyping(room, first, second) {
    room.handleAuctionBet(first.id, 100);
    room.handleAuctionBet(second.id, 100);
    assert.equal(room.startAuctionAnswer().success, true);
}

test('BUG-61: личный ответ на паузе не передаётся ведущему, после возобновления принимается', t => {
    const { room, host, first } = setup(t);
    room.handleBuzz(first.id);
    room.setPaused(true);
    assert.equal(room.handleAnswerSubmit(first.id, 'На паузе').success, false);
    assert.equal(submitted(host).length, 0);
    room.setPaused(false);
    assert.equal(room.handleAnswerSubmit(first.id, 'После паузы').success, true);
    assert.equal(submitted(host).length, 1);
});

for (const type of ['auction', 'auction_all', 'final']) {
    test('BUG-61: ' + type + ' не принимает текст до закрытия ставок', t => {
        const { room, host, first } = setup(t, type);
        assert.equal(room.stateMachine.state, 'AUCTION_BETTING');
        assert.equal(room.handleAnswerSubmit(first.id, 'Слишком рано').success, false);
        assert.equal(room.auctionAnswers.size, 0);
        assert.equal(submitted(host).length, 0);
    });

    test('BUG-61: ' + type + ' не принимает текст в чужой фазе личного ответа', t => {
        const { room, host, first } = setup(t, type);
        room.stateMachine.state = 'ANSWERING';
        room.activeBuzzerPlayerId = first.id;
        assert.equal(room.handleAnswerSubmit(first.id, 'Неверная фаза').success, false);
        assert.equal(submitted(host).length, 0);
    });

    test('BUG-61: пауза ' + type + ' не меняет сохранённый ответ и блокировку', t => {
        const { room, host, first, second } = setup(t, type);
        beginTyping(room, first, second);
        assert.equal(room.handleAnswerSubmit(first.id, 'Первый ответ').success, true);
        const answers = room.auctionAnswers.get(first.id);
        const before = submitted(host).length;
        room.setPaused(true);
        assert.equal(room.handleAnswerSubmit(first.id, 'Подмена на паузе').success, false);
        assert.equal(room.handleAnswerSubmit(second.id, 'Второй на паузе').success, false);
        assert.equal(room.auctionAnswers.get(first.id), answers);
        assert.equal(room.auctionAnswers.has(second.id), false);
        assert.equal(room.auctionAnswersLocked, false);
        assert.equal(submitted(host).length, before);
        room.setPaused(false);
        assert.equal(room.handleAnswerSubmit(second.id, 'После возобновления').success, true);
        assert.equal(submitted(host).length, before + 1);
    });
}

test('BUG-61: чужой игрок не отправляет личный ответ вместо нажавшего баззер', t => {
    const { room, host, first, second } = setup(t);
    room.handleBuzz(first.id);
    assert.equal(room.handleAnswerSubmit(second.id, 'Чужой ответ').success, false);
    assert.equal(submitted(host).length, 0);
    assert.equal(room.handleAnswerSubmit(first.id, 'Свой ответ').success, true);
});

test('BUG-61: пустой список участников текстового аукциона не открывает ответы всем', t => {
    const { room, host, first, second } = setup(t, 'auction');
    beginTyping(room, first, second);
    room.biddingPlayerIds = [];
    assert.equal(room.handleAnswerSubmit(first.id, 'Нет допуска').success, false);
    assert.equal(room.auctionAnswers.size, 0);
    assert.equal(submitted(host).length, 0);
});

test('BUG-61: отключённый участник не отправляет текст даже при сохранённом ID', t => {
    const { room, host, first, second } = setup(t, 'auction_all');
    beginTyping(room, first, second);
    first.isConnected = false;
    assert.equal(room.handleAnswerSubmit(first.id, 'Не в сети').success, false);
    assert.equal(room.auctionAnswers.size, 0);
    assert.equal(submitted(host).length, 0);
});

test('BUG-61: неизвестный ID не подставляет ответ при пустом списке участников', t => {
    const { room, host, first, second } = setup(t, 'auction');
    beginTyping(room, first, second);
    room.biddingPlayerIds = [];
    assert.equal(room.handleAnswerSubmit('unknown', 'Подмена').success, false);
    assert.equal(room.auctionAnswers.size, 0);
    assert.equal(submitted(host).length, 0);
});
