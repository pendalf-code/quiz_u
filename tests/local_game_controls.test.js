const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');

function section(start, end) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from);
    assert.ok(from >= 0 && to > from, start);
    return source.slice(from, to);
}

function createPage(globals = {}) {
    const elements = new Map();
    const node = id => {
        if (!elements.has(id)) {
            elements.set(id, {
                style: {},
                classList: { add() {}, remove() {}, contains: () => id === 'question-modal' }
            });
        }
        return elements.get(id);
    };
    const app = vm.createContext({
        document: { getElementById: node },
        isOnlineGame: false,
        waitingForQuestionMedia: false,
        waitingForManualReading: false,
        ...globals
    });
    const run = code => vm.runInContext(code, app);
    return { app, node, run };
}

test('TASK-87: личный отсчёт после паузы сохраняет оставшиеся секунды', () => {
    const intervals = new Map();
    let id = 0;
    const { node, run } = createPage({
        window: {},
        timerInterval: null, answerCountdownInterval: null, onlineAnswerCountdownInterval: null,
        isReadingTime: false, isAnswerTimerActive: false, configAnswerTime: 4,
        timeLeft: 5, savedThinkingTime: 5, currentTurnTeamIdx: 0, activeTeamIdxForQuestion: null,
        teams: [{ name: 'Алиса', score: 0 }],
        stopOnlineAnswerCountdown() {}, playStartThinkingSound() {}, playTickSound() {}, playTimeUpSound() {},
        setInterval(fn) { intervals.set(++id, fn); return id; },
        clearInterval(timerId) { intervals.delete(timerId); }
    });
    run(section('let isGlobalTimerPaused = false;', 'function toggleTimerPause('));
    run(section('function stopTimer() {', 'function saveGameState('));
    run(section('function toggleAnswerPause() {', "window.addEventListener('keydown'"));

    run('toggleAnswerPause()');
    const timerId = run('answerCountdownInterval');
    const tick = intervals.get(timerId);
    tick();
    assert.equal(node('timer').textContent, 3);
    run('pauseTimer()');
    tick();
    tick();
    assert.equal(node('timer').textContent, 3);
    assert.equal(node('btn-start-local-answer').disabled, true);
    run('resumeTimer()');
    assert.equal(run('answerCountdownInterval'), timerId);
    assert.equal(node('timer').textContent, 3);
    tick();
    assert.equal(node('timer').textContent, 2);
});

test('TASK-87: ничья, некорректный ввод и общий пас оставляют форму ставок открытой', () => {
    const notifications = [];
    const { app, node, run } = createPage({
        currentActiveQuestion: { type: 'auction_leader' },
        teams: [{ name: 'Алиса' }, { name: 'Борис' }],
        auctionBets: { 0: { val: 100, isPassed: false }, 1: { val: 100, isPassed: false } },
        showSystemModal(...args) { notifications.push(args); }
    });
    for (const i of [0, 1]) {
        const input = node('auction-input-' + i);
        input.value = '100';
        input.valueAsNumber = 100;
        input.getAttribute = name => name === 'data-min' ? '100' : '400';
    }
    run(section('function confirmAllAuctionBets() {', 'function onlineAuctionLeaderChosen('));
    run('confirmAllAuctionBets()');
    assert.match(node('timer-hint').textContent, /Ничья/);
    node('auction-input-0').valueAsNumber = 100.5;
    run('confirmAllAuctionBets()');
    assert.match(node('timer-hint').textContent, /Недопустимая ставка/);
    for (const bet of Object.values(app.auctionBets)) bet.isPassed = true;
    run('confirmAllAuctionBets()');
    assert.match(node('timer-hint').textContent, /Нет ставок/);
    assert.deepEqual(notifications, []);
});

test('TASK-87: локальный финал отклоняет дробную ставку и принимает целую', () => {
    const finalSource = fs.readFileSync(path.join(__dirname, '../js/final_round.js'), 'utf8');
    const start = finalSource.indexOf('function closeBets() {');
    const end = finalSource.indexOf('function togglePause()', start);
    assert.ok(start >= 0 && end > start);

    const { app, node, run } = createPage({
        st: { limits: { 0: { min: 1, max: 100 } }, bets: { 0: 1.5 }, placed: {} },
        isLan: () => false, finalists: () => ['0'],
        bidders: () => Object.keys(app.st.placed),
        showSystemModal(title) { app.warning = title; },
        setStage(stage) { app.stage = stage; },
        sound() {}, startTimer() {}, LOCAL_ANSWER_SECONDS: 60
    });
    app.document.querySelector = node;
    run(finalSource.slice(start, end));
    run('closeBets()');
    assert.match(app.warning, /Недопустимая ставка/);
    assert.deepEqual(Object.keys(app.st.placed), []);

    app.st.bets[0] = 37;
    run('closeBets()');
    assert.equal(app.stage, 'question');
    assert.deepEqual(Object.keys(app.st.placed), ['0']);
});

test('TASK-87: настройки не сохраняют секунды за пределами полей и принимают 0 с чтения', () => {
    const saved = new Map();
    const { app, node, run } = createPage({
        configReadingTime: 7, configReadingMode: 'fixed', configThinkingTime: 30, configAnswerTime: 5,
        configTurnOrderMode: 'rotation', currentLobbySettings: {},
        configAllowCat: true, configAllowAuction: true, configAllowAuctionLeader: true,
        QuizStorage: { setItem(key, value) { saved.set(key, value); } },
        saveTurnOrderSetting() {}, showSystemModal() {}
    });
    const reading = node('setting-reading-time');
    const thinking = node('setting-thinking-time');
    const answer = node('setting-answer-time');
    for (const [field, value, min, max] of [[reading, 0, 0, 60], [thinking, 5, 1, 120], [answer, 61, 1, 60]]) {
        field.value = String(value);
        field.valueAsNumber = value;
        field.checkValidity = () => Number.isInteger(field.valueAsNumber) && field.valueAsNumber >= min && field.valueAsNumber <= max;
    }
    run(section('function saveSettings() {', 'function showTeamSetup('));
    run('saveSettings()');
    assert.equal(saved.size, 0);
    assert.equal(app.configAnswerTime, 5);

    answer.value = '4';
    answer.valueAsNumber = 4;
    run('saveSettings()');
    assert.equal(saved.get('cfg_reading_time'), 0);
    assert.equal(saved.get('cfg_answer_time'), 4);
});
