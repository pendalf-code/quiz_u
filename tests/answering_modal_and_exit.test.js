const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');

describe('Answering Side Modal, Frozen Timer, Exit to Menu & Auto-pause Test Suite', () => {
    const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
    const styleCss = fs.readFileSync(path.join(rootDir, 'css', 'style.css'), 'utf8');
    const gameJs = fs.readFileSync(path.join(rootDir, 'js', 'game.js'), 'utf8');

    const mobileHtml = fs.readFileSync(path.join(rootDir, 'mobile', 'index.html'), 'utf8');
    const mobileCss = fs.readFileSync(path.join(rootDir, 'mobile', 'mobile.css'), 'utf8');
    const mobileJs = fs.readFileSync(path.join(rootDir, 'mobile', 'mobile.js'), 'utf8');

    test('1. Timer yellow circle answering styling and logic when player answers (freeze removed)', () => {
        // CSS includes .timer.answering styling with yellow glow and animation
        assert.ok(styleCss.includes('.timer.answering'), '.timer.answering CSS rule exists in style.css');
        assert.ok(styleCss.includes('answerPulse'), 'answerPulse animation exists in style.css');
        assert.ok(styleCss.includes('#f39c12'), '#f39c12 yellow/gold background exists in style.css');

        // game.js guards startTimer from running during answering
        assert.ok(gameJs.includes('if (isAnswerTimerActive) return;'), 'startTimer() guards against running while answer is active');

        // game.js applies answering class when buzzer is locked or answer paused
        assert.ok(gameJs.includes("timerElem.className = 'timer answering'"), 'timerElem receives answering class when answering starts');
        assert.ok(gameJs.includes("timerElem.classList.remove('answering')"), 'timerElem loses answering class when answering finishes');
    });

    test('2. "Отвечает игрок N" side modal exists beside the question window', () => {
        // Layout container
        assert.ok(indexHtml.includes('class="question-modal-layout"'), 'question-modal-layout wraps modal card');
        assert.ok(indexHtml.includes('id="answering-player-modal"'), '#answering-player-modal exists beside question window');

        // Modal contents
        assert.ok(indexHtml.includes('id="answering-player-num"'), '#answering-player-num displays "Отвечает игрок"');
        assert.ok(indexHtml.includes('id="answering-modal-avatar"'), '#answering-modal-avatar displays player avatar');
        assert.ok(indexHtml.includes('id="answering-modal-name"'), '#answering-modal-name displays player name');
        assert.ok(indexHtml.includes('id="answering-ring-progress"'), 'Circular progress ring exists in answering modal');
        assert.ok(indexHtml.includes('id="btn-judge-modal-correct"'), 'Quick accept answer button exists in answering modal');
        assert.ok(indexHtml.includes('id="btn-judge-modal-wrong"'), 'Quick reject answer button exists in answering modal');

        // CSS styles
        assert.ok(styleCss.includes('.answering-player-modal'), '.answering-player-modal CSS exists in style.css');
        assert.ok(styleCss.includes('.answering-player-title'), '.answering-player-title CSS exists in style.css');
    });

    test('3. Mobile client provides exit to main menu option', () => {
        // Mobile HTML header button & confirmation modal
        assert.ok(mobileHtml.includes('id="exit-menu-btn"'), 'Mobile header contains exit to menu button');
        assert.ok(mobileHtml.includes('id="modal-exit-confirm"'), 'Mobile exit confirmation modal exists');
        assert.ok(mobileHtml.includes('id="btn-confirm-exit"'), 'Confirm exit button exists');

        // Mobile CSS styles
        assert.ok(mobileCss.includes('.exit-menu-btn'), '.exit-menu-btn CSS exists in mobile.css');
        assert.ok(mobileCss.includes('.mobile-modal-overlay'), '.mobile-modal-overlay CSS exists in mobile.css');

        // Mobile JS implementation
        assert.ok(mobileJs.includes('leaveToMainMenu'), 'leaveToMainMenu function is defined in mobile.js');
        assert.ok(mobileJs.includes('exitMenuBtn'), 'exitMenuBtn element is registered in mobile.js');
    });

    test('4. Auto-pause on accidental player disconnection', () => {
        // Host screen pause banner
        assert.ok(indexHtml.includes('id="disconnect-pause-banner"'), '#disconnect-pause-banner exists on host screen');
        assert.ok(indexHtml.includes('id="btn-resume-from-disconnect"'), 'Resume button exists in disconnect pause banner');
        assert.ok(styleCss.includes('.disconnect-pause-banner'), '.disconnect-pause-banner CSS exists in style.css');
        assert.ok(gameJs.includes('reason === \'disconnect\''), 'game.js handles disconnect pause event');

        // Mobile pause banner
        assert.ok(mobileHtml.includes('id="mobile-pause-banner"'), '#mobile-pause-banner exists in mobile/index.html');
        assert.ok(mobileCss.includes('.mobile-pause-banner'), '.mobile-pause-banner CSS exists in mobile.css');
        assert.ok(mobileJs.includes('mobilePauseBanner'), 'mobile.js handles pause banner on mobile');
    });
});
