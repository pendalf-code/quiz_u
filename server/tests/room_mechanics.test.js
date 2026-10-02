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
        const mockPlayerWs1 = { messages: [], readyState: 1, send(d) { this.messages.push(JSON.parse(d)); } };
        const mockPlayerWs2 = { messages: [], readyState: 1, send(d) { this.messages.push(JSON.parse(d)); } };
        room.addPlayer('Игрок 1', '🦊', mockPlayerWs1);
        room.addPlayer('Игрок 2', '🐼', mockPlayerWs2);

        const secretQuestion = {
            q: 'Назовите столицу Франции?',
            a: 'Париж (СЕКРЕТНЫЙ ОТВЕТ)',
            a_img: 'paris_secret.jpg',
            price: 300,
            type: 'normal'
        };

        const startRes = room.startGame();
        assert.equal(startRes.success, true);
        room.selectQuestion(0, 0, secretQuestion);

        // Check host messages: host receives full answer
        const hostQuestionMsg = mockHostWs.messages.find(m => m.type === 'QUESTION_ACTIVE');
        assert.ok(hostQuestionMsg, 'Host must receive QUESTION_ACTIVE');
        assert.equal(hostQuestionMsg.payload.question.a, 'Париж (СЕКРЕТНЫЙ ОТВЕТ)');

        // Check player messages: answer fields MUST BE STRIPPED
        const playerQuestionMsg = mockPlayerWs1.messages.find(m => m.type === 'QUESTION_ACTIVE');
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

        const startRes = room.startGame();
        assert.equal(startRes.success, true);
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

    await t.test('Role Selection: host registration, duplicate prevention and reconnection (TASK-03)', () => {
        const hostWs1 = { messages: [], readyState: 1, send(d) { this.messages.push(JSON.parse(d)); } };
        const hostWs2 = { messages: [], readyState: 1, send(d) { this.messages.push(JSON.parse(d)); } };
        const reconnectWs = { messages: [], readyState: 1, send(d) { this.messages.push(JSON.parse(d)); } };
        const playerWs = { messages: [], readyState: 1, send(d) { this.messages.push(JSON.parse(d)); } };
        const playerWs2 = { messages: [], readyState: 1, send(d) { this.messages.push(JSON.parse(d)); } };

        // 1. Initial Host Registration
        const hostJoin1 = room.addPlayer('Ведущий Максим', '🎙️', hostWs1, null, 'host');
        assert.equal(hostJoin1.success, true);
        assert.equal(hostJoin1.role, 'host');
        assert.equal(hostJoin1.player.name, 'Ведущий Максим');
        assert.ok(hostJoin1.player.sessionToken, 'Host must receive a sessionToken');
        assert.equal(room.players.size, 0, 'Host should not be counted in player scoreboard Map');
        assert.ok(room.hostPlayer, 'room.hostPlayer must be set');

        // 2. Duplicate Host Rejection
        const hostJoinDuplicate = room.addPlayer('Другой Ведущий', '🎙️', hostWs2, null, 'host');
        assert.equal(hostJoinDuplicate.success, false);
        assert.equal(hostJoinDuplicate.error, 'HOST_ALREADY_EXISTS');
        assert.ok(hostJoinDuplicate.message.includes('уже занята'), 'Must explain that host role is taken');

        // 3. Duplicate Name Protection Between Host and Players
        const playerSameName = room.addPlayer('ведущий максим', '🐱', playerWs, null, 'player');
        assert.equal(playerSameName.success, false);
        assert.equal(playerSameName.error, 'NAME_ALREADY_TAKEN');

        // 4. Host Reconnection with Valid Session Token
        const hostReconnect = room.addPlayer('Ведущий Максим', '🎙️', reconnectWs, hostJoin1.player.sessionToken, 'host');
        assert.equal(hostReconnect.success, true);
        assert.equal(hostReconnect.isReconnect, true);
        assert.equal(hostReconnect.role, 'host');
        assert.equal(room.hostPlayer.ws, reconnectWs);

        // 5. Host Reconnection with Invalid Token Rejected
        const hostInvalidToken = room.addPlayer('Ведущий Максим', '🎙️', hostWs2, 'invalid-token-1234', 'host');
        assert.equal(hostInvalidToken.success, false);
        assert.equal(hostInvalidToken.error, 'HOST_ALREADY_EXISTS');

        // 6. Anti-Cheat: Host receives answers, Players do not
        const regularPlayerJoin = room.addPlayer('Игрок Борис', '🐱', playerWs, null, 'player');
        assert.equal(regularPlayerJoin.success, true);
        const regularPlayerJoin2 = room.addPlayer('Игрок Виктор', '🐶', playerWs2, null, 'player');
        assert.equal(regularPlayerJoin2.success, true);

        const secretQ = { q: 'Вопрос ведущему', a: 'Секретный ответ', price: 200, type: 'normal' };
        const startRes = room.startGame();
        assert.equal(startRes.success, true);
        room.selectQuestion(0, 0, secretQ);

        const hostQuestionMsg = reconnectWs.messages.find(m => m.type === 'QUESTION_ACTIVE');
        assert.ok(hostQuestionMsg, 'Mobile host must receive QUESTION_ACTIVE');
        assert.equal(hostQuestionMsg.payload.question.a, 'Секретный ответ', 'Host must see secret answer');

        const playerQuestionMsg = playerWs.messages.find(m => m.type === 'QUESTION_ACTIVE');
        assert.ok(playerQuestionMsg, 'Player must receive QUESTION_ACTIVE');
        assert.equal(playerQuestionMsg.payload.question.a, undefined, 'Player must NOT see secret answer');
    });

    await t.test('TASK-05: Start Game Validation (Host requirement and minimum 2 players)', () => {
        // A. Room requiring mobile host (isHostOnPC: false) without host
        const noHostRoom = new Room('NOHS', mockHostWs, { isHostOnPC: false, requireMobileHost: true });
        const p1Ws = { messages: [], readyState: 1, send(d) {} };
        const p2Ws = { messages: [], readyState: 1, send(d) {} };
        noHostRoom.addPlayer('Игрок 1', '🐱', p1Ws);
        noHostRoom.addPlayer('Игрок 2', '🐶', p2Ws);

        assert.equal(noHostRoom.hasHost(), false);
        const startNoHost = noHostRoom.startGame();
        assert.equal(startNoHost.success, false);
        assert.equal(startNoHost.errorCode, 'HOST_REQUIRED');
        assert.ok(startNoHost.message.includes('требуется ведущий'));

        // When mobile host connects, start succeeds
        const hostWs = { messages: [], readyState: 1, send(d) {} };
        noHostRoom.addPlayer('Ведущий', '🎙️', hostWs, null, 'host');
        assert.equal(noHostRoom.hasHost(), true);
        const startWithHost = noHostRoom.startGame();
        assert.equal(startWithHost.success, true);

        // B. Room with host but fewer than 2 players
        const underpopulatedRoom = new Room('FEWP', mockHostWs, { isHostOnPC: true });
        assert.equal(underpopulatedRoom.getActivePlayersCount(), 0);
        const startZero = underpopulatedRoom.startGame();
        assert.equal(startZero.success, false);
        assert.equal(startZero.errorCode, 'NOT_ENOUGH_PLAYERS');
        assert.ok(startZero.message.includes('минимум 2 игрока'));

        // 1 player is still not enough
        underpopulatedRoom.addPlayer('Один Игрок', '🦊', p1Ws);
        assert.equal(underpopulatedRoom.getActivePlayersCount(), 1);
        const startOne = underpopulatedRoom.startGame();
        assert.equal(startOne.success, false);
        assert.equal(startOne.errorCode, 'NOT_ENOUGH_PLAYERS');

        // 2 players satisfy condition
        underpopulatedRoom.addPlayer('Второй Игрок', '🐼', p2Ws);
        assert.equal(underpopulatedRoom.getActivePlayersCount(), 2);
        const startTwo = underpopulatedRoom.startGame();
        assert.equal(startTwo.success, true);

        // C. Snapshot exposes readiness metadata
        const snapshot = underpopulatedRoom.getStateSnapshot();
        assert.equal(typeof snapshot.hasHost, 'boolean');
        assert.equal(snapshot.activePlayersCount, 2);
        assert.equal(snapshot.canStartGame, true);

        // D. Local Host Toggle on PC
        const toggleRoom = new Room('TOGG', mockHostWs, { isHostOnPC: false, requireMobileHost: true });
        toggleRoom.addPlayer('Игрок 1', '🐱', p1Ws);
        toggleRoom.addPlayer('Игрок 2', '🐶', p2Ws);
        assert.equal(toggleRoom.hasHost(), false);
        toggleRoom.setHostOnPC(true);
        assert.equal(toggleRoom.hasHost(), true);
        assert.equal(toggleRoom.isHostOnPC, true);
        const toggleStart = toggleRoom.startGame();
        assert.equal(toggleStart.success, true);
    });
});
