const test = require('node:test');
const assert = require('node:assert/strict');
const Room = require('../src/Room');
const { MSG_TYPES } = require('../src/protocol');

const mockWs = () => ({ messages: [], readyState: 1, send(d) { this.messages.push(JSON.parse(d)); } });
const of = (ws, type) => ws.messages.filter(m => m.type === type);
const last = (ws, type) => of(ws, type).pop();

const PACK = [
    { roundName: 'Раунд 1', themes: [{ name: 'Разминка', questions: [{ cost: 100, q: 'Q1', a: 'A1' }] }] },
    { roundName: '🏆 ФИНАЛ', themes: [{ name: 'Космос', questions: [{ cost: 500, q: 'Финальный вопрос?', a: 'Луна', a_img: 'moon.jpg', comment: 'C' }] }] }
];

/** Room in the final round: Алиса 1000, Боб 300, Вика -200 (not eligible) */
function setupFinal({ scores = [1000, 300, -200], pack = PACK } = {}) {
    const hostWs = mockWs();
    const room = new Room('FINL', hostWs, { readingTime: 0, thinkingTime: 30, answerTime: 5 });
    room.setPack(JSON.parse(JSON.stringify(pack)));
    const aWs = mockWs();
    const bWs = mockWs();
    const cWs = mockWs();
    const a = room.addPlayer('Алиса', '🦊', aWs).player;
    const b = room.addPlayer('Боб', '🐼', bWs).player;
    const c = room.addPlayer('Вика', '🐱', cWs).player;
    [a, b, c].forEach((p, i) => { p.score = scores[i]; });
    room.startGame();
    room.nextRound();
    [hostWs, aWs, bWs, cWs].forEach(ws => { ws.messages.length = 0; });
    room.selectQuestion(0, 0);
    return { room, hostWs, aWs, bWs, cWs, a, b, c };
}

function toAnswering(ctx) {
    ctx.room.handleAuctionBet(ctx.a.id, 600);
    ctx.room.handleAuctionBet(ctx.b.id, 300);
    const res = ctx.room.startAuctionAnswer();
    assert.equal(res.success, true);
    return ctx;
}

test('Final round: opens as bets without a buzzer, text hidden from players', async (t) => {
    await t.test('state, type and limits; players see only the theme', () => {
        const { room, hostWs, aWs, a, b, c } = setupFinal();
        assert.equal(room.stateMachine.state, 'AUCTION_BETTING');
        assert.equal(room.isFinalQuestion, true);
        assert.equal(room.readingTimer, null);
        assert.equal(room.thinkingTimer, null);
        const toPlayer = last(aWs, MSG_TYPES.QUESTION_ACTIVE).payload;
        assert.equal(toPlayer.questionType, 'final');
        assert.equal(toPlayer.isFinal, true);
        assert.equal(toPlayer.themeName, 'Космос');
        assert.equal(toPlayer.question.q, undefined, 'the text is revealed only after the bets');
        assert.equal(toPlayer.question.a, undefined);
        assert.equal(toPlayer.question.a_img, undefined);
        assert.deepEqual(toPlayer.finalBetLimits, { [a.id]: { min: 1, max: 1000 }, [b.id]: { min: 1, max: 300 } });
        assert.ok(!toPlayer.finalEligibleIds.includes(c.id), 'a non-positive score does not play the final');
        const toHost = last(hostWs, MSG_TYPES.QUESTION_ACTIVE).payload;
        assert.equal(toHost.question.q, 'Финальный вопрос?');
        assert.equal(toHost.question.a, 'Луна');
        assert.equal(of(hostWs, MSG_TYPES.BUZZER_READY).length, 0);
        assert.equal(room.getStateSnapshot(true).currentQuestion.q, undefined);
        assert.equal(room.getStateSnapshot(true).isFinalRound, true);
        room.destroy();
    });

    await t.test('a mid-pack round named "...и Финал" with many questions is not a final', () => {
        const pack = [
            { roundName: 'Раунд 1', themes: [{ name: 'T', questions: [{ cost: 100, q: 'Q', a: 'A' }, { cost: 200, q: 'Q2', a: 'A2' }] }] },
            { roundName: 'Раунд 2: Война Бесконечности и Финал', themes: [{ name: 'T', questions: [{ cost: 100, q: 'Q', a: 'A' }, { cost: 200, q: 'Q2', a: 'A2' }] }] },
            { roundName: 'ФИНАЛ', themes: [{ name: 'F', questions: [{ cost: 500, q: 'FQ', a: 'FA' }] }] }
        ];
        const hostWs = mockWs();
        const room = new Room('NOTF', hostWs, { readingTime: 0 });
        room.setPack(pack);
        room.addPlayer('Алиса', '🦊', mockWs());
        room.startGame();
        room.nextRound();
        room.selectQuestion(0, 0);
        assert.equal(room.isFinalQuestion, false);
        assert.equal(room.stateMachine.state, 'BUZZ_ACTIVE');
        room.destroy();
    });
});

test('Final round: secret bets limited by score', async (t) => {
    await t.test('bets are clamped to 1..score, amounts go only to the host', () => {
        const { room, hostWs, aWs, bWs, a, b } = setupFinal();
        assert.equal(room.handleAuctionBet(a.id, 5000).amount, 1000);
        assert.equal(room.handleAuctionBet(b.id, 0).amount, 1, 'no pass in the final: the minimum bet is 1');
        const hostBets = of(hostWs, MSG_TYPES.AUCTION_BET_MADE).map(m => m.payload.amount);
        assert.deepEqual(hostBets, [1000, 1]);
        const seenByB = of(bWs, MSG_TYPES.AUCTION_BET_MADE).find(m => m.payload.playerId === a.id).payload;
        assert.equal(seenByB.placed, true);
        assert.equal(seenByB.amount, undefined, 'other players must not learn the amount');
        room.broadcastRoomState();
        const snapA = last(aWs, MSG_TYPES.ROOM_STATE).payload;
        assert.deepEqual(snapA.auctionBets, { [a.id]: 1000 }, 'a player sees only the own bet');
        assert.deepEqual(snapA.finalBetPlacedIds.slice().sort(), [a.id, b.id].sort());
        assert.equal(last(hostWs, MSG_TYPES.ROOM_STATE).payload.auctionBets[b.id], 1);
        room.destroy();
    });

    await t.test('a player with a non-positive score may not bet', () => {
        const { room, c } = setupFinal();
        const res = room.handleAuctionBet(c.id, 100);
        assert.equal(res.success, false);
        assert.equal(room.auctionBets.has(c.id), false);
        room.destroy();
    });

    await t.test('nobody positive: everybody plays for the nominal', () => {
        const { room, a, b, c } = setupFinal({ scores: [0, -100, 0] });
        [a, b, c].forEach(p => assert.deepEqual(room.finalBetLimits[p.id], { min: 500, max: 500 }));
        assert.equal(room.handleAuctionBet(b.id, 1).amount, 500);
        room.destroy();
    });

    await t.test('closing the bets without bets fails; only real bidders answer', () => {
        const { room, a, c } = setupFinal();
        assert.equal(room.startAuctionAnswer().success, false);
        room.handleAuctionBet(a.id, 200);
        const res = room.startAuctionAnswer([a.id, c.id]);
        assert.equal(res.success, true);
        assert.deepEqual(room.biddingPlayerIds, [a.id], 'the client list is ignored in the final');
        assert.equal(room.handleAuctionBet(a.id, 900).success, false, 'bets are closed');
        assert.equal(room.getAuctionBet(a.id), 200);
        room.destroy();
    });
});

test('Final round: typed answers', async (t) => {
    await t.test('question text is revealed with the answer window, answer stays hidden', () => {
        const ctx = toAnswering(setupFinal());
        const { room, hostWs, aWs } = ctx;
        assert.equal(room.stateMachine.state, 'AUCTION_ANSWERING');
        const start = last(aWs, MSG_TYPES.AUCTION_ANSWER_START).payload;
        assert.equal(start.isFinal, true);
        assert.equal(start.answerTime, Room.FINAL_ANSWER_SECONDS);
        assert.equal(start.question.q, 'Финальный вопрос?');
        assert.equal(start.question.a, undefined);
        assert.equal(start.question.a_img, undefined);
        assert.equal(last(hostWs, MSG_TYPES.AUCTION_ANSWER_START).payload.question.a, 'Луна');
        assert.ok(room.thinkingTimer, 'the typing window runs');
        room.destroy();
    });

    await t.test('answers go only to the host; non-bidders are rejected', () => {
        const ctx = toAnswering(setupFinal());
        const { room, hostWs, aWs, bWs, a, c } = ctx;
        assert.equal(room.handleAnswerSubmit(c.id, 'Солнце').success, false);
        assert.equal(room.handleAnswerSubmit(a.id, 'Луна').success, true);
        const sub = last(hostWs, MSG_TYPES.ANSWER_SUBMITTED).payload;
        assert.equal(sub.answerText, 'Луна');
        assert.equal(sub.isFinal, true);
        assert.equal(of(bWs, MSG_TYPES.ANSWER_SUBMITTED).length, 0, 'other players never see answer texts');
        assert.equal(of(aWs, MSG_TYPES.ANSWER_SUBMITTED).length, 0);
        room.broadcastRoomState();
        const snapB = last(bWs, MSG_TYPES.ROOM_STATE).payload;
        assert.equal(snapB.auctionAnswers, undefined);
        assert.deepEqual(snapB.auctionAnsweredIds, [a.id]);
        assert.equal(room.auctionAnswersLocked, false, 'Боб has not answered yet');
        room.destroy();
    });

    await t.test('the window closes early when everybody answered', () => {
        const ctx = toAnswering(setupFinal());
        const { room, aWs, a, b } = ctx;
        room.handleAnswerSubmit(a.id, 'Луна');
        room.handleAnswerSubmit(b.id, 'Марс');
        assert.equal(room.auctionAnswersLocked, true);
        assert.equal(room.thinkingTimer, null);
        const lock = last(aWs, MSG_TYPES.ANSWER_TIMEOUT).payload;
        assert.equal(lock.isFinal, true);
        assert.equal(lock.reason, 'all_answered');
        assert.equal(room.handleAnswerSubmit(a.id, 'другое').success, false, 'input is locked');
        room.destroy();
    });

    await t.test('timeout locks the input', () => {
        const ctx = toAnswering(setupFinal());
        const { room, aWs, a, b } = ctx;
        room.handleAnswerSubmit(a.id, 'Луна');
        room.handleAuctionAnswerTimeout();
        assert.equal(room.auctionAnswersLocked, true);
        assert.equal(last(aWs, MSG_TYPES.ANSWER_TIMEOUT).payload.reason, 'timeout');
        assert.equal(room.handleAnswerSubmit(b.id, 'поздно').success, false);
        room.destroy();
    });

    await t.test('pause freezes the typing window and resumes it', () => {
        const ctx = toAnswering(setupFinal());
        const { room } = ctx;
        room.setPaused(true, 'host');
        assert.equal(room.thinkingTimer, null);
        assert.ok(room.remainingThinkingTime > 0 && room.remainingThinkingTime <= Room.FINAL_ANSWER_SECONDS);
        room.setPaused(false);
        assert.ok(room.thinkingTimer, 'resumed');
        room.destroy();
    });

    await t.test('reconnect mid-answering restores the screen data', () => {
        const ctx = toAnswering(setupFinal());
        const { room, a, b } = ctx;
        room.handleAnswerSubmit(a.id, 'Луна');
        room.removePlayer(b.ws);
        assert.equal(room.isPaused, true, 'disconnect pauses the final');
        const bWs2 = mockWs();
        room.addPlayer('Боб', '🐼', bWs2, b.sessionToken);
        assert.equal(room.isPaused, false);
        const snap = last(bWs2, MSG_TYPES.ROOM_STATE).payload;
        assert.equal(snap.state, 'AUCTION_ANSWERING');
        assert.equal(snap.isFinal, true);
        assert.ok(snap.biddingPlayerIds.includes(b.id));
        assert.deepEqual(snap.auctionBets, { [b.id]: 300 });
        assert.equal(snap.currentQuestion.q, 'Финальный вопрос?');
        assert.equal(snap.currentQuestion.a, undefined);
        assert.ok(snap.answerSecondsLeft > 0);
        room.destroy();
    });
});

test('Final round: host judges every answer once, then the game ends', async (t) => {
    await t.test('judging needs locked answers; +bet / -bet once; texts only to the host', () => {
        const ctx = toAnswering(setupFinal());
        const { room, hostWs, aWs, bWs, a, b, c } = ctx;
        room.handleAnswerSubmit(a.id, 'Луна');
        assert.equal(room.judgeFinalAnswer(a.id, true).success, false, 'Боб is still typing');
        room.handleAnswerSubmit(b.id, 'Марс');

        assert.equal(room.judgeFinalAnswer(c.id, true).success, false, 'not a finalist');
        const r1 = room.judgeFinalAnswer(a.id, true);
        assert.equal(r1.success, true);
        assert.equal(a.score, 1600);
        assert.equal(room.judgeFinalAnswer(a.id, true).success, false, 'no double judging');
        assert.equal(a.score, 1600);
        assert.equal(last(hostWs, MSG_TYPES.FINAL_JUDGED).payload.answerText, 'Луна');
        assert.equal(last(bWs, MSG_TYPES.FINAL_JUDGED).payload.answerText, undefined);
        assert.equal(of(aWs, MSG_TYPES.SHOW_ANSWER).length, 0, 'answer shown only after all verdicts');

        const r2 = room.judgeFinalAnswer(b.id, false);
        assert.equal(r2.allJudged, true);
        assert.equal(b.score, 0);
        assert.equal(last(aWs, MSG_TYPES.SHOW_ANSWER).payload.answer, 'Луна');
        assert.deepEqual(room.getStateSnapshot(false).finalVerdicts, { [a.id]: true, [b.id]: false });
        assert.equal(room.stateMachine.state, 'AUCTION_ANSWERING', 'results stay on screen until the host closes');

        room.closeQuestion();
        assert.equal(room.stateMachine.state, 'GAME_OVER', 'the server ends the game after the final');
        assert.equal(room.isFinalQuestion, false);
        room.destroy();
    });

    await t.test('HOST_JUDGE_ANSWER does not apply to the final', () => {
        const ctx = toAnswering(setupFinal());
        const { room, a } = ctx;
        room.handleAuctionAnswerTimeout();
        assert.equal(room.judgeAnswer(true).success, false);
        assert.equal(a.score, 1000);
        room.destroy();
    });

    await t.test('several final themes: the host picks one, the rest are dropped', () => {
        const pack = [PACK[0], {
            roundName: 'Финал',
            themes: [
                { name: 'A', questions: [{ cost: 500, q: 'QA', a: 'AA' }] },
                { name: 'B', questions: [{ cost: 500, q: 'QB', a: 'AB' }] }
            ]
        }];
        const hostWs = mockWs();
        const room = new Room('FIN2', hostWs, { readingTime: 0 });
        room.setPack(pack);
        const a = room.addPlayer('Алиса', '🦊', mockWs()).player;
        a.score = 100;
        room.startGame();
        room.nextRound();
        room.selectQuestion(1, 0);
        assert.equal(room.currentThemeName, 'B');
        room.handleAuctionBet(a.id, 50);
        room.startAuctionAnswer();
        room.handleAnswerSubmit(a.id, 'AB');
        room.judgeFinalAnswer(a.id, true);
        room.closeQuestion();
        assert.equal(room.stateMachine.state, 'GAME_OVER');
        assert.equal(a.score, 150);
        room.destroy();
    });
});
