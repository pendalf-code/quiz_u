const test = require('node:test');
const assert = require('node:assert/strict');
const Room = require('../src/Room');
const { MSG_TYPES } = require('../src/protocol');

const mockWs = () => ({ messages: [], readyState: 1, send(d) { this.messages.push(JSON.parse(d)); } });

function setup(type, options = {}) {
    const hostWs = mockWs();
    const room = new Room('SPEC', hostWs, { readingTime: 0, thinkingTime: 30, answerTime: 5, penaltyEnabled: true, ...options });
    room.setPack([{ themes: [{ name: 'T', questions: [{ cost: 300, q: 'Q', a: 'A', type }, { cost: 100, q: 'Q2', a: 'A2' }] }] }]);
    const aWs = mockWs();
    const bWs = mockWs();
    const cWs = mockWs();
    const a = room.addPlayer('Алиса', '🦊', aWs).player;
    const b = room.addPlayer('Боб', '🐼', bWs).player;
    const c = room.addPlayer('Вика', '🐱', cWs).player;
    a.score = 1000;
    b.score = 1000;
    c.score = 100;
    room.startGame();
    room.selectQuestion(0, 0);
    return { room, hostWs, aWs, bWs, a, b, c };
}

test('Cat in the bag: host assigns the answering player', async (t) => {
    await t.test('nothing runs until the host assigns a team', () => {
        const { room, hostWs, aWs } = setup('cat');
        assert.equal(room.stateMachine.state, 'CAT_CHOOSING');
        assert.equal(room.readingTimer, null);
        assert.ok(!hostWs.messages.some(m => m.type === MSG_TYPES.BUZZER_READY), 'buzzer must stay closed');
        const active = aWs.messages.find(m => m.type === MSG_TYPES.QUESTION_ACTIVE);
        assert.equal(active.payload.state, 'CAT_CHOOSING');
        assert.equal(active.payload.questionType, 'cat');
        assert.equal(active.payload.question.a, undefined);
        room.destroy();
    });

    await t.test('assigned player only gets the buzzer and may not pass', () => {
        const { room, hostWs, a, b } = setup('cat');
        const res = room.setCatTarget(b.id);
        assert.equal(res.success, true);
        const moved = hostWs.messages.find(m => m.type === MSG_TYPES.CAT_TRANSFERRED);
        assert.equal(moved.payload.toPlayerId, b.id);
        assert.equal(moved.payload.toPlayerName, 'Боб');
        assert.equal(room.stateMachine.state, 'BUZZ_ACTIVE');
        assert.deepEqual(room.allowedBuzzerPlayerIds, [b.id]);
        assert.equal(room.handlePass(b.id).success, false, 'the assigned player must answer');
        assert.equal(room.handleBuzz(a.id).success, false);
        assert.equal(room.handleBuzz(b.id).success, true);
        room.judgeAnswer(false, true);
        assert.equal(b.score, 700, 'penalty is the nominal');
        assert.equal(room.stateMachine.state, 'BOARD', 'nobody else may answer a cat question');
        room.destroy();
    });

    await t.test('unknown target is rejected', () => {
        const { room } = setup('cat');
        assert.equal(room.setCatTarget('nope').success, false);
        assert.equal(room.stateMachine.state, 'CAT_CHOOSING');
        room.destroy();
    });
});

test('Auction for everyone: typed answers, host judges each team', async (t) => {
    await t.test('bets are limited by score and wait for the host', () => {
        const { room, hostWs, a, b, c } = setup('auction');
        assert.equal(room.stateMachine.state, 'AUCTION_BETTING');
        assert.equal(room.readingTimer, null);
        room.handleAuctionBet(a.id, 700);
        room.handleAuctionBet(b.id, 5000); // above own score
        room.handleAuctionBet(c.id, 0);
        const bets = hostWs.messages.filter(m => m.type === MSG_TYPES.AUCTION_BET_MADE).map(m => m.payload.amount);
        assert.deepEqual(bets, [700, 1000, 0]);
        assert.equal(room.stateMachine.state, 'AUCTION_BETTING', 'still betting until the host closes the bets');
        room.destroy();
    });

    await t.test('host closes bets: bidders type answers (no buzzer)', () => {
        const { room, hostWs, aWs, a, b, c } = setup('auction', { thinkingTime: 45 }); // 45 s thinking time must not leak into auctions
        room.handleAuctionBet(a.id, 700);
        room.handleAuctionBet(b.id, 400);
        room.handleAuctionBet(c.id, 0);
        const res = room.startAuctionAnswer();
        assert.equal(res.success, true);
        assert.equal(room.stateMachine.state, 'AUCTION_ANSWERING');
        const start = aWs.messages.find(m => m.type === MSG_TYPES.AUCTION_ANSWER_START);
        assert.deepEqual(start.payload.biddingPlayerIds.slice().sort(), [a.id, b.id].sort());
        assert.equal(start.payload.answerTime, 30);
        assert.equal(start.payload.thinkingTime, 30, 'typed answers always get a fixed 30 seconds');
        assert.ok(!hostWs.messages.some(m => m.type === MSG_TYPES.BUZZER_READY));
        assert.equal(room.handleBuzz(a.id).success, false);
        assert.equal(room.handlePass(a.id).success, false, 'bidders must answer');

        assert.equal(room.handleAnswerSubmit(a.id, 'ответ А').success, true);
        assert.equal(room.handleAnswerSubmit(c.id, 'я не ставил').success, false);
        const submitted = hostWs.messages.filter(m => m.type === MSG_TYPES.ANSWER_SUBMITTED).pop();
        assert.equal(submitted.payload.bet, 700);

        // duplicate start (PC screen) must not wipe answers
        assert.equal(room.startAuctionAnswer([a.id]).already, true);
        assert.equal(room.auctionAnswers.size, 1);

        // host judges per team with the team's own bet
        room.updatePlayerScore(a.id, 700);
        room.updatePlayerScore(b.id, -400);
        assert.equal(a.score, 1700);
        assert.equal(b.score, 600);
        room.destroy();
    });

    await t.test('answers are locked when the typing time is over', () => {
        const { room, a } = setup('auction', { thinkingTime: 1 });
        room.handleAuctionBet(a.id, 300);
        room.startAuctionAnswer();
        room.handleAuctionAnswerTimeout();
        assert.equal(room.handleAnswerSubmit(a.id, 'поздно').success, false);
        assert.equal(room.stateMachine.state, 'AUCTION_ANSWERING', 'host can still judge');
        room.destroy();
    });

    await t.test('no bets -> cannot start answers', () => {
        const { room, a, b, c } = setup('auction');
        room.handleAuctionBet(a.id, 0);
        room.handleAuctionBet(b.id, 0);
        room.handleAuctionBet(c.id, 0);
        const res = room.startAuctionAnswer();
        assert.equal(res.success, false);
        assert.equal(room.stateMachine.state, 'AUCTION_BETTING');
        room.destroy();
    });
});

test('Auction for the right to answer: only the leader buzzes', async (t) => {
    await t.test('leader is announced, buzzer opens for the leader only, cost = bet', () => {
        const { room, hostWs, a, b } = setup('auction_leader');
        assert.equal(room.stateMachine.state, 'AUCTION_BETTING');
        room.handleAuctionBet(a.id, 500);
        room.handleAuctionBet(b.id, 800);
        const res = room.setAuctionLeader(b.id);
        assert.equal(res.success, true);
        const set = hostWs.messages.find(m => m.type === MSG_TYPES.AUCTION_LEADER_SET);
        assert.equal(set.payload.leaderPlayerId, b.id);
        assert.equal(set.payload.bet, 800);
        assert.equal(room.currentCost, 800);
        assert.equal(room.stateMachine.state, 'BUZZ_ACTIVE');
        assert.deepEqual(room.allowedBuzzerPlayerIds, [b.id]);
        assert.equal(room.handleBuzz(a.id).success, false);
        assert.equal(room.handlePass(b.id).success, false, 'the leader must answer');
        room.handleBuzz(b.id);
        room.judgeAnswer(true);
        assert.equal(b.score, 1800);
        room.destroy();
    });

    await t.test('wrong answer costs the bet and ends the question', () => {
        const { room, a } = setup('auction_leader');
        room.handleAuctionBet(a.id, 500);
        room.setAuctionLeader(a.id);
        room.handleBuzz(a.id);
        room.judgeAnswer(false, true);
        assert.equal(a.score, 500);
        assert.equal(room.stateMachine.state, 'BOARD');
        room.destroy();
    });
});

test('Regular question: players may pass', async (t) => {
    await t.test('a passed player cannot buzz and the question closes when everybody passed', () => {
        const { room, hostWs, a, b, c } = setup(undefined);
        assert.equal(room.stateMachine.state, 'BUZZ_ACTIVE');
        assert.equal(room.handlePass(a.id).success, true);
        const passed = hostWs.messages.find(m => m.type === MSG_TYPES.PLAYER_PASSED);
        assert.equal(passed.payload.playerId, a.id);
        assert.equal(room.handleBuzz(a.id).success, false);
        assert.equal(room.stateMachine.state, 'BUZZ_ACTIVE');
        room.handlePass(b.id);
        room.handlePass(c.id);
        assert.equal(room.stateMachine.state, 'BOARD', 'question is over');
        const shown = hostWs.messages.find(m => m.type === MSG_TYPES.SHOW_ANSWER);
        assert.equal(shown.payload.answer, 'A', 'the answer must be revealed on the big screen');
        assert.ok(!hostWs.messages.some(m => m.type === MSG_TYPES.QUESTION_CLOSED), 'the board comes only from the host (К табло)');
        room.destroy();
    });

    await t.test('passing after a wrong answer closes the question when nobody is left', () => {
        const { room, a, b, c } = setup(undefined);
        room.handleBuzz(a.id);
        room.judgeAnswer(false, false);
        room.handlePass(b.id);
        assert.equal(room.stateMachine.state, 'BUZZ_ACTIVE');
        room.handlePass(c.id);
        assert.equal(room.stateMachine.state, 'BOARD');
        room.destroy();
    });

    await t.test('cannot pass while somebody is answering or twice', () => {
        const { room, a, b } = setup(undefined);
        room.handleBuzz(a.id);
        assert.equal(room.handlePass(b.id).success, false);
        room.destroy();
    });
});
