const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/game.js'), 'utf8');
// Выполняем настоящий начальный блок приложения, а затем настоящий обработчик открытия вопроса.
const startup = source.slice(0, source.indexOf('let activeTeamIdxForQuestion'));
const openQuestionSource = source.slice(source.indexOf('function openQuestion('), source.indexOf('function setAuctionFieldValue('));

function load(savedReadingTime) {
    const values = new Map();
    const pack = [{ roundName: 'Раунд', themes: [{ name: 'Тема', questions: [{ q: 'Вопрос?', a: 'Ответ', cost: 100 }] }] }];
    values.set('jeopardy_pack', JSON.stringify(pack));
    if (savedReadingTime !== undefined) values.set('cfg_reading_time', savedReadingTime);
    const nodes = new Map();
    function node(id) {
        if (nodes.has(id)) return nodes.get(id);
        const element = {
            style: { setProperty() {} }, classList: { add() {}, remove() {} },
            textContent: '', innerHTML: '', src: '',
            remove() {}, querySelector() { return node('modal-card'); }
        };
        nodes.set(id, element);
        return element;
    }
    const context = {
        console: { warn() {} },
        localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) },
        document: { getElementById: node }, setTimeout() {},
        stopTimer() {}, stopQuestionAudio() {}, saveGameState() {},
        handleQuestionVideo: () => false, playStartThinkingSound() {},
        startTimer() { context.timerStarts++; }, timerStarts: 0,
        isOnlineGame: false, hostNetworkClient: null,
        teams: [{ name: 'Команда', score: 0 }], activeTeamIdxForQuestion: null,
        auctionBets: {}, currentTurnTeamIdx: 0,
        activeCellOnBoard: null, questionWinnerTeamIdx: null, specialQuestionRevealed: false
    };
    context.window = context;
    vm.createContext(context);
    for (const file of ['js/storage.js', 'js/core/PackParser.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
    vm.runInContext(startup, context, { filename: 'game-startup.js' });
    vm.runInContext(openQuestionSource, context, { filename: 'game-open-question.js' });
    return { context, node, run: code => vm.runInContext(code, context) };
}

for (const [saved, expected] of [[undefined, 7], ['0', 0], ['12', 12], ['not-a-number', 7], ['-1', 7], ['Infinity', 7], ['', 7], ['12seconds', 7]]) {
    test('BUG-67: восстановление чтения ' + JSON.stringify(saved) + ' даёт ' + expected + ' с', () => {
        const app = load(saved);
        assert.equal(app.run('configReadingTime'), expected);
    });
}

test('BUG-67: сохранённые 0 с сразу открывают обсуждение локального вопроса', () => {
    const app = load('0');
    app.run('openQuestion(0, 0, null, null)');
    assert.equal(app.run('isReadingTime'), false);
    assert.equal(app.run('timeLeft'), 30);
    assert.equal(app.node('timer').className, 'timer thinking');
    assert.match(app.node('timer-hint').textContent, /Обсуждение/);
    assert.equal(app.context.timerStarts, 1);
});

test('BUG-67: положительное чтение сохраняет фазу чтения', () => {
    const app = load('12');
    app.run('openQuestion(0, 0, null, null)');
    assert.equal(app.run('isReadingTime'), true);
    assert.equal(app.run('timeLeft'), 12);
    assert.equal(app.node('timer').className, 'timer reading');
    assert.equal(app.context.timerStarts, 1);
});
