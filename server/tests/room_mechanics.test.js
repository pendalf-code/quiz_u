const test = require('node:test');
const assert = require('node:assert/strict');
const Room = require('../src/Room');
const { ERROR_CODES, MSG_TYPES } = require('../src/protocol');

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

    await t.test('TASK-05: Start Game Validation (Host requirement and minimum 1 player)', () => {
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

        // B. Room with host but fewer than 1 player
        const underpopulatedRoom = new Room('FEWP', mockHostWs, { isHostOnPC: true });
        assert.equal(underpopulatedRoom.getActivePlayersCount(), 0);
        const startZero = underpopulatedRoom.startGame();
        assert.equal(startZero.success, false);
        assert.equal(startZero.errorCode, 'NOT_ENOUGH_PLAYERS');
        assert.ok(startZero.message.includes('минимум 1 игрок'));

        // 1 player satisfies condition
        underpopulatedRoom.addPlayer('Один Игрок', '🦊', p1Ws);
        assert.equal(underpopulatedRoom.getActivePlayersCount(), 1);
        const startOne = underpopulatedRoom.startGame();
        assert.equal(startOne.success, true);

        // 2 players also satisfy condition
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

        // Disabling Local Host on PC
        toggleRoom.setHostOnPC(false);
        assert.equal(toggleRoom.hasHost(), false);
        assert.equal(toggleRoom.isHostOnPC, false);
        const disabledCheck = toggleRoom.canStartGame();
        assert.equal(disabledCheck.canStart, false);
        assert.equal(disabledCheck.errorCode, ERROR_CODES.HOST_REQUIRED);
    });

    await t.test('TASK-01: Game and Timer Settings (Reading, Thinking, Answer Times & Penalty Modes)', () => {
        const settingsWs = { messages: [], readyState: 1, send(d) { this.messages.push(JSON.parse(d)); } };
        const testRoom = new Room('SETT', settingsWs, {
            readingTime: 5,
            thinkingTime: 25,
            answerTime: 4,
            penaltyEnabled: true,
            penaltyMode: 'nominal',
            penaltyFixedAmount: 100
        });

        // 1. Initial options initialization
        assert.equal(testRoom.options.readingTime, 5);
        assert.equal(testRoom.options.thinkingTime, 25);
        assert.equal(testRoom.options.answerTime, 4);
        assert.equal(testRoom.options.penaltyEnabled, true);
        assert.equal(testRoom.options.penaltyMode, 'nominal');

        // 2. Update options via room.updateOptions()
        testRoom.updateOptions({
            readingTime: 0,
            thinkingTime: 45,
            answerTime: 7,
            penaltyEnabled: true,
            penaltyMode: 'fixed',
            penaltyFixedAmount: 150
        });

        assert.equal(testRoom.options.readingTime, 0);
        assert.equal(testRoom.options.thinkingTime, 45);
        assert.equal(testRoom.options.answerTime, 7);
        assert.equal(testRoom.options.penaltyMode, 'fixed');
        assert.equal(testRoom.options.penaltyFixedAmount, 150);

        const updateMsg = settingsWs.messages.find(m => m.type === 'ROOM_SETTINGS_UPDATED');
        assert.ok(updateMsg, 'Must broadcast ROOM_SETTINGS_UPDATED');
        assert.equal(updateMsg.payload.options.penaltyFixedAmount, 150);

        // 3. Penalty calculation: fixed mode
        testRoom.currentCost = 300;
        assert.equal(testRoom.getPenaltyAmount(), 150, 'Fixed penalty amount should be 150, ignoring 300 question cost');

        // 4. Penalty calculation: nominal mode
        testRoom.updateOptions({ penaltyMode: 'nominal' });
        assert.equal(testRoom.getPenaltyAmount(), 300, 'Nominal penalty should equal current cost 300');

        // 5. Penalty calculation: penalty disabled
        testRoom.updateOptions({ penaltyEnabled: false });
        assert.equal(testRoom.getPenaltyAmount(), 0, 'Disabled penalty should return 0 points deduction');

        // 6. Penalty deduction in judgeAnswer (wrong answer)
        const pWs = { messages: [], readyState: 1, send(d) {} };
        const pJoin = testRoom.addPlayer('Штрафник', '🤖', pWs);
        const pId = pJoin.player.id;
        testRoom.updatePlayerScore(pId, 500);
        assert.equal(testRoom.players.get(pId).score, 500);

        // A. Wrong answer with disabled penalty -> score remains 500
        testRoom.stateMachine.state = 'BUZZ_ACTIVE';
        testRoom.handleBuzz(pId);
        testRoom.judgeAnswer(false);
        assert.equal(testRoom.players.get(pId).score, 500);

        // B. Wrong answer with nominal penalty (300) -> score becomes 200
        testRoom.updateOptions({ penaltyEnabled: true, penaltyMode: 'nominal' });
        testRoom.stateMachine.state = 'BUZZ_ACTIVE';
        testRoom.buzzedPlayers.clear();
        testRoom.handleBuzz(pId);
        testRoom.judgeAnswer(false);
        assert.equal(testRoom.players.get(pId).score, 200);

        // C. Wrong answer with fixed penalty (100) -> score becomes 100
        testRoom.updateOptions({ penaltyMode: 'fixed', penaltyFixedAmount: 100 });
        testRoom.stateMachine.state = 'BUZZ_ACTIVE';
        testRoom.buzzedPlayers.clear();
        testRoom.handleBuzz(pId);
        testRoom.judgeAnswer(false);
        assert.equal(testRoom.players.get(pId).score, 100);

        // 7. Reading time 0: immediate buzzer activation without timer delay
        testRoom.updateOptions({ readingTime: 0 });
        testRoom.stateMachine.state = 'BOARD';
        testRoom.selectQuestion(0, 0, { q: 'Q', a: 'A', price: 100 });
        assert.equal(testRoom.stateMachine.state, 'BUZZ_ACTIVE', 'State must immediately be BUZZ_ACTIVE when readingTime is 0');
    });

    await t.test('Disconnect cleanup: removePlayer handles socket and playerId, resets active buzzer and cleans question on finish', () => {
        const p1Ws = { messages: [], readyState: 1, send(d) {} };
        const p2Ws = { messages: [], readyState: 1, send(d) {} };
        const join1 = room.addPlayer('Игрок 1', '🐱', p1Ws);
        const join2 = room.addPlayer('Игрок 2', '🐶', p2Ws);
        const p1Id = join1.player.id;
        const p2Id = join2.player.id;

        // Player 1 disconnects by socket
        room.removePlayer(p1Ws);
        assert.equal(room.players.get(p1Id).isConnected, false);
        assert.equal(room.players.get(p1Id).ws, null);

        // Player 2 disconnects by ID
        room.removePlayer(p2Id);
        assert.equal(room.players.get(p2Id).isConnected, false);
        assert.equal(room.players.get(p2Id).ws, null);

        // Reconnect player 1 & 2
        p1Ws.readyState = 1;
        join1.player.isConnected = true;
        join1.player.ws = p1Ws;
        p2Ws.readyState = 1;
        join2.player.isConnected = true;
        join2.player.ws = p2Ws;

        room.stateMachine.state = 'BUZZ_ACTIVE';
        room.handleBuzz(p1Id);
        assert.equal(room.activeBuzzerPlayerId, p1Id);
        assert.ok(room.answerTimer);

        // Disconnecting active buzzer player resets buzzer and reopens for player 2
        room.removePlayer(p1Ws);
        assert.equal(room.activeBuzzerPlayerId, null);
        assert.equal(room.answerTimer, null);
        assert.equal(room.stateMachine.state, 'BUZZ_ACTIVE');

        // Finish question returns state to BOARD and cleans currentQuestion
        room.currentQuestion = { q: 'Вопрос', a: 'Ответ', price: 200 };
        room.finishQuestion();
        assert.equal(room.currentQuestion, null);
        assert.equal(room.stateMachine.state, 'BOARD');
    });

    await t.test('Auto-pause on disconnect and selectQuestion resilience', () => {
        const p1Ws = { messages: [], readyState: 1, send(d) { this.messages.push(JSON.parse(d)); } };
        const p2Ws = { messages: [], readyState: 1, send(d) { this.messages.push(JSON.parse(d)); } };
        const p1 = room.addPlayer('Плеер 1', '🐱', p1Ws).player;
        const p2 = room.addPlayer('Плеер 2', '🐶', p2Ws).player;
        assert.doesNotThrow(() => {
            room.selectQuestion(0, 0, { q: 'Вопрос', a: 'Ответ', cost: 100 });
        });
        assert.equal(room.currentCost, 100);
        room.removePlayer(p1Ws);
        assert.equal(room.isPaused, true, 'Room must be paused on disconnect during gameplay');
        const pauseMsg = mockHostWs.messages.find(m => m.type === 'GAME_PAUSED');
        assert.ok(pauseMsg, 'GAME_PAUSED message must be broadcast');
        assert.equal(pauseMsg.payload.isPaused, true);
        assert.equal(pauseMsg.payload.reason, 'disconnect');
        assert.equal(pauseMsg.payload.disconnectedPlayerName, 'Плеер 1');
    });

    await t.test('LAN Mode Mechanics: No Auto Deductions, Cat Target, Auction Leader & Open Auction', () => {
        const lanWs = { messages: [], readyState: 1, send(d) { this.messages.push(JSON.parse(d)); } };
        const p1Ws = { messages: [], readyState: 1, send(d) { this.messages.push(JSON.parse(d)); } };
        const p2Ws = { messages: [], readyState: 1, send(d) { this.messages.push(JSON.parse(d)); } };

        // 1. LAN Mode: No auto deductions when penaltyEnabled is false
        const lanRoom = new Room('LAN1', lanWs, { penaltyEnabled: false, readingTime: 0, answerTime: 5 });
        const p1 = lanRoom.addPlayer('Команда 1', '🦊', p1Ws).player;
        const p2 = lanRoom.addPlayer('Команда 2', '🐼', p2Ws).player;
        lanRoom.startGame();

        lanRoom.selectQuestion(0, 0, { q: 'Вопрос 1', a: 'Ответ 1', price: 300, type: 'normal' });
        lanRoom.activateBuzzer();

        // Player 1 buzzes and answers incorrectly
        lanRoom.handleBuzz(p1.id);
        const wrongJudge = lanRoom.judgeAnswer(false);
        assert.equal(wrongJudge.success, true);
        assert.equal(p1.score, 0, 'In LAN mode, points must NOT be automatically deducted on wrong answer');

        // Host manually adjusts score using +300 / -300
        lanRoom.updatePlayerScore(p1.id, 300);
        assert.equal(p1.score, 300, 'Host can manually add score');
        lanRoom.updatePlayerScore(p1.id, -300);
        assert.equal(p1.score, 0, 'Host can manually subtract score');

        // Player 2 buzzes and times out
        lanRoom.handleBuzz(p2.id);
        lanRoom.handleAnswerTimeout();
        assert.equal(p2.score, 0, 'In LAN mode, points must NOT be automatically deducted on timeout');

        // 2. Cat in Bag: buzzer only for recipient team
        lanRoom.selectQuestion(0, 1, { q: 'Кот в мешке', a: 'Секрет', price: 400, type: 'cat' });
        lanRoom.setCatTarget(p2.id);
        lanRoom.activateBuzzer();

        // Player 1 (not recipient) tries to buzz -> rejected
        const p1CatBuzz = lanRoom.handleBuzz(p1.id);
        assert.equal(p1CatBuzz.success, false, 'Other players must NOT be allowed to buzz on Cat in Bag');

        // Player 2 (recipient) can buzz
        const p2CatBuzz = lanRoom.handleBuzz(p2.id);
        assert.equal(p2CatBuzz.success, true, 'Recipient team can buzz on Cat in Bag');
        lanRoom.finishQuestion();

        // 3. Auction for Leader: only leader team gets buzzer
        lanRoom.selectQuestion(0, 2, { q: 'Аукцион за лидера', a: 'Победа', price: 500, type: 'auction_leader' });
        lanRoom.setAuctionLeader(p1.id, 700);
        lanRoom.activateBuzzer();

        // Player 2 tries to buzz -> rejected
        const p2LeaderBuzz = lanRoom.handleBuzz(p2.id);
        assert.equal(p2LeaderBuzz.success, false, 'Non-leader teams must NOT have buzzer');

        // Player 1 (leader) can buzz
        const p1LeaderBuzz = lanRoom.handleBuzz(p1.id);
        assert.equal(p1LeaderBuzz.success, true, 'Leader team can buzz');
        assert.equal(lanRoom.currentCost, 700);
        lanRoom.finishQuestion();

        // 4. Open Auction: bidding teams type answers instead of buzzer
        lanRoom.selectQuestion(0, 3, { q: 'Общий аукцион', a: 'Золото', price: 200, type: 'auction' });
        lanRoom.setAuctionBets({ [p1.id]: 300, [p2.id]: 400 });
        lanRoom.startAuctionAnswer([p1.id, p2.id]);

        assert.equal(lanRoom.stateMachine.state, 'AUCTION_ANSWERING');

        // Bidding players submit text answers
        const ans1 = lanRoom.handleAnswerSubmit(p1.id, 'Мой ответ');
        assert.equal(ans1.success, true);
        assert.equal(ans1.isAuction, true);

        const lastHostMsg = lanWs.messages[lanWs.messages.length - 1];
        assert.equal(lastHostMsg.type, 'ANSWER_SUBMITTED');
        assert.equal(lastHostMsg.payload.answerText, 'Мой ответ');
        assert.equal(lastHostMsg.payload.bet, 300);
        assert.equal(lastHostMsg.payload.isAuction, true);
    });
});
