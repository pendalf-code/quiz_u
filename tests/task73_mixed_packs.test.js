const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const PackParser = require('../js/core/PackParser');
const dir = path.join(__dirname, '../паки вопросов/19_Микс_и_Эрудиция');

test('TASK-73: 200 микс-паков с 2–3 раундами, финалом и тремя видами медиа', () => {
    const files = fs.readdirSync(dir).filter(f => /^\d+_.*\.json$/.test(f) && parseInt(f, 10) >= 692 && parseInt(f, 10) <= 891).sort();
    assert.deepEqual(files.map(f => parseInt(f, 10)), Array.from({ length: 200 }, (_, i) => 692 + i));
    for (const file of files) {
        const raw = fs.readFileSync(path.join(dir, file), 'utf8');
        assert.ok(!/(?<!\r)\n/.test(raw), `${file}: CRLF`);
        const data = JSON.parse(raw);
        assert.ok(['easy', 'medium'].includes(data.difficulty), `${file}: difficulty`);
        const rounds = PackParser.normalizeGameData(data);
        const finals = rounds.filter((r, i) => PackParser.isFinalRound(r, i, rounds.length));
        const regular = rounds.filter(r => !finals.includes(r));
        assert.ok(regular.length === 2 || regular.length === 3, `${file}: regular rounds`);
        assert.equal(finals.length, 1, `${file}: final count`);
        assert.equal(rounds.at(-1), finals[0], `${file}: final order`);
        assert.equal(finals[0].roundName, 'ФИНАЛ', file);
        assert.equal(finals[0].themes.length, 1, file);
        assert.equal(finals[0].themes[0].questions.length, 1, file);
        for (const round of regular) {
            assert.ok(round.themes.length >= 5 && round.themes.length <= 6, file);
            for (const theme of round.themes) assert.equal(theme.questions.length, 5, `${file}: ${theme.name}`);
        }
        const questions = rounds.flatMap(r => r.themes.flatMap(t => t.questions));
        for (const key of ['img', 'music', 'video']) assert.ok(questions.some(q => q[key]), `${file}: ${key}`);
        assert.equal(data.questionsCount, questions.length, file);
        assert.equal(data.roundsCount, regular.length, file);
        assert.equal(data.hasFinal, true, file);
    }
});
