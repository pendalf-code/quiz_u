const test = require('node:test');
const assert = require('node:assert/strict');
const Room = require('../src/Room');
const { MSG_TYPES } = require('../src/protocol');

function mockWs() {
    return { messages: [], readyState: 1, send(d) { this.messages.push(JSON.parse(d)); } };
}

function makeRoom(options = {}, rounds = 2) {
    const hostWs = mockWs();
    const room = new Room('FIX1', hostWs, { readingTime: 0, thinkingTime: 30, answerTime: 5, ...options });
    room.setPack(Array.from({ length: rounds }, (_, r) => ({
        roundName: `Раунд ${r + 1}`,
        themes: [{
            name: 'Тема',
            questions: [
                { cost: 100, q: 'Q1', a: 'A1' },
                { cost: 200, q: 'Q2', a: 'A2' }
            ]
        }]
    })));
    return { room, hostWs };
}

test('LAN fixes: pause / disconnect / scoring / rounds', async (t) => {
    await t.test('disconnect pause freezes timers and reconnect auto-resumes without duplicate timers', () => {
        const { room } = makeRoom();
        const ws1 = mockWs();
        const ws2 = mockWs();
        const p1 = room.addPlayer('Алиса', '🦊', ws1).player;
        room.addPlayer('Боб', '🐼', ws2);
        room.startGame();
        room.selectQuestion(0, 0);
        assert.equal(room.stateMachine.state, 'BUZZ_ACTIVE');
        assert.ok(room.thinkingTimer, 'thinking timer runs');

        room.removePlayer(ws1);
        assert.equal(room.isPaused, true);
        assert.equal(room.pauseReason, 'disconnect');
        assert.equal(room.thinkingTimer, null, 'timers must be frozen while paused');

        const newWs = mockWs();
        const rejoin = room.addPlayer('Алиса', '🦊', newWs, p1.sessionToken);
        assert.equal(rejoin.isReconnect, true);
        assert.equal(room.isPaused, false, 'game resumes once everybody is back');
        assert.ok(room.thinkingTimer, 'thinking timer restarted');
        assert.ok(newWs.messages.some(m => m.type === MSG_TYPES.GAME_PAUSED && m.payload.isPaused === false));
        room.destroy();
    });

    await t.test('manual pause is not lifted by a reconnect', () => {
        const { room } = makeRoom();
        const ws1 = mockWs();
        const p1 = room.addPlayer('Алиса', '🦊', ws1).player;
        room.startGame();
        room.selectQuestion(0, 0);
        room.togglePause(true);
        room.removePlayer(ws1);
        assert.equal(room.pauseReason, 'host');
        room.addPlayer('Алиса', '🦊', mockWs(), p1.sessionToken);
        assert.equal(room.isPaused, true);
        room.togglePause(false);
        assert.equal(room.isPaused, false);
        assert.ok(room.thinkingTimer);
        room.destroy();
    });

    await t.test('kicking a player does not pause the game', () => {
        const { room } = makeRoom();
        const p1 = room.addPlayer('Алиса', '🦊', mockWs()).player;
        room.addPlayer('Боб', '🐼', mockWs());
        room.startGame();
        room.selectQuestion(0, 0);
        room.removePlayer(p1.id);
        assert.equal(room.isPaused, false);
        room.destroy();
    });

    await t.test('buzzer is not reopened for disconnected players only', () => {
        const { room } = makeRoom();
        const ws1 = mockWs();
        const ws2 = mockWs();
        const p1 = room.addPlayer('Алиса', '🦊', ws1).player;
        const p2 = room.addPlayer('Боб', '🐼', ws2).player;
        room.startGame();
        room.selectQuestion(0, 0);
        room.handleBuzz(p1.id);
        room.removePlayer(ws2); // Боб dropped (pauses the game)
        room.setPaused(false);
        room.judgeAnswer(false, false);
        assert.equal(room.stateMachine.state, 'BOARD', 'question closes when nobody online can still answer');
        assert.equal(p2.isConnected, false);
        room.destroy();
    });

    await t.test('score is applied exactly once and penalty respects explicit host choice', () => {
        const { room } = makeRoom({ penaltyEnabled: false });
        const p1 = room.addPlayer('Алиса', '🦊', mockWs()).player;
        room.addPlayer('Боб', '🐼', mockWs());
        room.startGame();
        room.selectQuestion(0, 1);
        room.handleBuzz(p1.id);
        room.judgeAnswer(false, false);
        assert.equal(p1.score, 0, 'no penalty without explicit choice when penalties are off');

        room.selectQuestion(0, 0);
        room.handleBuzz(p1.id);
        room.judgeAnswer(false, true);
        assert.equal(p1.score, -100, 'explicit "reject with penalty" deducts the nominal');
        room.destroy();
    });

    await t.test('fixed penalty of 0 deducts nothing', () => {
        const { room } = makeRoom({ penaltyEnabled: true, penaltyMode: 'fixed', penaltyFixedAmount: 0 });
        const p1 = room.addPlayer('Алиса', '🦊', mockWs()).player;
        room.addPlayer('Боб', '🐼', mockWs());
        room.startGame();
        room.selectQuestion(0, 0);
        room.handleBuzz(p1.id);
        room.judgeAnswer(false);
        assert.equal(p1.score, 0);
        room.destroy();
    });

    await t.test('skipping the last round ends the game', () => {
        const { room } = makeRoom({}, 1);
        room.addPlayer('Алиса', '🦊', mockWs());
        room.startGame();
        room.skipRound();
        assert.equal(room.stateMachine.state, 'GAME_OVER');
        room.destroy();
    });

    await t.test('skipping a middle round moves to the next one', () => {
        const { room } = makeRoom({}, 2);
        room.addPlayer('Алиса', '🦊', mockWs());
        room.startGame();
        room.skipRound();
        assert.equal(room.currentRoundIndex, 1);
        assert.equal(room.stateMachine.state, 'BOARD');
        room.destroy();
    });

    await t.test('selecting a question while paused unfreezes the game for everybody', () => {
        const { room, hostWs } = makeRoom();
        room.addPlayer('Алиса', '🦊', mockWs());
        room.startGame();
        room.togglePause(true);
        room.selectQuestion(0, 0);
        assert.equal(room.isPaused, false);
        assert.ok(hostWs.messages.some(m => m.type === MSG_TYPES.GAME_PAUSED && m.payload.isPaused === false));
        room.destroy();
    });

    await t.test('snapshot exposes who may still buzz', () => {
        const { room } = makeRoom();
        const p1 = room.addPlayer('Алиса', '🦊', mockWs()).player;
        const p2 = room.addPlayer('Боб', '🐼', mockWs()).player;
        room.startGame();
        room.selectQuestion(0, 0);
        room.handleBuzz(p1.id);
        room.judgeAnswer(false, false);
        const snap = room.getStateSnapshot(true);
        assert.deepEqual(snap.buzzerOpenFor, [p2.id]);
        room.destroy();
    });

    await t.test('answer text is coerced to a bounded string', () => {
        const { room } = makeRoom();
        const p1 = room.addPlayer('Алиса', '🦊', mockWs()).player;
        room.addPlayer('Боб', '🐼', mockWs());
        room.startGame();
        room.selectQuestion(0, 0);
        room.handleBuzz(p1.id);
        const hostWs = room.hostWs;
        room.handleAnswerSubmit(p1.id, 'x'.repeat(1000));
        const submitted = hostWs.messages.filter(m => m.type === MSG_TYPES.ANSWER_SUBMITTED).pop();
        assert.equal(submitted.payload.answerText.length, 300);
        room.destroy();
    });
});
