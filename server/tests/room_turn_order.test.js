const test = require('node:test');
const assert = require('node:assert/strict');
const Room = require('../src/Room');
const { MSG_TYPES } = require('../src/protocol');

const mockWs = () => ({ messages: [], readyState: 1, send(d) { this.messages.push(JSON.parse(d)); } });
const last = (ws, type) => ws.messages.filter(m => m.type === type).pop();

const q = (cost, extra = {}) => ({ cost, q: `Q${cost}`, a: `A${cost}`, ...extra });
const PACK = [
    { roundName: 'Раунд 1', themes: [{ name: 'T', questions: [q(100), q(200), q(300), q(400, { type: 'auction' })] }] },
    { roundName: 'Раунд 2', themes: [{ name: 'T2', questions: [q(100), q(200)] }] }
];

function setup(turnOrderMode) {
    const hostWs = mockWs();
    const room = new Room('TURN', hostWs, { readingTime: 0, thinkingTime: 30, answerTime: 5, turnOrderMode });
    room.setPack(JSON.parse(JSON.stringify(PACK)));
    const aWs = mockWs();
    const a = room.addPlayer('Алиса', '🦊', aWs).player;
    const b = room.addPlayer('Боб', '🐼', mockWs()).player;
    const c = room.addPlayer('Вика', '🐱', mockWs()).player;
    room.startGame();
    return { room, hostWs, aWs, a, b, c };
}

function playCorrect(room, qIdx, player) {
    room.selectQuestion(0, qIdx);
    room.handleBuzz(player.id);
    room.judgeAnswer(true);
    room.closeQuestion();
}

function playNobody(room, qIdx) {
    room.selectQuestion(0, qIdx);
    room.handleThinkingTimeout();
    room.closeQuestion();
}

test('Turn order: setting and defaults', async (t) => {
    await t.test('default is rotation; unknown values fall back to it', () => {
        assert.equal(new Room('X1', mockWs()).options.turnOrderMode, 'rotation');
        assert.equal(new Room('X2', mockWs(), { turnOrderMode: 'chaos' }).options.turnOrderMode, 'rotation');
        const room = new Room('X3', mockWs());
        room.updateOptions({ turnOrderMode: 'winner' });
        assert.equal(room.options.turnOrderMode, 'winner');
    });

    await t.test('the first player starts; snapshot carries the turn', () => {
        const { room, aWs, a } = setup();
        assert.equal(room.turnPlayerId, a.id);
        const snap = last(aWs, MSG_TYPES.ROOM_STATE).payload;
        assert.equal(snap.turnPlayerId, a.id);
        assert.equal(snap.turnOrderMode, 'rotation');
        room.destroy();
    });
});

test('Turn order: rotation', async (t) => {
    await t.test('every played question passes the turn on, whoever answered', () => {
        const { room, aWs, a, b, c } = setup('rotation');
        playCorrect(room, 0, c);
        assert.equal(room.turnPlayerId, b.id);
        const changed = last(aWs, MSG_TYPES.TURN_CHANGED).payload;
        assert.equal(changed.turnPlayerId, b.id);
        assert.equal(changed.turnPlayerName, 'Боб');
        playNobody(room, 1);
        assert.equal(room.turnPlayerId, c.id);
        playNobody(room, 2);
        assert.equal(room.turnPlayerId, a.id, 'wraps around');
        room.destroy();
    });

    await t.test('closing an already finished question does not move the turn twice', () => {
        const { room, a, b } = setup('rotation');
        room.selectQuestion(0, 0);
        room.handleBuzz(b.id);
        room.judgeAnswer(true); // finishes the question
        assert.equal(room.turnPlayerId, b.id);
        room.closeQuestion(); // host returns to the board
        assert.equal(room.turnPlayerId, b.id);
        assert.notEqual(room.turnPlayerId, a.id);
        room.destroy();
    });

    await t.test('pass turn and a manual pick by the host', () => {
        const { room, aWs, b, c } = setup('rotation');
        room.passTurn();
        assert.equal(room.turnPlayerId, b.id);
        assert.equal(last(aWs, MSG_TYPES.TURN_PASSED).payload.turnPlayerId, b.id);
        assert.equal(room.setTurn(c.id).success, true);
        assert.equal(room.turnPlayerId, c.id);
        assert.equal(room.setTurn('nope').success, false);
        room.destroy();
    });

    await t.test('disconnected players are skipped, a kicked chooser loses the turn', () => {
        const { room, a, b, c } = setup('rotation');
        room.removePlayer(b.ws); // drops (auto-pause)
        room.passTurn();
        assert.equal(room.turnPlayerId, c.id, 'Боб is offline');
        room.removePlayer(c.id); // kicked
        assert.equal(room.turnPlayerId, a.id);
        room.destroy();
    });

    await t.test('a new round passes the turn on', () => {
        const { room, b } = setup('rotation');
        room.nextRound();
        assert.equal(room.turnPlayerId, b.id);
        room.destroy();
    });
});

test('Turn order: the one who answered right', async (t) => {
    await t.test('the right answer takes the turn', () => {
        const { room, c } = setup('winner');
        playCorrect(room, 0, c);
        assert.equal(room.turnPlayerId, c.id);
        room.destroy();
    });

    await t.test('wrong answers or a timeout: the chooser keeps the turn', () => {
        const { room, a, b } = setup('winner');
        room.selectQuestion(0, 0);
        room.handleBuzz(b.id);
        room.judgeAnswer(false, false);
        room.handleThinkingTimeout();
        room.closeQuestion();
        assert.equal(room.turnPlayerId, a.id);
        playNobody(room, 1);
        assert.equal(room.turnPlayerId, a.id);
        room.destroy();
    });

    await t.test('right after a wrong answer: the player who got it right moves', () => {
        const { room, b, c } = setup('winner');
        room.selectQuestion(0, 0);
        room.handleBuzz(b.id);
        room.judgeAnswer(false, false);
        room.handleBuzz(c.id);
        room.judgeAnswer(true);
        assert.equal(room.turnPlayerId, c.id);
        room.destroy();
    });

    await t.test('auction for everyone: the first player credited by the host moves', () => {
        const { room, a, b, c } = setup('winner');
        a.score = 1000; b.score = 1000; c.score = 1000;
        room.selectQuestion(0, 3);
        room.handleAuctionBet(b.id, 500);
        room.handleAuctionBet(c.id, 600);
        room.startAuctionAnswer();
        room.updatePlayerScore(c.id, 600);
        room.updatePlayerScore(b.id, 500);
        room.closeQuestion();
        assert.equal(room.turnPlayerId, c.id);
        room.destroy();
    });

    await t.test('a new round keeps the turn; manual points on the board do not count', () => {
        const { room, a, b } = setup('winner');
        room.updatePlayerScore(b.id, 100); // no open question
        room.nextRound();
        assert.equal(room.turnPlayerId, a.id);
        room.destroy();
    });
});
