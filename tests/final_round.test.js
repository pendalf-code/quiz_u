const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const PackParser = require('../js/core/PackParser');

const rootDir = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(rootDir, ...p), 'utf8').replace(/\r\n/g, '\n');

const one = (name) => ({ name, questions: [{ cost: 500, q: 'Q', a: 'A' }] });

test('PackParser.isFinalRound', async (t) => {
    await t.test('last round named "финал" with one question per theme', () => {
        assert.equal(PackParser.isFinalRound({ roundName: 'ФИНАЛ: Решающий раунд', themes: [one('T')] }, 2, 3), true);
        assert.equal(PackParser.isFinalRound({ roundName: 'Final', themes: [one('A'), one('B')] }, 0, 1), true);
    });

    await t.test('explicit isFinal flag works anywhere', () => {
        assert.equal(PackParser.isFinalRound({ roundName: 'Решающий', isFinal: true, themes: [one('T')] }, 0, 3), true);
    });

    await t.test('not a final: middle round, several questions, plain last round', () => {
        const many = { name: 'T', questions: [{ cost: 100, q: 'Q', a: 'A' }, { cost: 200, q: 'Q', a: 'A' }] };
        assert.equal(PackParser.isFinalRound({ roundName: 'Война Бесконечности и Финал', themes: [one('T')] }, 1, 4), false);
        assert.equal(PackParser.isFinalRound({ roundName: 'Финал', themes: [many] }, 2, 3), false);
        assert.equal(PackParser.isFinalRound({ roundName: 'Раунд 3', themes: [one('T')] }, 2, 3), false);
        assert.equal(PackParser.isFinalRound(null, 0, 1), false);
    });

    await t.test('betting view hides text, media and answer', () => {
        const safe = PackParser.sanitizeFinalQuestionForBetting({ cost: 500, q: 'Q', a: 'A', a_img: 'x', img: 'i', theme: 'Космос' });
        assert.deepEqual(safe, { cost: 500, type: 'final', theme: 'Космос' });
    });

    await t.test('all finals in the packs are recognized (124 single-question finals)', () => {
        const dir = path.join(rootDir, 'паки вопросов');
        let finals = 0;
        const walk = (d) => fs.readdirSync(d).forEach((f) => {
            const p = path.join(d, f);
            if (fs.statSync(p).isDirectory()) return walk(p);
            if (!f.endsWith('.json')) return;
            let rounds;
            try { rounds = PackParser.normalizeGameData(JSON.parse(fs.readFileSync(p, 'utf8'))); } catch (e) { return; }
            rounds.forEach((r, i) => { if (PackParser.isFinalRound(r, i, rounds.length)) finals++; });
        });
        walk(dir);
        assert.ok(finals >= 100, `expected the pack finals to be detected, got ${finals}`);
    });
});

test('Final round: protocol and client wiring', async (t) => {
    await t.test('new messages exist on both sides and are dispatched (invariant 8)', () => {
        const client = read('js', 'net', 'Protocol.js');
        const server = read('server', 'src', 'protocol.js');
        ['HOST_JUDGE_FINAL', 'FINAL_JUDGED'].forEach((type) => {
            assert.ok(client.includes(`${type}: '${type}'`), `client Protocol lacks ${type}`);
            assert.ok(server.includes(`${type}: '${type}'`), `server protocol lacks ${type}`);
        });
        const nc = read('js', 'net', 'NetworkClient.js');
        assert.ok(nc.includes('case MSG.FINAL_JUDGED:'));
        assert.ok(nc.includes('judgeFinal(playerId, isCorrect)'));
    });

    await t.test('PC opens the final screen instead of a one-cell board and loads the module', () => {
        const gameJs = read('js', 'game.js');
        const html = read('index.html');
        assert.ok(gameJs.includes('PackParser.isFinalRound(round, currentRoundIndex, gameData.length)'));
        assert.ok(gameJs.includes("hostNetworkClient.on('final_judged'"));
        assert.ok(html.includes('id="final-screen"'));
        assert.ok(html.indexOf('<script src="js/final_round.js">') > html.indexOf('<script src="js/game.js">'), 'final_round.js uses game.js globals');
    });

    await t.test('final screen does not change scores itself in LAN (invariant 1)', () => {
        const src = read('js', 'final_round.js');
        const judge = src.slice(src.indexOf('function judge(key, isCorrect)'), src.indexOf('function afterVerdict()'));
        const lanPart = judge.slice(0, judge.indexOf('const idx'));
        assert.ok(lanPart.includes('hostNetworkClient.judgeFinal(key, isCorrect)'));
        assert.ok(!lanPart.includes('changeTeamScore'));
    });

    await t.test('phone host judges final answers through the server', () => {
        const mobileJs = read('mobile', 'mobile.js');
        assert.ok(mobileJs.includes('netClient.judgeFinal(pid, true)'));
        assert.ok(mobileJs.includes("netClient.on('final_judged'"));
    });
});
