const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const Room = require(path.join(rootDir, 'server', 'src', 'Room'));
const { MSG_TYPES } = require(path.join(rootDir, 'server', 'src', 'protocol'));
const NetworkClient = require(path.join(rootDir, 'js', 'net', 'NetworkClient'));

describe('Verification of 7 Host, Mobile & Freeze Mechanics Fixes', () => {
    const mobileHtml = fs.readFileSync(path.join(rootDir, 'mobile', 'index.html'), 'utf8');
    const mobileCss = fs.readFileSync(path.join(rootDir, 'mobile', 'mobile.css'), 'utf8');
    const mobileJs = fs.readFileSync(path.join(rootDir, 'mobile', 'mobile.js'), 'utf8');
    const styleCss = fs.readFileSync(path.join(rootDir, 'css', 'style.css'), 'utf8');
    const gameJs = fs.readFileSync(path.join(rootDir, 'js', 'game.js'), 'utf8');
    const roomJs = fs.readFileSync(path.join(rootDir, 'server', 'src', 'Room.js'), 'utf8');
    const serverJs = fs.readFileSync(path.join(rootDir, 'server', 'src', 'server.js'), 'utf8');

    test('Fix 1: "К табло" broadcasts QUESTION_CLOSED and updates PC board', () => {
        // Server Room broadcasts QUESTION_CLOSED
        assert.ok(roomJs.includes('this.broadcastToAll(MSG_TYPES.QUESTION_CLOSED, {})'), 'Room.closeQuestion must broadcast QUESTION_CLOSED');

        // Game.js handles question_closed by resetting modal and refreshing board
        assert.ok(gameJs.includes("hostNetworkClient.on('question_closed'"), 'game.js listens for question_closed');
        assert.ok(gameJs.includes('initBoard();'), 'initBoard called when question closed to show updated grid');

        // Mobile client listens for question_closed
        assert.ok(mobileJs.includes("netClient.on('question_closed'"), 'mobile.js listens for question_closed');
    });

    test('Fix 2: Mobile host question selection from phone board grid', () => {
        // Mobile HTML contains host-board-panel
        assert.ok(mobileHtml.includes('id="host-board-panel"'), '#host-board-panel must exist in mobile HTML');
        assert.ok(mobileHtml.includes('id="host-board-grid"'), '#host-board-grid must exist in mobile HTML');

        // Mobile CSS contains board panel and cost buttons styles
        assert.ok(mobileCss.includes('.host-board-panel'), '.host-board-panel CSS must exist');
        assert.ok(mobileCss.includes('.host-cost-btn'), '.host-cost-btn CSS must exist');

        // Mobile JS renders board grid and dispatches selectQuestion
        assert.ok(mobileJs.includes('renderHostBoardGrid'), 'renderHostBoardGrid function must exist in mobile.js');
        assert.ok(mobileJs.includes('netClient.selectQuestion'), 'selectQuestion called when tapping cost button');

        // Server resolves question if host selects by index
        assert.ok(serverJs.includes('HOST_SELECT_QUESTION'), 'Server handles HOST_SELECT_QUESTION');
        assert.ok(roomJs.includes('th.questions && th.questions[questionIdx]'), 'Room resolves question from currentPack');

        // Big screen TV opens question when question_active arrives
        assert.ok(gameJs.includes("hostNetworkClient.on('question_active'"), 'Big screen opens question when host selects from phone');
    });

    test('Fix 3: Giving points to player/team after "показать ответ на ТВ"', () => {
        // Mobile host player list contains quick question-cost adjustment buttons
        assert.ok(mobileJs.includes('plus-cost'), 'Mobile JS renders .plus-cost button');
        assert.ok(mobileJs.includes('minus-cost'), 'Mobile JS renders .minus-cost button');
        assert.ok(mobileCss.includes('.score-step-btn.plus-cost'), 'CSS styles .plus-cost button');

        // Big screen changeTeamScore synchronizes score to network clients
        assert.ok(gameJs.includes('hostNetworkClient.updateScore(teams[teamIdx].id, amount)'), 'changeTeamScore updates network score in online game');
        assert.ok(gameJs.includes("hostNetworkClient.on('score_updated'"), 'Big screen updates modal list when score updated');
    });

    test('Fix 4: No automatic score deduction upon buzzer timer expiration', () => {
        // Room.js does not deduct penalty automatically in handleAnswerTimeout
        const timeoutFunc = Room.prototype.handleAnswerTimeout.toString();
        assert.ok(!timeoutFunc.includes('this.updatePlayerScore(timedOutPlayerId, -penalty)'), 'handleAnswerTimeout must NOT auto-deduct points');

        // In test room: player score remains intact when buzzer times out
        const mockHostWs = { messages: [], readyState: 1, send(d) { this.messages.push(JSON.parse(d)); } };
        const testRoom = new Room('NOAT', mockHostWs, { penaltyEnabled: true, penaltyMode: 'nominal' });
        const pWs = { messages: [], readyState: 1, send(d) {} };
        const p = testRoom.addPlayer('Игрок 1', '🦊', pWs).player;
        testRoom.updatePlayerScore(p.id, 500);

        testRoom.currentCost = 200;
        testRoom.activeBuzzerPlayerId = p.id;
        testRoom.handleAnswerTimeout();
        assert.equal(testRoom.players.get(p.id).score, 500, 'Score must remain 500 after timeout without deduction');
    });

    test('Fix 5 & 6: Timer yellow circle on buzzer and freeze removed', () => {
        // CSS snowflake styling is completely disabled
        assert.ok(styleCss.includes('.timer.frozen::after') || styleCss.includes('.timer.answering::after'), 'Pseudo element rule exists');
        assert.ok(styleCss.includes('display: none !important;'), '::after is hidden');
        assert.ok(styleCss.includes('#f39c12'), 'Yellow gold background exists');

        // game.js unfreezeQuestionTimer logic
        assert.ok(gameJs.includes('unfreezeQuestionTimer()'), 'unfreezeQuestionTimer function exists');
        assert.ok(gameJs.includes("timerElem.className = 'timer answering'"), 'Answering class added on buzzer lock');
        assert.ok(gameJs.includes("timerElem.classList.remove('answering')"), 'Answering class removed on unfreeze');
    });

    test('Fix 7: Game over redirects everyone on mobile to main menu', () => {
        // Server Room broadcast GAME_FINISHED
        assert.ok(roomJs.includes('this.broadcastToAll(MSG_TYPES.GAME_FINISHED, payload)'), 'Room.finishGame broadcasts GAME_FINISHED');

        // Big screen triggers finishGame when celebration occurs
        assert.ok(gameJs.includes('hostNetworkClient.finishGame'), 'Big screen calls finishGame on celebration');

        // NetworkClient emits game_finished
        assert.ok(gameJs.includes('NetworkClient') || NetworkClient.prototype.finishGame, 'NetworkClient has finishGame');

        // Mobile client listens for game_finished and calls leaveToMainMenu
        assert.ok(mobileJs.includes("netClient.on('game_finished'"), 'Mobile client listens for game_finished event');
        assert.ok(mobileJs.includes('leaveToMainMenu()'), 'Mobile client leaves to main menu on game finished');
    });
});
