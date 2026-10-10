const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8').replace(/\r\n/g, '\n');

test('LAN special questions: player phone', async (t) => {
    const html = read('mobile', 'index.html');
    const js = read('mobile', 'mobile.js');

    await t.test('pass button, obligation notice and auction rule exist', () => {
        ['btn-pass-question', 'buzzer-obligation', 'auction-rule', 'auction-range'].forEach((id) => {
            assert.ok(html.includes(`id="${id}"`), `#${id} must exist`);
        });
        assert.ok(js.includes('netClient.passQuestion()'));
    });

    await t.test('players who must answer (cat target / auction leader) get no pass button', () => {
        assert.ok(js.includes('state.mustAnswer = Boolean(state.isEligibleForBuzzer && restrictedQuestion'));
        assert.ok(js.includes('const canPass = !state.mustAnswer'));
    });

    await t.test('bets are clamped to the allowed range', () => {
        assert.ok(js.includes('function clampBet('));
        assert.ok(js.includes('const amount = clampBet(elements.betInput.value);'));
    });

    await t.test('QUESTION_ACTIVE routes cat / auction questions to the right screen', () => {
        assert.ok(js.includes("payload.state === 'CAT_CHOOSING'"));
        assert.ok(js.includes("payload.state === 'AUCTION_BETTING'"));
    });

    await t.test('an in-game server error does not throw the player out to the join screen', () => {
        const body = js.slice(js.indexOf("netClient.on('server_error'"), js.indexOf("netClient.on('room_state'"));
        assert.ok(body.includes('isJoining'));
        assert.ok(body.indexOf('if (!isJoining) return;') < body.indexOf("showScreen('join')"));
    });
});

test('LAN special questions: host phone', async (t) => {
    const html = read('mobile', 'index.html');
    const js = read('mobile', 'mobile.js');

    await t.test('special panel is declared before the scripts and wired', () => {
        assert.ok(html.indexOf('id="host-special-panel"') < html.indexOf('<script src="mobile.js">'));
        assert.ok(js.includes('function renderHostSpecialPanel()'));
        assert.ok(js.includes('netClient.setCatTarget(p.id)'));
        assert.ok(js.includes('netClient.setAuctionLeader(p.id, bet)'));
        assert.ok(js.includes('netClient.startAuctionAnswer(bidders)'));
        assert.ok(js.includes("netClient.on('auction_bet_made'"));
    });
});

test('LAN special questions: PC screen', async (t) => {
    const game = read('js', 'game.js');

    await t.test('cat_transferred uses the fields the server really sends', () => {
        const body = game.slice(game.indexOf("hostNetworkClient.on('cat_transferred'"), game.indexOf("hostNetworkClient.on('auction_leader_set'"));
        assert.ok(body.includes('payload.toPlayerId'));
        assert.ok(!body.includes('payload.targetPlayerId'));
        assert.ok(body.includes('selectTeamForCatInBag(targetIdx, true)'), 'echo of our own choice must not be re-sent');
    });

    await t.test('auction bets mirror pass state instead of toggling it blindly', () => {
        const body = game.slice(game.indexOf("hostNetworkClient.on('auction_bet_made'"), game.indexOf("hostNetworkClient.on('answer_timeout'"));
        assert.ok(body.includes('isPassedNow'));
    });

    await t.test('LAN banner has no duplicated icon / wordy text', () => {
        assert.ok(!game.includes('Игроки могут нажимать на смартфонах'));
        assert.ok(!game.includes('🔔 Кнопка активна'));
    });
});

test('LAN big screen: blink on host pick, board only from the host', async (t) => {
    const game = read('js', 'game.js');
    const css = read('css', 'style.css');

    await t.test('question picked on the phone blinks on the big board before the modal opens', () => {
        assert.ok(game.includes('function openQuestionFromHostPhone('));
        assert.ok(game.includes("cell.classList.add('cell-flash')"));
        assert.ok(css.includes('.question-cost.cell-flash'));
        assert.ok(css.includes('@keyframes question-cell-flash'));
    });

    await t.test('gameplay events during the blink are queued and replayed after the modal opens', () => {
        assert.ok(game.includes('QUEUED_WHILE_BLINKING'));
        assert.ok(game.includes('hostNetworkClient.replayQueuedEvents()'));
    });

    await t.test('with a phone host the big screen has no "continue" button', () => {
        assert.ok(game.includes('const phoneHostsOnline = isOnlineGame && !isLocalHostEnabled;'));
        assert.ok(game.includes('hostNetworkClient.closeQuestion();'));
    });
});

test('LAN big screen: buzz handler must not throw (it freezes the common timer)', () => {
    const game = read('js', 'game.js');
    assert.ok(!game.includes('configEnableSound'), 'configEnableSound is not defined anywhere: playBuzzerSound used to throw on every buzz');
    const body = game.slice(game.indexOf("hostNetworkClient.on('buzz_locked'"), game.indexOf("hostNetworkClient.on('buzzer_ready'"));
    assert.ok(body.includes('stopTimer();'));
    assert.ok(body.includes('startOnlineAnswerCountdown('));
});

test('Rules modal describes the current LAN game', () => {
    const html = read('index.html');
    const lan = html.slice(html.indexOf('id="rules-tab-lan"'), html.indexOf('id="rules-tab-special"'));
    const special = html.slice(html.indexOf('id="rules-tab-special"'), html.indexOf('id="btn-close-rules"'));
    assert.ok(lan.includes('«К табло»'), 'host controls the board');
    assert.ok(lan.includes('Пас'), 'pass is explained');
    assert.ok(lan.includes('общий таймер замирает'), 'common timer freezes during the answer');
    assert.ok(lan.includes('продолжается с'), 'common timer resumes after a wrong answer');
    assert.ok(special.includes('30 секунд'), 'auction typed answers: fixed 30 seconds');
    assert.ok(special.includes('обязан'), 'obliged to answer');
    assert.ok(special.includes('назначает ведущий'), 'cat assigned by the host');
});

test('LAN big screen: hint banners are hidden', () => {
    const css = read('css', 'style.css');
    assert.match(css, /#online-buzzer-banner\s*\{\s*display:\s*none\s*!important/);
});

test('LAN big screen: compact answering card without judge buttons (they live on the host phone)', () => {
    const css = read('css/style.css'.split('/')[0], 'style.css');
    const game = read('js', 'game.js');
    assert.ok(css.includes('.answering-controls-row { display: none; }'));
    assert.ok(css.includes('body.pc-judges .answering-controls-row { display: flex; }'));
    assert.ok(css.includes('body.phone-host-online #modal-buttons-area:has(#btn-show-answer:only-child)'));
    assert.ok(game.includes('function syncHostChrome()'));
});

test('Answering card shows no "#N" - the player name is right below', () => {
    const game = read('js', 'game.js');
    const html = read('index.html');
    assert.ok(!/Отвечает игрок #/.test(game));
    assert.ok(!/Отвечает игрок #/.test(html));
});
