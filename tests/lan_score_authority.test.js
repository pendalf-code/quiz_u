const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(rootDir, ...p), 'utf8').replace(/\r\n/g, '\n');

function sliceBetween(src, startMarker, endMarker) {
    const start = src.indexOf(startMarker);
    assert.ok(start >= 0, `marker not found: ${startMarker}`);
    const end = src.indexOf(endMarker, start + startMarker.length);
    assert.ok(end > start, `end marker not found: ${endMarker}`);
    return src.slice(start, end);
}

test('LAN: server is the single score authority on the host PC client', async (t) => {
    const gameJs = read('js', 'game.js');
    const mobileJs = read('mobile', 'mobile.js');

    await t.test('judgeOnlineAnswer does not change scores locally', () => {
        const body = sliceBetween(gameJs, 'function judgeOnlineAnswer(isCorrect)', '// Expose online functions to window');
        assert.ok(!body.includes('changeTeamScore('), 'local score change would double the points on the server');
        assert.ok(body.includes('hostNetworkClient.judgeAnswer(isCorrect,'), 'must pass the penalty flag to the server');
    });

    await t.test('judge_result handler does not change scores', () => {
        const body = sliceBetween(gameJs, "hostNetworkClient.on('judge_result'", "hostNetworkClient.on('show_answer'");
        assert.ok(!body.includes('changeTeamScore('));
    });

    await t.test('score_updated mirrors the server score without echoing it back', () => {
        const body = sliceBetween(gameJs, "hostNetworkClient.on('score_updated'", "hostNetworkClient.on('buzz_locked'");
        assert.ok(body.includes('changeTeamScore(teamIdx, diff, false)'));
        assert.ok(gameJs.includes('function changeTeamScore(teamIdx, amount, syncToServer = true)'));
    });
});

test('LAN: mobile player screen', async (t) => {
    const mobileJs = read('mobile', 'mobile.js');

    await t.test('GAME_OVER keeps players in the room (needed for "back to lobby")', () => {
        const body = sliceBetween(mobileJs, "case 'GAME_OVER':", "case 'QUESTION_READING':");
        assert.ok(!body.includes('leaveToMainMenu'));
    });

    await t.test('BUZZ_ACTIVE room_state respects buzzerOpenFor and pause', () => {
        assert.ok(mobileJs.includes('payload.buzzerOpenFor'));
        const readyCase = sliceBetween(mobileJs, "case 'ready':", "case 'self':");
        assert.ok(readyCase.includes('state.isPaused'));
    });

    await t.test('stale waiting texts are reset on BOARD', () => {
        const body = sliceBetween(mobileJs, "case 'BOARD':", "case 'ROUND_END':");
        assert.ok(body.includes('setWaitingTexts('));
    });
});

test('LAN: host PC does not restart the game on every room_state', () => {
    const gameJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'game.js'), 'utf8').replace(/\r\n/g, '\n');
    const body = sliceBetween(gameJs, 'function startOnlineGame(fromServer = false)', 'function judgeOnlineAnswer');
    assert.ok(body.includes('if (!hostNetworkClient || isGameStarted) return;'));
    assert.ok(body.indexOf('isGameStarted = true;') < body.indexOf('hostNetworkClient.startGame()'),
        'flag must be set before the server echo (room_state: BOARD) can arrive');
    assert.ok(gameJs.includes('startOnlineGame(true);'), 'server-initiated start must not send startGame again');
});

test('LAN: every server -> client broadcast is dispatched by NetworkClient', () => {
    const client = read('js', 'net', 'NetworkClient.js');
    const serverSrc = read('server', 'src', 'Room.js') + read('server', 'src', 'server.js');
    const sent = new Set([...serverSrc.matchAll(/(?:broadcastToAll|broadcastToPlayers|sendToHost|sendToPlayer)\((?:[^,]+, )?MSG_TYPES\.([A-Z_]+)/g)].map(m => m[1]));
    ['ROUND_CHANGED', 'BUZZ_RESET', 'SHOW_STATS'].forEach(t => sent.add(t));
    const missing = [...sent].filter(t => !client.includes(`case MSG.${t}:`));
    assert.deepEqual(missing, [], `NetworkClient ignores: ${missing.join(', ')}`);
});
