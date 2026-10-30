const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const NetworkClient = require('../js/net/NetworkClient');
const source = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');

function section(start, end) {
    const from = source.indexOf(start), to = source.indexOf(end, from);
    assert.ok(from >= 0 && to > from, start);
    return source.slice(from, to);
}

const alice = { id: 'alice', name: 'Алиса', avatar: '🐱', score: 100, isConnected: true };
const bob = { id: 'bob', name: 'Боб', avatar: '🦊', score: 0, isConnected: true };

function app() {
    const nodes = new Map();
    function node(id) {
        if (nodes.has(id)) return nodes.get(id);
        const classes = new Set();
        const el = { id, style: {}, dataset: {}, value: '', children: [],
            classList: { add: x => classes.add(x), remove: x => classes.delete(x),
                contains: x => classes.has(x), toggle(x, on) { if (on) classes.add(x); else classes.delete(x); } },
            appendChild(child) { this.children.push(child); }, setAttribute() {},
            querySelectorAll: () => [], querySelector: () => null };
        let html = '';
        Object.defineProperty(el, 'innerHTML', { get: () => html, set(value) { html = value; el.children = []; } });
        nodes.set(id, el);
        return el;
    }
    class Client extends NetworkClient {
        connect() { this.isConnected = true; return Promise.resolve(); }
        disconnect() {}
    }
    const context = {
        NetworkClient: Client, location: new URL('http://localhost:8080/'), console,
        document: { getElementById: node, createElement: () => node('new-' + nodes.size) },
        setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
        teams: [{ ...alice }], gameStats: { 0: { correct: 2, wrong: 1, passes: 1, cats: 1, auctions: 0 } },
        currentTurnTeamIdx: 0, questionWinnerTeamIdx: null, lastLeaderNamesStr: null, coreScoreManager: null,
        currentRoundIndex: 0, currentThemeIdx: null, currentQuestionIdx: null,
        gameData: [{ themes: [] }, { roundName: 'Финал', themes: [{ name: 'Проверка', questions: [{ q: 'Вопрос?', a: 'Ответ', cost: 100 }] }] }],
        syncHostChrome() {}, syncLobbySettings() {}, renderLobbyPlayers() {},
        cancelPendingNetworkQuestionOpen() {}, updateTurnDisplay() {}, renderModalTeamsList() {}, saveGameState() {},
        syncTurnFromServer() {}, initBoard() {}, handleOnlineRoundTransition() {},
        clearGameState() {}, triggerFireworksAnimation() {}, stopFireworks() {},
        escapeHtml: text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
        showSystemModal(title, html) { context.modal = { title, html }; }
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(section('let isOnlineGame = false;', 'let currentLobbySettings ='), context);
    vm.runInContext(section('function updateTeamsPanel()', 'function promptScoreDirectly('), context);
    vm.runInContext(section('function changeTeamScore(', 'function skipRound('), context);
    vm.runInContext(section('function showWinnerCelebration()', 'function downloadPack('), context);
    vm.runInContext(section('function initHostNetwork(', '// Закрытие вопроса отменяет'), context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/final_round.js'), 'utf8'), context);
    vm.runInContext('isOnlineGame = true; isGameStarted = true; initHostNetwork();', context);
    const client = vm.runInContext('hostNetworkClient', context);
    const dispatch = (type, payload) => client._handleMessage({ type, payload: structuredClone(payload) });
    const snapshot = players => dispatch('ROOM_STATE', { state: 'BOARD', players });
    return { context, node, dispatch, snapshot };
}

test('BUG-78: поздний игрок появляется на табло, в финале, победителе и статистике', () => {
    const appState = app();
    const { context, node, dispatch, snapshot } = appState;
    dispatch('PLAYER_JOINED', { player: bob });
    snapshot([alice, bob]);
    assert.equal(context.teams.length, 2);
    assert.match(node('main-teams-panel').children.map(el => el.innerHTML).join(''), /Боб/);
    dispatch('SCORE_UPDATED', { playerId: 'bob', playerName: 'Боб', newScore: 900 });
    assert.equal(context.teams[1].score, 900);
    context.currentRoundIndex = 1;
    context.FinalRound.showForRound(1);
    assert.match(node('final-players').innerHTML, /Боб/);
    assert.match(node('final-players').innerHTML, /900/);
    context.showWinnerCelebration();
    assert.match(context.modal.html, /Боб/);
    assert.doesNotMatch(context.modal.html, /Алиса/);
    context.showFinalGameStats();
    assert.match(context.modal.html, /Боб/);
    assert.match(context.modal.html, /Алиса/);
    assert.match(context.modal.html, />900</);
});

test('BUG-78: повторный снимок и реконнект сохраняют индексы, очки и статистику', () => {
    const { context, dispatch, snapshot } = app();
    const originalTeam = context.teams[0], originalStats = context.gameStats[0];
    dispatch('PLAYER_JOINED', { player: bob });
    dispatch('SCORE_UPDATED', { playerId: 'bob', playerName: 'Боб', newScore: 300 });
    snapshot([{ ...bob, score: 300 }, { id: 'host', role: 'host', name: 'Ведущий' }, alice]);
    dispatch('PLAYER_JOINED', { player: { ...bob, name: 'Боб вернулся', score: 300 } });
    snapshot([alice, { ...bob, name: 'Боб вернулся', score: 300 }]);
    assert.equal(context.teams.length, 2);
    assert.equal(context.teams[0], originalTeam);
    assert.equal(context.gameStats[0], originalStats);
    assert.equal(context.gameStats[0].correct, 2);
    assert.equal(context.teams[1].name, 'Боб вернулся');
    assert.equal(context.teams[1].score, 300);
    assert.equal(context.gameStats[1].correct, 1);
    assert.equal(context.currentTurnTeamIdx, 0);
});

test('BUG-78: снимок восстанавливает пропущенное подключение и обновляет открытый финал', () => {
    const { context, node, snapshot } = app();
    context.currentRoundIndex = 1;
    context.FinalRound.showForRound(1);
    snapshot([alice, { ...bob, score: 700, isConnected: false }]);
    assert.equal(context.teams.length, 2);
    assert.equal(context.teams[1].score, 700);
    assert.equal(context.gameStats[1].correct, 0);
    assert.match(node('final-players').innerHTML, /Боб/);
    assert.equal(context.FinalRound.getStage(), 'intro');
});

test('BUG-78: лобби и локальная игра не меняют состав от сетевых событий', () => {
    const { context, dispatch } = app();
    vm.runInContext('isGameStarted = false;', context);
    dispatch('PLAYER_JOINED', { player: bob });
    assert.equal(context.teams.length, 1);
    vm.runInContext('isGameStarted = true; isOnlineGame = false;', context);
    dispatch('PLAYER_JOINED', { player: bob });
    assert.equal(context.teams.length, 1);
});
