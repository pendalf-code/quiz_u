const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(rootDir, ...p), 'utf8').replace(/\r\n/g, '\n');

function extractFunction(src, name) {
    const start = src.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `${name} not found`);
    let depth = 0;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
        if (src[i] === '{') depth++;
        if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
    }
    throw new Error(`unbalanced ${name}`);
}

/** Runs the local turn helpers of game.js against a sandbox */
function turnSandbox(mode, current, winner) {
    const gameJs = read('js', 'game.js');
    const sandbox = {
        teams: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
        configTurnOrderMode: mode,
        currentTurnTeamIdx: current,
        questionWinnerTeamIdx: winner
    };
    vm.createContext(sandbox);
    vm.runInContext([
        'var teams = this.teams, configTurnOrderMode = this.configTurnOrderMode;',
        'var currentTurnTeamIdx = this.currentTurnTeamIdx, questionWinnerTeamIdx = this.questionWinnerTeamIdx;',
        extractFunction(gameJs, 'getNextTurnTeamIdxAfterQuestion'),
        extractFunction(gameJs, 'getNextTurnTeamIdxAfterRound')
    ].join('\n'), sandbox);
    return sandbox;
}

test('Turn order: local game', async (t) => {
    await t.test('rotation passes the turn on after every question and round', () => {
        const sb = turnSandbox('rotation', 2, 0);
        assert.equal(vm.runInContext('getNextTurnTeamIdxAfterQuestion()', sb), 0, 'wraps, ignores who answered');
        assert.equal(vm.runInContext('getNextTurnTeamIdxAfterRound()', sb), 0);
    });

    await t.test('winner mode: the right answer takes the turn, otherwise the chooser keeps it', () => {
        assert.equal(vm.runInContext('getNextTurnTeamIdxAfterQuestion()', turnSandbox('winner', 0, 2)), 2);
        assert.equal(vm.runInContext('getNextTurnTeamIdxAfterQuestion()', turnSandbox('winner', 1, null)), 1);
        assert.equal(vm.runInContext('getNextTurnTeamIdxAfterRound()', turnSandbox('winner', 1, null)), 1);
    });

    await t.test('the setting is persisted defensively and offered in both settings forms', () => {
        const gameJs = read('js', 'game.js');
        const html = read('index.html');
        assert.ok(extractFunction(gameJs, 'readTurnOrderSetting').includes('try {'));
        const values = new Map();
        const settingContext = vm.createContext({
            configTurnOrderMode: 'rotation',
            localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) }
        });
        vm.runInContext(read('js', 'storage.js'), settingContext);
        vm.runInContext(extractFunction(gameJs, 'readTurnOrderSetting') + '\n' + extractFunction(gameJs, 'saveTurnOrderSetting'), settingContext);
        vm.runInContext('saveTurnOrderSetting("winner")', settingContext);
        assert.equal(values.get('cfg_turn_order'), 'winner');
        assert.equal(vm.runInContext('readTurnOrderSetting()', settingContext), 'winner');
        assert.ok(html.includes('id="setting-turn-order"'));
        assert.ok(html.includes('id="lobby-setting-turn-order"'));
        assert.ok(html.includes('Ходит ответивший верно'));
    });
});

test('Turn order: LAN wiring', async (t) => {
    await t.test('TURN_CHANGED / HOST_SET_TURN on both sides and dispatched (invariant 8)', () => {
        ['TURN_CHANGED', 'HOST_SET_TURN'].forEach((type) => {
            assert.ok(read('js', 'net', 'Protocol.js').includes(`${type}: '${type}'`));
            assert.ok(read('server', 'src', 'protocol.js').includes(`${type}: '${type}'`));
        });
        const nc = read('js', 'net', 'NetworkClient.js');
        assert.ok(nc.includes('case MSG.TURN_CHANGED:'));
        assert.ok(nc.includes('setTurn(playerId)'));
    });

    await t.test('the PC mirrors the server turn instead of rotating itself', () => {
        const gameJs = read('js', 'game.js');
        const closed = gameJs.slice(gameJs.indexOf("hostNetworkClient.on('question_closed'"), gameJs.indexOf("hostNetworkClient.on('question_active'"));
        assert.ok(!closed.includes('currentTurnTeamIdx = (currentTurnTeamIdx + 1)'));
        assert.ok(gameJs.includes("hostNetworkClient.on('turn_changed'"));
        assert.ok(extractFunction(gameJs, 'selectTurnTeam').includes('hostNetworkClient.setTurn('));
    });

    await t.test('phones show whose turn it is', () => {
        const mobileJs = read('mobile', 'mobile.js');
        assert.ok(mobileJs.includes("netClient.on('turn_changed'"));
        assert.ok(mobileJs.includes('Ваш ход!'));
    });
});
