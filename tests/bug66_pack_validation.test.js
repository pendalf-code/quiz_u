const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const PackParser = require('../js/core/PackParser');

const gameSource = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');
const catalogSource = fs.readFileSync(path.join(__dirname, '../js/catalog.js'), 'utf8');
const valid = () => [{ roundName: 'Раунд', themes: [{ name: 'Тема', questions: [{ q: 'Вопрос?', a: 'Ответ', cost: 100 }] }] }];

function functionSource(source, start, end) {
    const begin = source.indexOf(start);
    const finish = source.indexOf(end, begin);
    assert.ok(begin >= 0 && finish > begin, start);
    return source.slice(begin, finish);
}

function browser() {
    const original = valid();
    const saved = new Map([
        ['jeopardy_pack', JSON.stringify(original)],
        ['quiz_save_state', 'сохранённая игра']
    ]);
    const editor = { value: '[null]' };
    const notices = [];
    const context = {
        PackParser,
        console: { warn() {}, error() {} },
        gameData: original, currentRoundIndex: 2,
        teams: [{ name: 'Старая', score: 500 }], isOnlineGame: false,
        document: { getElementById: () => editor },
        QuizStorage: {
            getItem: key => saved.get(key),
            setItem: (key, value) => saved.set(key, value),
            removeItem: key => saved.delete(key)
        },
        showSystemModal: (...args) => notices.push(args),
        clearTeamInputs() {}, showSubScreen() {}, updateLobbyPackDisplay() {},
        FileReader: class {
            readAsText() { this.onload({ target: { result: editor.value } }); }
        },
        window: { currentPackTitle: 'Старый пак', isPackSelected: true },
        normalizeGameData: data => PackParser.normalizeGameData(data)
    };
    vm.createContext(context);
    vm.runInContext(functionSource(gameSource, 'function escapeHtml(str)', 'let savedThinkingTime'), context);
    if (gameSource.includes('function getValidatedGameData(')) {
        vm.runInContext(functionSource(gameSource, 'function getValidatedGameData(', 'window.normalizeGameData ='), context);
    }
    for (const [start, end] of [
        ['window.setGameData = function', 'function backToMainMenu'],
        ['function applyCustomQuestions(', 'let lastLeaderNamesStr'],
        ['function uploadLobbyCustomPack(event)', 'function initHostNetwork'],
        ['function uploadPack(event)', 'function openTurnOrderModal']
    ]) vm.runInContext(functionSource(gameSource, start, end), context);
    return { context, original, saved, editor, notices };
}

function assertOldPack(state) {
    assert.equal(state.context.gameData, state.original);
    assert.equal(state.context.currentRoundIndex, 2);
    assert.equal(state.context.window.currentPackTitle, 'Старый пак');
    assert.equal(state.saved.get('jeopardy_pack'), JSON.stringify(state.original));
}

test('BUG-66: повреждённые структуры и нечисловые номиналы дают ошибки валидации', () => {
    const invalid = [
        [null], [12], [[]], [{ themes: [null] }], [{ themes: [[]] }],
        [{ themes: [{ name: 'Тема', questions: [[]] }] }],
        ...[NaN, Infinity, -1, 0, '100'].map(cost => [{ themes: [{ questions: [{ q: 'Q?', a: 'A', cost }] }] }])
    ];
    for (const data of invalid) {
        const result = PackParser.validatePack(data);
        assert.equal(result.valid, false);
        assert.ok(result.errors.length > 0);
    }
    assert.equal(PackParser.validatePack(valid()).valid, true);
});

test('BUG-66: setGameData не заменяет рабочие и сохранённые данные неверным паком', () => {
    const state = browser();
    assert.throws(() => state.context.window.setGameData([null]));
    assertOldPack(state);
});

test('BUG-66: редактор отклоняет структурно неверный JSON без потери рабочего пака', () => {
    const state = browser();
    state.context.applyCustomQuestions();
    assertOldPack(state);
    assert.ok(state.notices.length);
});

test('BUG-66: загрузка файла в LAN сохраняет прежний пак при ошибке структуры', () => {
    const state = browser();
    state.context.uploadLobbyCustomPack({ target: { files: [{ name: 'плохой.json' }], value: 'file' } });
    assertOldPack(state);
});

test('BUG-66: обычная загрузка файла не меняет название рабочего пака при ошибке', () => {
    const state = browser();
    state.context.uploadPack({ target: { files: [{ name: 'плохой.json' }], value: 'file' } });
    assertOldPack(state);
});

test('BUG-66: валидный файл сохраняет выбранное название и рабочие вопросы', () => {
    const state = browser();
    const replacement = valid();
    replacement[0].themes[0].questions[0].q = 'Новый вопрос?';
    state.editor.value = JSON.stringify(replacement);
    state.context.uploadPack({ target: { files: [{ name: 'новый.json' }], value: 'file' } });
    assert.equal(state.context.window.currentPackTitle, 'новый');
    assert.equal(state.context.gameData[0].themes[0].questions[0].q, 'Новый вопрос?');
    assert.equal(state.saved.get('jeopardy_pack'), JSON.stringify(replacement));
});

function catalog() {
    const context = {
        PackParser,
        normalizeGameData: data => PackParser.normalizeGameData(data),
        fetch: async () => ({ ok: true, text: async () => '[null]' }),
        console: { error() {} },
        window: { location: { protocol: 'http:' } }
    };
    vm.createContext(context);
    vm.runInContext(functionSource(catalogSource, 'async function loadPackJsonData(pack)', 'async function selectPackToPlay'), context);
    return context;
}

test('BUG-66: каталог не кэширует повреждённый ответ JSON', async () => {
    const entry = { filePath: 'bad.json' };
    await assert.rejects(catalog().loadPackJsonData(entry));
    assert.equal(entry.rounds, undefined);
});

test('BUG-66: каталог повторно проверяет повреждённый кэш раундов', async () => {
    await assert.rejects(catalog().loadPackJsonData({ rounds: [null] }));
});

test('BUG-66: повреждённый сохранённый пак при запуске заменяется валидным значением по умолчанию', () => {
    const fallback = valid();
    const context = {
        PackParser, window: {}, console: { warn() {} },
        QuizStorage: { getItem: () => '[null]', setItem() {} },
        AVAILABLE_PACKS: [{ rounds: fallback }]
    };
    vm.createContext(context);
    vm.runInContext(gameSource.slice(0, gameSource.indexOf('let currentRoundIndex')), context);
    assert.equal(vm.runInContext('gameData', context), fallback);
});

test('BUG-66: название из повреждённого пака не становится HTML в ошибке редактора', () => {
    const state = browser();
    state.editor.value = JSON.stringify([{ roundName: '<img src=x onerror=alert(1)>', themes: [] }]);
    state.context.applyCustomQuestions();
    assertOldPack(state);
    assert.ok(state.notices[0][1].includes('&lt;img'));
    assert.ok(!state.notices[0][1].includes('<img'));
});

test('BUG-66: ошибка каталога экранирует название и сохраняет выбранный пак', async () => {
    const context = catalog();
    const notices = [];
    context.closePackPreviewModal = () => {};
    context.showSystemModal = (...args) => notices.push(args);
    context.window.currentPackTitle = 'Старый пак';
    context.window.AVAILABLE_PACKS = [{ id: 'bad', rounds: [{ roundName: '<img src=x>', themes: [] }] }];
    vm.runInContext(functionSource(gameSource, 'function escapeHtml(str)', 'let savedThinkingTime'), context);
    vm.runInContext(functionSource(catalogSource, 'async function selectPackToPlay(packId)', 'async function previewPack'), context);
    await context.selectPackToPlay('bad');
    assert.equal(context.window.currentPackTitle, 'Старый пак');
    assert.ok(notices[0][1].includes('&lt;img'));
    assert.ok(!notices[0][1].includes('<img'));
});
