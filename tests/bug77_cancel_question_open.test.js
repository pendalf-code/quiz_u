const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');

function section(start, end) {
    const from = source.indexOf(start), to = source.indexOf(end, from);
    assert.ok(from >= 0 && to > from, start);
    return source.slice(from, to);
}

function app() {
    const nodes = new Map(), timers = new Map(), scheduled = [], opened = [];
    let nextTimer = 0;
    function node(id) {
        if (nodes.has(id)) return nodes.get(id);
        const classes = new Set();
        const result = {
            id, style: { display: 'none' }, value: '', isConnected: true,
            classList: { add: key => classes.add(key), remove: key => classes.delete(key), contains: key => classes.has(key) },
            querySelector: () => node(id + '-card'),
            querySelectorAll: () => [node('cell-0'), node('cell-1')], remove() {}
        };
        nodes.set(id, result);
        return result;
    }
    class NetworkClient {
        constructor() { this.handlers = new Map(); this.isConnected = true; }
        on(event, callback) { this.handlers.set(event, callback); }
        emit(event, payload) { this.handlers.get(event)?.(payload); }
        connect() { return Promise.resolve(); }
        disconnect() {}
    }
    const context = {
        NetworkClient, location: new URL('http://localhost:8080/'),
        document: { getElementById: node, createElement: () => node('detached') },
        console, setTimeout(callback, delay) {
            const id = ++nextTimer;
            const record = { id, callback, delay };
            timers.set(id, record); scheduled.push(record); return id;
        }, clearTimeout(id) { timers.delete(id); },
        currentRoundIndex: 0, currentThemeIdx: 0, currentQuestionIdx: 0,
        gameData: [0, 1].map(() => ({ themes: [{ questions: [{}, {}] }] })),
        syncHostChrome() {}, syncLobbySettings() {}, updateTurnDisplay() {}, updateTeamsPanel() {},
        initBoard() {}, saveGameState() {}, stopTimer() {}, stopOnlineAnswerCountdown() {}, stopQuestionAudio() {},
        checkRoundEnd() {}, syncTurnFromServer() {}, hideGameLayout() {}, showSubScreen() {}, renderLobbyPlayers() {},
        showWinnerCelebration() { context.winners++; }, winners: 0,
        playTickSound() {}, playCatMeowSound() {}, playGavelStrikeSound() {}, playAuctionFanfareSound() {},
        getCatInBagSvgHtml: () => '', getAuctionGavelSvgHtml: () => '', getAuctionChestSvgHtml: () => '',
        showAnswer() { context.answers++; }, answers: 0,
        openQuestion(theme, index, cell, event, skip, question) {
            const display = () => {
                opened.push(question.q);
                node('question-modal').style.display = 'flex';
                node('question-modal').classList.add('active');
                context.finishNetworkQuestionOpen();
            };
            if (question.type === 'auction_leader') context.showAuctionSplash(question.type, display);
            else if (question.type === 'cat') context.showCatInBagSplash(display);
            else display();
        }
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(section(source.includes('let specialSplashGeneration') ? 'let specialSplashGeneration' : 'let catSplashTimer', 'function getAuctionChestSvgHtml'), context);
    vm.runInContext(section('let isOnlineGame = false;', 'let currentLobbySettings ='), context);
    vm.runInContext(section('function closeSystemModal(', 'function clearTeamInputs('), context);
    vm.runInContext(section('function executeSkipRound(', 'function checkRoundEnd('), context);
    vm.runInContext(section('function initHostNetwork(', 'function renderLobbyQRCode('), context);
    vm.runInContext('isOnlineGame = true; isGameStarted = true; lastServerRoomState = "BOARD"; initHostNetwork();', context);
    const client = vm.runInContext('hostNetworkClient', context);
    const send = (event, payload = {}) => client.emit(event, payload);
    const question = (q = 'Первый?', type = 'normal', questionIdx = 0) => send('question_active', {
        themeIdx: 0, questionIdx, questionType: type, question: { q, a: 'Ответ', cost: 200, type }
    });
    function run(delay) {
        const record = [...timers.values()].find(item => item.delay === delay);
        assert.ok(record, 'Ожидался callback через ' + delay);
        timers.delete(record.id); record.callback();
        return record.callback;
    }
    return { context, client, node, timers, scheduled, opened, send, question, run };
}

for (const event of ['question_closed', 'round_changed', 'round_skipped', 'game_finished']) {
    test('BUG-77: ' + event + ' отменяет открытие после мигания и поздний callback', () => {
        const state = app();
        state.question();
        const stale = state.scheduled.find(timer => timer.delay === 1300).callback;
        state.send('show_answer');
        state.send(event, { roundIndex: 1 });
        stale();
        assert.equal(state.opened.length, 0);
        assert.equal(state.context.answers, 0);
        assert.equal(state.node('cell-0').classList.contains('cell-flash'), false);
    });
}

test('BUG-77: возврат в лобби отменяет старое открытие', () => {
    const state = app();
    state.question();
    const stale = state.scheduled.find(timer => timer.delay === 1300).callback;
    state.send('room_state', { state: 'LOBBY' });
    stale();
    assert.equal(state.opened.length, 0);
});

test('BUG-77: новый выбор заменяет отложенный вопрос, старый callback безопасен', () => {
    const state = app();
    state.question();
    const stale = state.scheduled.find(timer => timer.delay === 1300).callback;
    state.question('Второй?', 'normal', 1);
    stale();
    state.run(1300);
    assert.deepEqual(state.opened, ['Второй?']);
});

test('BUG-77: BOARD и SHOW_ANSWER после паса не отменяют ещё открываемый вопрос', () => {
    const state = app();
    state.question();
    state.send('room_state', { state: 'BOARD', currentQuestion: null });
    state.send('show_answer');
    state.run(1300);
    assert.deepEqual(state.opened, ['Первый?']);
    assert.equal(state.context.answers, 1);
    assert.equal(state.node('question-modal').style.display, 'flex');
});

test('BUG-77: финальное состояние до конца мигания ждёт раскрытия и закрытия вопроса', () => {
    const state = app();
    state.question();
    state.send('room_state', { state: 'GAME_OVER', currentQuestion: null });
    state.send('show_answer');
    assert.equal(state.context.winners, 0);
    state.run(1300);
    assert.deepEqual(state.opened, ['Первый?']);
    assert.equal(state.context.answers, 1);
    state.send('question_closed');
    assert.equal(state.context.winners, 1);
});

for (const type of ['auction_leader', 'cat']) {
    test('BUG-77: закрытие во время заставки ' + type + ' не открывает модалку позднее', () => {
        const state = app();
        state.question('Особый?', type);
        state.run(1300);
        const oldDismiss = state.scheduled.find(timer => timer.delay === 3200).callback;
        state.send('question_closed');
        oldDismiss();
        for (const timer of [...state.timers.values()]) timer.callback();
        assert.equal(state.opened.length, 0);
        assert.equal(state.node(type === 'cat' ? 'cat-splash-overlay' : 'auction-splash-overlay').style.display, 'none');
    });
}

test('BUG-77: старое затухание заставки не завершает заставку нового вопроса', () => {
    const state = app();
    state.question('Первый?', 'auction_leader'); state.run(1300);
    state.context.dismissAuctionSplash();
    const fade = state.scheduled.find(timer => timer.delay === 250);
    state.send('question_closed');
    state.question('Второй?', 'auction_leader', 1); state.run(1300);
    state.timers.delete(fade.id); fade.callback();
    assert.equal(state.opened.length, 0);
    assert.equal(state.node('auction-splash-overlay').style.display, 'flex');
    state.context.dismissAuctionSplash(); state.run(250);
    assert.deepEqual(state.opened, ['Второй?']);
});


test('BUG-77: закрытие до конца мигания отмечает выбранную ячейку, а не прежнюю', () => {
    const state = app();
    state.question('Второй?', 'normal', 1);
    state.send('question_closed');
    assert.equal(state.context.gameData[0].themes[0].questions[0].used, undefined);
    assert.equal(state.context.gameData[0].themes[0].questions[1].used, true);
});

test('BUG-77: старая страховка не выпускает очередь новой заставки', () => {
    const state = app();
    state.question('Первый?', 'auction_leader'); state.run(1300);
    const oldSafety = state.scheduled.find(timer => timer.delay === 12000).callback;
    state.send('question_closed');
    state.question('Второй?', 'cat', 1); state.run(1300);
    state.send('show_answer'); oldSafety();
    assert.equal(state.context.answers, 0);
    assert.equal(vm.runInContext('pendingNetworkQuestionOpen', state.context), true);
    state.context.dismissCatSplash(); state.run(250);
    assert.deepEqual(state.opened, ['Второй?']);
    assert.equal(state.context.answers, 1);
});


test('BUG-77: прямой выбор с ПК отменяет прежнее открытие с телефона', () => {
    const state = app();
    state.question('Первый?');
    const stale = state.scheduled.find(timer => timer.delay === 1300).callback;
    Object.assign(state.context, {
        isTestMode: false, teams: [], configReadingTime: 7, configThinkingTime: 30,
        configAnswerTime: 5, handleQuestionVideo: () => false, startTimer() {},
        playStartThinkingSound() {}, specialQuestionRevealed: false
    });
    state.client.selectQuestion = () => {};
    state.context.gameData[0].themes[0].questions[1] = { q: 'Другой вопрос?', a: 'Ответ', cost: 300, type: 'normal' };
    vm.runInContext(section('function openQuestion(', 'function setAuctionFieldValue('), state.context);
    vm.runInContext('openQuestion(0, 1, null, null)', state.context);
    stale();
    assert.equal(state.opened.length, 0);
    assert.equal(vm.runInContext('pendingNetworkQuestionOpen', state.context), false);
    assert.equal(state.node('modal-question-text').innerHTML, 'Другой вопрос?');
});


test('BUG-77: явное завершение игры закрывает активный финальный экран', () => {
    const state = app();
    let active = true;
    state.context.FinalRound = { isActive: () => active, hide() { active = false; } };
    state.send('game_finished');
    state.send('room_state', { state: 'GAME_OVER', currentQuestion: null });
    assert.equal(active, false);
    assert.equal(state.context.winners, 1);
});
