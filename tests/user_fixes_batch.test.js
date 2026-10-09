const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Room = require('../server/src/Room');
const { MessageType } = require('../server/src/protocol');

const rootDir = path.resolve(__dirname, '..');

describe('User 9 Fixes & Features Verification Suite', () => {
    const gameJs = fs.readFileSync(path.join(rootDir, 'js', 'game.js'), 'utf8');
    const mobileHtml = fs.readFileSync(path.join(rootDir, 'mobile', 'index.html'), 'utf8');
    const mobileJs = fs.readFileSync(path.join(rootDir, 'mobile', 'mobile.js'), 'utf8');
    const mobileCss = fs.readFileSync(path.join(rootDir, 'mobile', 'mobile.css'), 'utf8');
    const roomJs = fs.readFileSync(path.join(rootDir, 'server', 'src', 'Room.js'), 'utf8');
    const protocolJs = fs.readFileSync(path.join(rootDir, 'server', 'src', 'protocol.js'), 'utf8');

    test('1. Buzzer expiration timer clamping: no negative timer (-1, -2), freeze preserved', () => {
        // Clamping timeLeft >= 0 in startTimer countdown
        assert.ok(gameJs.includes('timeLeft = Math.max(0, timeLeft - 1);'), 'startTimer decrements with Math.max(0, timeLeft - 1)');
        assert.ok(gameJs.includes('if (timeLeft <= 0)'), 'startTimer stops when timeLeft <= 0');
    });

    test('2. Board desync fix: question is permanently marked used on big screen when opened via network', () => {
        assert.ok(gameJs.includes('gameData[currentRoundIndex].themes[themeIdx].questions[qIdx].used = true;'), 'openQuestion marks gameData question as used');
        assert.ok(gameJs.includes('hostNetworkClient.on(\'question_closed\''), 'game.js handles question_closed to re-render board');
    });

    test('3. Timer freeze indicator on buzzer press: snowflake and frozen styles applied', () => {
        assert.ok(gameJs.includes("timerElem.className = 'timer frozen'"), 'Timer gets frozen class on buzz_locked');
        assert.ok(mobileCss.includes('.giant-buzzer-btn.state-paused'), 'Buzzer has paused styling');
    });

    test('4. Host phone features: "Пропустить раунд", "Передать ход", "Прибавить всем очки"', () => {
        // Elements in HTML
        assert.ok(mobileHtml.includes('id="btn-host-skip-round"'), 'Host has "Пропустить раунд" button');
        assert.ok(mobileHtml.includes('id="btn-host-pass-turn"'), 'Host has "Передать ход" button');
        assert.ok(mobileHtml.includes('id="btn-host-add-all-scores"'), 'Host has "Прибавить всем очки" button');
        assert.ok(mobileHtml.includes('id="modal-host-all-scores"'), 'Host has modal for adding points to all teams');

        // Protocol messages
        assert.ok(protocolJs.includes('HOST_SKIP_ROUND'), 'Protocol defines HOST_SKIP_ROUND');
        assert.ok(protocolJs.includes('HOST_PASS_TURN'), 'Protocol defines HOST_PASS_TURN');
        assert.ok(protocolJs.includes('HOST_UPDATE_ALL_SCORES'), 'Protocol defines HOST_UPDATE_ALL_SCORES');

        // Room methods
        assert.ok(typeof Room.prototype.skipRound === 'function', 'Room implements skipRound');
        assert.ok(typeof Room.prototype.passTurn === 'function', 'Room implements passTurn');
        assert.ok(typeof Room.prototype.updateAllScores === 'function', 'Room implements updateAllScores');

        // Room behavior test for updateAllScores
        const mockHost = { readyState: 1, send() {} };
        const r = new Room('TEST', mockHost);
        const p1 = r.addPlayer('T1', '🐱', { readyState: 1, send() {} }).player;
        const p2 = r.addPlayer('T2', '🦊', { readyState: 1, send() {} }).player;
        r.updateAllScores(250);
        assert.strictEqual(p1.score, 250);
        assert.strictEqual(p2.score, 250);
    });

    test('5. Removed "Открыть баззер" from host phone', () => {
        assert.ok(!mobileHtml.includes('id="btn-host-open-buzzer"'), '#btn-host-open-buzzer is removed from mobile HTML');
        assert.ok(!mobileJs.includes('elements.btnHostOpenBuzzer'), 'No btnHostOpenBuzzer references in mobile.js');
    });

    test('6. Host judging controls: only accept, reject without penalty, and reject with penalty', () => {
        assert.ok(mobileHtml.includes('id="btn-host-judge-correct"'), 'btn-host-judge-correct exists');
        assert.ok(mobileHtml.includes('id="btn-host-judge-wrong"'), 'btn-host-judge-wrong exists');
        assert.ok(mobileHtml.includes('id="btn-host-judge-wrong-penalty"'), 'btn-host-judge-wrong-penalty exists');
        assert.ok(!mobileHtml.includes('id="btn-host-add-score"'), 'Fixed +-100 removed from host controls');
        assert.ok(!mobileHtml.includes('id="btn-host-subtract-score"'), 'Fixed +-100 removed from host controls');

        // Server judgeAnswer supports penalty parameter
        const mockHost = { readyState: 1, send() {} };
        const r = new Room('JDG1', mockHost, { penaltyEnabled: true, penaltyMode: 'nominal' });
        const p = r.addPlayer('P1', '🐱', { readyState: 1, send() {} }).player;
        r.activeBuzzerPlayerId = p.id;
        r.currentCost = 300;
        // Test reject with penalty
        r.judgeAnswer(false, true);
        assert.strictEqual(p.score, -300, 'Score is deducted by 300 on reject with penalty');
    });

    test('7. Host "Игроки и счет": custom N points input and buttons, no +-100 step buttons', () => {
        assert.ok(mobileJs.includes('score-n-input'), 'Custom N points input present in mobile JS');
        assert.ok(mobileJs.includes('btn-score-add'), '+N button present in mobile JS');
        assert.ok(mobileJs.includes('btn-score-sub'), '-N button present in mobile JS');
        assert.ok(!mobileJs.includes("title=\"Снять 100\""), 'Hardcoded -100 button removed');
        assert.ok(!mobileJs.includes("title=\"Добавить 100\""), 'Hardcoded +100 button removed');
    });

    test('8. Host screen displays game theme name', () => {
        assert.ok(roomJs.includes('this.currentThemeName = themeName'), 'Room sets currentThemeName on selectQuestion');
        assert.ok(mobileJs.includes('state.activeThemeName = payload.themeName'), 'Mobile JS saves themeName on question_active');
        assert.ok(mobileJs.includes('meta.themeName || state.activeThemeName'), 'Host screen displays theme name');
    });

    test('9. Pause mechanic: game stops for players and prevents buzzing', () => {
        const mockHost = { readyState: 1, send() {} };
        const r = new Room('PAUS', mockHost);
        const p = r.addPlayer('PlayerBuzz', '🐱', { readyState: 1, send() {} }).player;
        r.stateMachine.state = 'BUZZ_ACTIVE';
        r.togglePause(true);
        assert.strictEqual(r.isPaused, true);

        // Buzz attempt while paused is rejected
        const res = r.handleBuzz(p.id);
        assert.strictEqual(res.success, false);
        assert.strictEqual(res.reason, 'PAUSED');

        // Mobile JS handles game_paused event
        assert.ok(mobileJs.includes("netClient.on('game_paused'"), 'mobile.js handles game_paused event');
        assert.ok(mobileJs.includes('state.isAnswerTimerPaused = state.isPaused;'), 'mobile.js pauses countdown timer during pause');
    });
});
