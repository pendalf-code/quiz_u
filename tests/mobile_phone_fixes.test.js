const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Room = require('../server/src/Room');
const { MSG_TYPES } = require('../server/src/protocol');
const NetworkClient = require('../js/net/NetworkClient');

test('Mobile Phone Bugs Verification Suite', async (t) => {
    const rootDir = path.join(__dirname, '..');
    const mobileHtml = fs.readFileSync(path.join(rootDir, 'mobile', 'index.html'), 'utf8');
    const mobileJs = fs.readFileSync(path.join(rootDir, 'mobile', 'mobile.js'), 'utf8');
    const gameJs = fs.readFileSync(path.join(rootDir, 'js', 'game.js'), 'utf8');

    await t.test('1. Restart Lobby Button exists in mobile HTML and is bound in mobile JS', () => {
        assert.ok(mobileHtml.includes('id="btn-host-restart-lobby"'), '#btn-host-restart-lobby must exist in mobile HTML');
        assert.ok(mobileJs.includes("btnHostRestartLobby: document.getElementById('btn-host-restart-lobby')"), 'btnHostRestartLobby must be bound in elements');
        assert.ok(mobileJs.includes('netClient.resetToLobby()'), 'mobile JS must call netClient.resetToLobby()');
    });

    await t.test('2. NetworkClient defines resetToLobby method sending HOST_RESET_TO_LOBBY', () => {
        const client = new NetworkClient({ url: 'ws://127.0.0.1:8080' });
        assert.equal(typeof client.resetToLobby, 'function', 'client.resetToLobby must be a function');
        assert.ok(MSG_TYPES.HOST_RESET_TO_LOBBY, 'HOST_RESET_TO_LOBBY must be defined in MSG_TYPES');
    });

    await t.test('3. Server Room resetToLobby resets state, round index, question used flags and scores', () => {
        let sentMsgs = [];
        const mockHostWs = { readyState: 1, send: (m) => sentMsgs.push(JSON.parse(m)) };
        const room = new Room('TEST', mockHostWs);
        const mockPack = [{
            roundIndex: 0,
            themes: [{
                name: 'Тема 1',
                questions: [{ cost: 100, q: 'Q1?', a: 'A1', used: true }]
            }]
        }];
        room.setPack(mockPack);
        room.addPlayer('Игрок 1', '🐱', { readyState: 1, send: () => {} });
        const p1 = Array.from(room.players.values())[0];
        p1.score = 500;

        // Simulate game over
        room.stateMachine.state = 'GAME_OVER';

        // Reset to lobby
        room.resetToLobby();
        assert.equal(room.stateMachine.state, 'LOBBY', 'State must be LOBBY');
        assert.equal(room.currentRoundIndex, 0, 'Round index must be 0');
        assert.equal(p1.score, 0, 'Player score must be reset');
        assert.equal(room.currentPack[0].themes[0].questions[0].used, false, 'Question used flag must be reset');

        const stateMsg = sentMsgs.find(m => m.type === MSG_TYPES.ROOM_STATE && m.payload.state === 'LOBBY');
        assert.ok(stateMsg, 'Must broadcast ROOM_STATE with state LOBBY');
    });

    await t.test('4. Server Room startGame from GAME_OVER resets used questions and transitions to BOARD', () => {
        const mockHostWs = { readyState: 1, send: () => {} };
        const room = new Room('TEST', mockHostWs, { isHostOnPC: true });
        room.setHostOnPC(true);
        const mockPack = [{
            roundIndex: 0,
            themes: [{
                name: 'Тема 1',
                questions: [{ cost: 100, q: 'Q1?', a: 'A1', used: true }]
            }]
        }];
        room.setPack(mockPack);
        room.addPlayer('Игрок 1', '🐱', { readyState: 1, send: () => {} });

        room.stateMachine.state = 'GAME_OVER';
        const res = room.startGame();
        assert.equal(res.success, true);
        assert.equal(room.stateMachine.state, 'BOARD', 'State must transition to BOARD');
        assert.equal(room.currentPack[0].themes[0].questions[0].used, false, 'Question used flag must be reset');
    });

    await t.test('5. Host Board Panel is NOT displayed in LOBBY state', () => {
        assert.ok(mobileJs.includes("const isBoardState = (currentRoomState === 'BOARD') && !isQuestionActive;"), 'Board state must require currentRoomState === BOARD');
        assert.ok(!mobileJs.includes("(!isQuestionActive && (currentRoomState === 'BOARD' || state.boardData))"), 'Must not show board panel merely on state.boardData truthiness');
    });

    await t.test('6. Player state.selfPlayer is populated with id on room_state and player_joined', () => {
        assert.ok(mobileJs.includes('state.selfPlayer = Object.assign({}, state.selfPlayer || {}, payload.self);'), 'Must sync payload.self to state.selfPlayer');
        assert.ok(mobileJs.includes('state.selfPlayer = Object.assign({}, state.selfPlayer, payload.player);'), 'Must sync payload.player to state.selfPlayer');
    });

    await t.test('7. Desktop openQuestion does not loop selectQuestion when triggered by network', () => {
        const normGameJs = gameJs.replace(/\r\n/g, '\n');
        assert.ok(normGameJs.includes('function openQuestion(themeIdx, qIdx, element, event, skipSplash = false, overrideQuestion = null, isFromNetwork = false)'), 'openQuestion must accept isFromNetwork parameter');
        assert.ok(normGameJs.includes('if (!isFromNetwork) {\n            hostNetworkClient.selectQuestion(currentThemeIdx, currentQuestionIdx, question);\n        }'), 'selectQuestion must only be sent when !isFromNetwork');
        assert.ok(normGameJs.includes('openQuestionFromHostPhone(themeIdx, questionIdx, targetCell, payload.question);'), 'Network listener opens the question through the blink animation');
        assert.ok(normGameJs.includes("openQuestion(themeIdx, questionIdx, cell || document.createElement('div'), null, false, question, true);"), 'Network open must pass isFromNetwork = true');
    });
});
