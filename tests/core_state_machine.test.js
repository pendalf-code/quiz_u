const { describe, it } = require('node:test');
const assert = require('node:assert');
const GameStateMachine = require('../js/core/GameStateMachine.js');

describe('Core: GameStateMachine Tests', () => {
    const States = GameStateMachine.States;

    it('initializes in INIT state', () => {
        const gsm = new GameStateMachine();
        assert.strictEqual(gsm.getState(), States.INIT);
    });

    it('transitions INIT -> LOBBY -> BOARD', () => {
        const gsm = new GameStateMachine();
        gsm.startLobby();
        assert.strictEqual(gsm.getState(), States.LOBBY);

        gsm.showBoard(0, 3);
        assert.strictEqual(gsm.getState(), States.BOARD);
        assert.strictEqual(gsm.currentRound, 0);
        assert.strictEqual(gsm.totalRounds, 3);
    });

    it('handles normal question lifecycle: BOARD -> READING -> BUZZ -> ANSWERING -> BOARD', () => {
        const gsm = new GameStateMachine({
            readingTime: 5,
            thinkingTime: 20,
            answerTime: 5
        });
        gsm.showBoard(0, 2);

        const normalQuestion = { q: 'Сколько планет в Солнечной системе?', a: '8', cost: 200, type: 'normal' };
        gsm.startQuestion(normalQuestion);
        assert.strictEqual(gsm.getState(), States.QUESTION_READING);

        gsm.openBuzzer();
        assert.strictEqual(gsm.getState(), States.BUZZ_ACTIVE);

        // Player 1 buzzes
        const buzzed = gsm.registerBuzz('player_123', 'team_1');
        assert.strictEqual(buzzed, true);
        assert.strictEqual(gsm.getState(), States.ANSWERING);

        // Submits correct answer and host resolves it
        gsm.submitAnswer('8');
        gsm.resolveAnswer(true);

        assert.strictEqual(gsm.getState(), States.BOARD);
    });

    it('disallows duplicate buzz from the same player in same question', () => {
        const gsm = new GameStateMachine();
        gsm.showBoard(0, 1);
        gsm.startQuestion({ q: 'Вопрос', a: 'Ответ', cost: 100 });
        gsm.openBuzzer();

        // Player 1 buzzes and answers incorrectly
        gsm.registerBuzz('player_1', 'team_1');
        gsm.resolveAnswer(false, { canOthersBuzz: true });

        // State returned to BUZZ_ACTIVE
        assert.strictEqual(gsm.getState(), States.BUZZ_ACTIVE);

        // Player 1 tries to buzz again -> blocked!
        const secondBuzz = gsm.registerBuzz('player_1', 'team_1');
        assert.strictEqual(secondBuzz, false);

        // Player 2 can buzz
        const player2Buzz = gsm.registerBuzz('player_2', 'team_2');
        assert.strictEqual(player2Buzz, true);
        assert.strictEqual(gsm.getState(), States.ANSWERING);
    });

    it('guards against invalid transitions', () => {
        const gsm = new GameStateMachine();
        assert.throws(() => {
            gsm.openBuzzer(); // cannot open buzzer from INIT
        });

        gsm.startLobby();
        assert.throws(() => {
            gsm.submitAnswer('Тест'); // cannot submit answer from LOBBY
        });
    });

    it('handles "cat in bag" lifecycle: BOARD -> CAT_CHOOSING -> READING -> BUZZ -> ...', () => {
        const gsm = new GameStateMachine();
        gsm.showBoard(0, 2);

        const catQuestion = { q: 'Секретный вопрос', a: 'Секрет', cost: 300, type: 'cat' };
        gsm.startQuestion(catQuestion, { turnTeamId: 'team_1' });
        assert.strictEqual(gsm.getState(), States.CAT_CHOOSING);

        // Team 1 transfers cat to Team 2
        gsm.transferCat('team_2');
        assert.strictEqual(gsm.getState(), States.QUESTION_READING);
        assert.strictEqual(gsm.activeTeamId, 'team_2');
    });

    it('handles auction lifecycle: BOARD -> AUCTION_BETTING -> READING -> BUZZ -> ...', () => {
        const gsm = new GameStateMachine();
        gsm.showBoard(0, 2);

        const auctionQuestion = { q: 'Аукционный вопрос', a: 'Золото', cost: 500, type: 'auction' };
        gsm.startQuestion(auctionQuestion, { turnTeamId: 'team_1' });
        assert.strictEqual(gsm.getState(), States.AUCTION_BETTING);

        gsm.submitAuctionBet('team_1', 600);
        gsm.submitAuctionBet('team_2', 800);

        gsm.finalizeAuction('team_2', 800);
        assert.strictEqual(gsm.getState(), States.QUESTION_READING);
        assert.strictEqual(gsm.activeTeamId, 'team_2');
        assert.strictEqual(gsm.currentQuestion.cost, 800);
    });

    it('handles round transitions and game over', () => {
        const gsm = new GameStateMachine();
        gsm.showBoard(0, 2);

        gsm.endRound();
        assert.strictEqual(gsm.getState(), States.ROUND_END);

        gsm.nextRound(); // to round 1 of 2
        assert.strictEqual(gsm.getState(), States.BOARD);
        assert.strictEqual(gsm.currentRound, 1);

        gsm.endRound();
        gsm.nextRound(); // last round -> GAME_OVER
        assert.strictEqual(gsm.getState(), States.GAME_OVER);
    });
});
