const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const game = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');
const catalog = fs.readFileSync(path.join(__dirname, '../js/catalog.js'), 'utf8');
function section(source, start, end) {
    return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
}
function setup() {
    const names = ['Лисы', '', 'Совы'];
    const context = vm.createContext({
        names, window: { AVAILABLE_PACKS: [{id: 'test', title: 'Пак'}] },
        gameData: [], currentRoundIndex: 2, isOnlineGame: false,
        document: {getElementById: () => ({value: '[]'})},
        getValidatedGameData: data => data,
        QuizStorage: {setItem() {}, removeItem() {}},
        clearTeamInputs: () => names.splice(0, names.length, 'Команда 1', 'Команда 2'),
        showSubScreen: screen => { context.screen = screen; },
        showSystemModal() {}, closePackPreviewModal() {},
        loadPackJsonData: async () => [{themes: []}],
        console, escapeHtml: value => value
    });
    vm.runInContext(section(game, 'function showTeamSetup(', 'function addInputRow('), context);
    vm.runInContext(section(game, 'function applyCustomQuestions(', 'let lastLeaderNamesStr'), context);
    vm.runInContext(section(catalog, 'async function selectPackToPlay(', 'async function previewPack('), context);
    return context;
}
test('BUG-79: выбор и повторная смена пака сохраняют все поля команд', async () => {
    const ctx = setup();
    await ctx.selectPackToPlay('test');
    await ctx.selectPackToPlay('test');
    assert.deepEqual(ctx.names, ['Лисы', '', 'Совы']);
    assert.equal(ctx.screen, 'team-setup-container');
});
test('BUG-79: импорт JSON сохраняет названия и количество команд', () => {
    const ctx = setup();
    ctx.applyCustomQuestions();
    assert.deepEqual(ctx.names, ['Лисы', '', 'Совы']);
    assert.equal(ctx.screen, 'team-setup-container');
});
test('BUG-79: новая настройка по-прежнему сбрасывает поля', () => {
    const ctx = setup();
    ctx.showTeamSetup();
    assert.deepEqual(ctx.names, ['Команда 1', 'Команда 2']);
});
