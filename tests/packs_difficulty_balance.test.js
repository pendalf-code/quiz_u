const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PackParser = require('../js/core/PackParser');

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'js/packs_catalog.json'), 'utf8'));

test('простые и средние паки составляют большинство каталога', () => {
    const counts = { easy: 0, medium: 0, hard: 0, expert: 0 };
    for (const pack of catalog) {
        assert.ok(Object.hasOwn(counts, pack.difficulty), pack.id);
        counts[pack.difficulty]++;
    }
    assert.ok(counts.easy > 0 && counts.medium > 0, JSON.stringify(counts));
    assert.ok(counts.easy + counts.medium > counts.hard + counts.expert, JSON.stringify(counts));
});

test('сложность каждой карточки совпадает с явной меткой исходного пака', () => {
    for (const pack of catalog) {
        const source = JSON.parse(fs.readFileSync(path.join(root, pack.filePath), 'utf8').replace(/^\uFEFF/, ''));
        assert.equal(pack.difficulty, source.difficulty, pack.filePath);
    }
});

test('списки тем в метаданных паков соответствуют текущим вопросам', () => {
    for (const pack of catalog) {
        const source = JSON.parse(fs.readFileSync(path.join(root, pack.filePath), 'utf8').replace(/^\uFEFF/, ''));
        if (!source.themeNames) continue;
        const names = PackParser.normalizeGameData(source).flatMap(round => round.themes.map(theme => theme.name));
        assert.deepEqual(source.themeNames, names, pack.filePath);
    }
});
