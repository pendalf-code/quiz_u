const test = require('node:test');
const assert = require('node:assert/strict');
const Room = require('../src/Room');
const { MSG_TYPES: MSG } = require('../src/protocol');

function socket() {
    return { readyState: 1, messages: [], send(raw) { this.messages.push(JSON.parse(raw)); } };
}

function last(ws, type) {
    return ws.messages.filter(message => message.type === type).at(-1).payload;
}

function containsNumber(value, number) {
    if (typeof value === 'number') return value === number;
    return value !== null && typeof value === 'object'
        && Object.values(value).some(item => containsNumber(item, number));
}

function setup(t, type = 'final') {
    const pc = socket();
    const mobileHost = socket();
    const room = new Room('B72', pc, { readingTime: 0 });
    t.after(() => room.destroy());
    room.addPlayer('Ведущий', '', mobileHost, null, 'host');
    const members = [1000, 1000, 0, 100].map((score, index) => {
        const ws = socket();
        const player = room.addPlayer('Игрок ' + (index + 1), '', ws).player;
        player.score = score;
        return { ws, player };
    });
    room.setPack([{ roundName: type === 'final' ? 'ФИНАЛ' : 'Раунд', themes: [{
        name: 'Тема', questions: [{ q: 'Вопрос?', a: 'Ответ', a_img: 'answer.jpg', cost: 500, type }]
    }] }]);
    room.startGame();
    room.selectQuestion(0, 0);
    room.handleAuctionBet(members[0].player.id, type === 'final' ? 150 : 550);
    room.handleAuctionBet(members[1].player.id, 650);
    return { room, pc, mobileHost, members };
}

test('BUG-72: начало финала передаёт каждому игроку только собственную ставку', t => {
    const { room, pc, mobileHost, members } = setup(t);
    const [a, b, observer, nonBidder] = members;
    assert.equal(room.startAuctionAnswer().success, true);
    const allBets = { [a.player.id]: 150, [b.player.id]: 650 };
    for (const host of [pc, mobileHost]) {
        const payload = last(host, MSG.AUCTION_ANSWER_START);
        assert.deepEqual(payload.bets, allBets);
        assert.equal(payload.question.a, 'Ответ');
    }
    for (const [member, ownBets] of [[a, { [a.player.id]: 150 }], [b, { [b.player.id]: 650 }],
        [observer, {}], [nonBidder, {}]]) {
        const payload = last(member.ws, MSG.AUCTION_ANSWER_START);
        assert.deepEqual(payload.bets, ownBets);
        assert.equal(payload.question.q, 'Вопрос?');
        assert.equal(payload.question.a, undefined);
        assert.equal(payload.question.a_img, undefined);
        assert.equal(payload.answerTime, Room.FINAL_ANSWER_SECONDS);
    }
});

test('BUG-72: снимки и реконнект в финале не раскрывают чужие ставки', t => {
    const { room, members } = setup(t);
    const [a, b, observer, nonBidder] = members;
    room.startAuctionAnswer();
    const restored = socket();
    const result = room.addPlayer(a.player.name, '', restored, a.player.sessionToken, 'player');
    assert.equal(result.isReconnect, true);
    assert.deepEqual(last(restored, MSG.ROOM_STATE).auctionBets, { [a.player.id]: 150 });
    assert.deepEqual(last(b.ws, MSG.ROOM_STATE).auctionBets, { [b.player.id]: 650 });
    assert.deepEqual(last(observer.ws, MSG.ROOM_STATE).auctionBets, {});
    assert.deepEqual(last(nonBidder.ws, MSG.ROOM_STATE).auctionBets, {});
    assert.deepEqual(room.getStateSnapshot(true).auctionBets, {});
});

test('BUG-72: события финала не раскрывают чужую ставку до публичного вердикта', t => {
    const { room, members } = setup(t);
    const [a, b, observer, nonBidder] = members;
    room.startAuctionAnswer();
    assert.equal(room.handleAnswerSubmit(a.player.id, 'Первый ответ').success, true);
    assert.equal(room.handleAnswerSubmit(b.player.id, 'Второй ответ').success, true);
    assert.equal(room.auctionAnswersLocked, true);
    room.setPaused(true);
    room.setPaused(false);
    room.broadcastRoomState();
    for (const member of [a, observer, nonBidder]) {
        assert.equal(containsNumber(member.ws.messages, 650), false);
    }
    assert.equal(containsNumber(b.ws.messages, 150), false);
    assert.equal(room.judgeFinalAnswer(a.player.id, true).success, true);
    assert.equal(last(b.ws, MSG.FINAL_JUDGED).bet, 150);
    assert.equal(containsNumber(a.ws.messages, 650), false);
    assert.equal(room.judgeFinalAnswer(b.player.id, false).success, true);
    assert.equal(last(a.ws, MSG.FINAL_JUDGED).bet, 650);
});

test('BUG-72: обычный текстовый аукцион сохраняет общую рассылку ставок', t => {
    const { room, pc, mobileHost, members } = setup(t, 'auction_all');
    const [a, b] = members;
    assert.equal(room.startAuctionAnswer().success, true);
    for (const ws of [pc, mobileHost, ...members.map(member => member.ws)]) {
        const payload = last(ws, MSG.AUCTION_ANSWER_START);
        assert.deepEqual(payload.bets, { [a.player.id]: 550, [b.player.id]: 650 });
        assert.equal(payload.answerTime, Room.AUCTION_ANSWER_SECONDS);
        assert.equal(payload.isFinal, undefined);
    }
});
