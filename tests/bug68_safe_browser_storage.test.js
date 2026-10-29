const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function browser(mode, initial = {}) {
    const nodes = new Map();
    function element(id) {
        if (nodes.has(id)) return nodes.get(id);
        const classes = new Set();
        const node = {
            id, style: { setProperty() {} }, dataset: {}, children: [], value: '', checked: false, disabled: false,
            innerHTML: '', textContent: '', listeners: new Map(),
            classList: {
                add(...names) { names.forEach(name => classes.add(name)); },
                remove(...names) { names.forEach(name => classes.delete(name)); },
                contains(name) { return classes.has(name); },
                toggle(name, force) {
                    const value = force === undefined ? !classes.has(name) : force;
                    if (value) classes.add(name); else classes.delete(name);
                    return value;
                }
            },
            addEventListener(name, fn) { this.listeners.set(name, fn); },
            removeEventListener() {}, setAttribute() {}, removeAttribute() {},
            appendChild(child) { this.children.push(child); return child; },
            querySelectorAll() { return []; }, querySelector() { return null; },
            getBoundingClientRect() { return { width: 390, height: 844, top: 0, bottom: 844 }; },
            focus() {}, remove() {}
        };
        nodes.set(id, node);
        return node;
    }
    const nativeValues = new Map(Object.entries(initial));
    const native = {
        getItem(key) { if (mode === 'methods') throw new Error('SecurityError'); return nativeValues.get(key) ?? null; },
        setItem(key, value) { if (mode === 'methods' || mode === 'quota') throw new Error('QuotaExceededError'); nativeValues.set(key, String(value)); },
        removeItem(key) { if (mode === 'methods' || mode === 'quota') throw new Error('SecurityError'); nativeValues.delete(key); }
    };
    const clients = [];
    class NetworkClient {
        constructor() { this.handlers = new Map(); this.isConnected = true; this.joins = []; clients.push(this); }
        on(name, fn) { this.handlers.set(name, fn); }
        connect() { return Promise.resolve(this); }
        disconnect() { this.isConnected = false; }
        joinRoom(...args) { this.joins.push(args); }
    }
    const pack = [{ roundName: 'Раунд', themes: [{ name: 'Тема', questions: [{ q: 'Вопрос?', a: 'Ответ', cost: 100 }] }] }];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        document: {
            readyState: 'complete', body: element('body'), documentElement: element('html'),
            getElementById: element, createElement: id => element(Symbol(id)),
            querySelector: selector => element(selector), querySelectorAll: () => [],
            addEventListener() {}
        },
        location: new URL('http://127.0.0.1:8080/mobile/?room=ABCDE'),
        navigator: {}, innerWidth: 390, innerHeight: 844, URL, URLSearchParams,
        setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
        requestAnimationFrame: () => 1, addEventListener() {},
        AVAILABLE_PACKS: [{ title: 'Пак', rounds: pack }], NetworkClient
    };
    sandbox.window = sandbox;
    if (mode === 'getter') Object.defineProperty(sandbox, 'localStorage', { get() { throw new Error('SecurityError'); } });
    else if (mode !== 'missing') sandbox.localStorage = native;
    vm.createContext(sandbox);
    const run = file => vm.runInContext(read(file), sandbox, { filename: file });
    return { sandbox, nodes, nativeValues, clients, run, element };
}

function loadStorage(context) {
    if (fs.existsSync(path.join(root, 'js/storage.js'))) context.run('js/storage.js');
}

for (const mode of ['getter', 'missing', 'methods', 'quota', 'normal']) {
    test('BUG-68: основной браузерный клиент запускается и сохраняет игру при storage=' + mode, () => {
        const context = browser(mode);
        loadStorage(context);
        for (const file of ['js/core/PackParser.js', 'js/core/ScoreManager.js', 'js/core/GameStateMachine.js', 'js/core/CdnManager.js', 'js/catalog.js', 'js/game.js']) context.run(file);
        assert.equal(context.element('sub-menu-main').style.display, 'block');
        vm.runInContext('toggleTheme(); saveGameState(); saveTurnOrderSetting("winner");', context.sandbox);
        assert.equal(context.element('body').classList.contains('light-theme'), true);
        const storage = context.sandbox.QuizStorage || context.sandbox.localStorage;
        assert.equal(JSON.parse(storage.getItem('quiz_save_state')).teams.length, 2);
        assert.equal(vm.runInContext('readTurnOrderSetting()', context.sandbox), 'winner');
        vm.runInContext('clearGameState()', context.sandbox);
        assert.equal(storage.getItem('quiz_save_state'), null);
        if (mode === 'normal') assert.equal(context.nativeValues.get('cfg_turn_order'), 'winner');
    });

    test('BUG-68: мобильный веб-пульт запускается, меняет тему и входит при storage=' + mode, () => {
        const context = browser(mode);
        loadStorage(context);
        context.run('mobile/mobile.js');
        context.element('theme-toggle-btn').listeners.get('click')();
        assert.equal(context.element('body').classList.contains('light-theme'), true);
        context.element('room-code-input').value = 'ABCDE';
        context.element('player-name-input').value = 'Игрок';
        context.element('join-form').listeners.get('submit')({ preventDefault() {} });
        assert.equal(context.clients[0].joins[0][1], 'Игрок');
        context.element('btn-reconnect-quick').listeners.get('click')();
        assert.equal(context.clients[0].joins.at(-1)[0], 'ABCDE');
        const storage = context.sandbox.QuizStorage || context.sandbox.localStorage;
        assert.equal(storage.getItem('quiz_u_player_name'), 'Игрок');
        if (mode === 'normal') assert.equal(context.nativeValues.get('quiz_u_room_code'), 'ABCDE');
    });
}

test('BUG-68: сохранённые настройки читаются при доступном storage', () => {
    const context = browser('normal', { quiz_theme: 'light', cfg_thinking_time: '45', cfg_turn_order: 'winner' });
    loadStorage(context);
    context.run('js/game.js');
    assert.equal(context.element('body').classList.contains('light-theme'), true);
    assert.equal(vm.runInContext('configThinkingTime', context.sandbox), 45);
    assert.equal(vm.runInContext('configTurnOrderMode', context.sandbox), 'winner');
});

test('BUG-68: неудачные запись и удаление не возвращают устаревшее сохранение', () => {
    const oldSave = JSON.stringify({ teams: [{ name: 'Старая команда' }] });
    const context = browser('quota', { quiz_save_state: oldSave });
    loadStorage(context);
    context.run('js/game.js');
    vm.runInContext('saveGameState()', context.sandbox);
    assert.equal(JSON.parse(context.sandbox.QuizStorage.getItem('quiz_save_state')).teams.length, 2);
    vm.runInContext('clearGameState()', context.sandbox);
    assert.equal(context.sandbox.QuizStorage.getItem('quiz_save_state'), null);
    assert.equal(context.nativeValues.get('quiz_save_state'), oldSave);
});

test('BUG-68: CDN работает отдельно без адаптера при запрещённом getter storage', () => {
    const context = browser('getter');
    context.run('js/core/CdnManager.js');
    vm.runInContext('CdnManager.setCdnBaseUrl("https://cdn.example"); CdnManager.setCdnBaseUrl("");', context.sandbox);
    assert.equal(context.sandbox.CdnManager.isEnabled(), false);
});

test('BUG-68: адаптер загружается до потребителей в обоих HTML-входах', () => {
    for (const [file, consumers] of [
        ['index.html', ['js/core/CdnManager.js', 'js/catalog.js', 'js/game.js']],
        ['mobile/index.html', ['mobile.js']]
    ]) {
        const scripts = [...read(file).matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(match => match[1]);
        const adapter = scripts.findIndex(src => /(?:^|\/)js\/storage\.js$/.test(src));
        assert.ok(adapter >= 0, file);
        for (const consumer of consumers) assert.ok(scripts.indexOf(consumer) > adapter, consumer);
    }
});
