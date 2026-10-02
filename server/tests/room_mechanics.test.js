const test = require('node:test');
const assert = require('node:assert/strict');
const Room = require('../src/Room');

test('Server: Room Mechanics & Anti-Cheat Tests', async (t) => {
    let mockHostWs;
    let room;

    t.beforeEach(() => {
        mockHostWs = {
            messages: [],
            readyState: 1,
            send(data) { this.messages.push(JSON.parse(data)); }
        };
        room = new Room('TEST', mockHostWs, { readingTime: 1, answerTime: 2 });
    });

    t.afterEach(() => {
        if (room) room.destroy();
    });

    await t.test('player registration, duplicate names and capacity limits', () => {
        const mockPlayerWs1 = { messages: [], readyState: 1, send(d) { this.messages.push(JSON.parse(d)); } };
        const mockPlayerWs2 = { messages: [], readyState: 1, send(d) { this.messages.push(JSON.parse(d)); } };

        // Successful registration
        const join1 = room.addPlayer('Алиса', '🦊', mockPlayerWs1);
        assert.equal(join1.success, true);
        assert.equal(join1.player.name, 'Алиса');
        assert.equal(room.players.size, 1);

        // Duplicate name rejected
        const joinDuplicate = room.addPlayer('алиса', '🐱', mockPlayerWs2);
        assert.equal(joinDuplicate.success, false);
        assert.equal(joinDuplicate.error, 'NAME_ALREADY_TAKEN');

        // Second player with distinct name
        const join2 = room.addPlayer('Боб', '🐼', mockPlayerWs2);
        assert.equal(join2.success, true);
        assert.equal(room.players.size, 2);
    });

    await t.test('Anti-Cheat: players never receive question answer "a" or "a_img"', () => {
        const mockPlayerWs = { messages: [], readyState: 1, send(d) { this.messages.push(JSON.parse(d)); } };
        room.addPlayer('Игрок 1', '🦊', mockPlayerWs);

        const secretQuestion = {
            q: 'Назовите столицу Франции?',
            a: 'Париж (СЕКРЕТНЫЙ ОТВЕТ)',
            a_img: 'paris_secret.jpg',
            price: 300,
            type: 'normal'
        };

        room.startGame();
        room.selectQuestion(0, 0, secretQuestion);

        // Check host messages: host receives full answer
        const hostQuestionMsg = mockHostWs.messages.find(m => m.type === 'QUESTION_ACTIVE');
        assert.ok(hostQuestionMsg, 'Host must receive QUESTION_ACTIVE');
        assert.equal(hostQuestionMsg.payload.question.a, 'Париж (СЕКРЕТНЫЙ ОТВЕТ)');

        // Check player messages: answer fields MUST BE STRIPPED
        const playerQuestionMsg = mockPlayerWs.messages.find(m => m.type === 'QUESTION_ACTIVE');
        assert.ok(playerQuestionMsg, 'Player must receive QUESTION_ACTIVE');
        assert.equal(playerQuestionMsg.payload.question.q, 'Назовите столицу Франции?');
        assert.equal(playerQuestionMsg.payload.question.a, undefined, 'Anti-Cheat: question.a must NOT be present on player client');
        assert.equal(playerQuestionMsg.payload.question.a_img, undefined, 'Anti-Cheat: question.a_img must NOT be present on player client');
    });

    await t.test('Buzzer arbitration: locks first pressing player, rejects duplicates and handles judging', () => {
        const p1Ws = { messages: [], readyState: 1, send(d) { this.messages.push(JSON.parse(d)); } };
        const p2Ws = { messages: [], readyState: 1, send(d) { this.messages.push(JSON.parse(d)); } };

        const p1 = room.addPlayer('Игрок 1', '🦊', p1Ws).player;
        const p2 = room.addPlayer('Игрок 2', '🐼', p2Ws).player;

        room.startGame();
        room.selectQuestion(0, 0, { q: 'Вопрос на 500', a: 'Ответ', price: 500 });

        // Buzzer not active during reading
        const prematureBuzz = room.handleBuzz(p1.id);
        assert.equal(prematureBuzz.success, false);
        assert.equal(prematureBuzz.error, 'INVALID_ACTION');

        // Activate buzzer
        room.activateBuzzer();
        assert.equal(room.stateMachine.state, 'BUZZ_ACTIVE');

        // Player 1 buzzes first
        const buzz1 = room.handleBuzz(p1.id);
        assert.equal(buzz1.success, true);
        assert.equal(room.activeBuzzerPlayerId, p1.id);
        assert.equal(room.stateMachine.state, 'ANSWERING');

        // Player 2 attempts to buzz while Player 1 is answering -> rejected
        const buzz2 = room.handleBuzz(p2.id);
        assert.equal(buzz2.success, false);

        // Host judges Player 1 answer as WRONG
        const wrongJudge = room.judgeAnswer(false);
        assert.equal(wrongJudge.success, true);
        assert.equal(wrongJudge.correct, false);
        assert.equal(p1.score, -500, 'Score should decrease by 500 for wrong answer');
        assert.equal(wrongJudge.reopened, true, 'Buzzer should reopen for Player 2');

        // Player 1 cannot buzz again on the same question
        const buzz1Repeat = room.handleBuzz(p1.id);
        assert.equal(buzz1Repeat.success, false);

        // Player 2 can buzz now
        const buzz2SecondChance = room.handleBuzz(p2.id);
        assert.equal(buzz2SecondChance.success, true);
        assert.equal(room.activeBuzzerPlayerId, p2.id);

        // Host judges Player 2 answer as CORRECT
        const correctJudge = room.judgeAnswer(true);
        assert.equal(correctJudge.success, true);
        assert.equal(correctJudge.correct, true);
        assert.equal(p2.score, 500, 'Score should increase by 500 for correct answer');
        assert.equal(room.stateMachine.state, 'BOARD', 'Question finishes and returns to BOARD');
    });
});
