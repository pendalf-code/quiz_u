const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PackParser = require('../js/core/PackParser');

const root = path.resolve(__dirname, '..');
const generator = fs.readFileSync(path.join(root, 'tools/sync_all_catalog.js'), 'utf8');
const question = extra => ({ q: 'Вопрос?', a: 'Ответ', cost: 100, ...extra });
const round = (roundName, questions = [question(), question({ cost: 200 })], extra = {}) =>
    ({ roundName, themes: [{ name: 'Тема', questions }], ...extra });

// Выполняем настоящий генератор с файловой системой одной фикстуры, не меняя каталог проекта.
function generate(data) {
    const outputs = new Map();
    const folder = '02_Кино_и_Сериалы';
    const packsDir = path.join(root, 'паки вопросов');
    const fileSystem = {
        readdirSync(dir) { return dir === packsDir ? [folder] : ['217_Проверка финала.json']; },
        statSync() { return { isDirectory: () => true }; },
        readFileSync() { return JSON.stringify(data); },
        writeFileSync(file, content) { outputs.set(path.basename(file), content); }
    };
    vm.runInNewContext(generator, {
        __dirname: path.join(root, 'tools'),
        require(name) { return name === 'fs' ? fileSystem : name === 'path' ? path : require(path.resolve(root, 'tools', name)); },
        console: { log() {} }
    });
    const json = JSON.parse(outputs.get('packs_catalog.json'));
    const browser = { window: {} };
    vm.runInNewContext(outputs.get('packs_data.js'), browser);
    assert.deepEqual(JSON.parse(JSON.stringify(browser.window.AVAILABLE_PACKS)), json);
    return json[0];
}

test('BUG-69: обычный раунд со словом «Финал» остаётся в счётчике', () => {
    const pack = [round('Раунд 1'), round('Война Бесконечности и Финал'), round('За кулисами'), round('ФИНАЛ', [question()])];
    const entry = generate(pack);
    assert.equal(entry.roundsCount, 3);
    assert.equal(entry.hasFinal, true);
});

test('BUG-69: ложное слово «финал» без настоящего финала не включает фильтр финала', () => {
    const entry = generate([round('Финальные боссы'), round('Продолжение')]);
    assert.equal(entry.roundsCount, 2);
    assert.equal(entry.hasFinal, false);
});

test('BUG-69: вложенные rounds.value и явный isFinal используют правила ядра', () => {
    const entry = generate({ rounds: { value: [round('Особая тема', [question()], { isFinal: true }), round('Обычный раунд')] } });
    assert.equal(entry.roundsCount, 1);
    assert.equal(entry.hasFinal, true);
    assert.equal(entry.questionsCount, 3);
});

test('BUG-69: канонические и устаревшие медиаполя учитываются в каталоге', () => {
    for (const field of ['img', 'q_img', 'a_img', 'answer_img', 'music', 'audio', 'video', 'a_video', 'answer_video']) {
        const entry = generate([round('Раунд', [question({ [field]: 'assets/example' })])]);
        assert.equal(entry.hasMedia, true, field);
    }
    assert.equal(generate([round('Раунд')]).hasMedia, false);
});

test('BUG-69: весь сохранённый каталог согласован с фактическими паками и ядром', () => {
    const entries = JSON.parse(fs.readFileSync(path.join(root, 'js/packs_catalog.json'), 'utf8'));
    for (const entry of entries) {
        const rounds = PackParser.normalizeGameData(JSON.parse(fs.readFileSync(path.join(root, entry.filePath), 'utf8').replace(/^\uFEFF/, '')));
        const finalFlags = rounds.map((r, i) => PackParser.isFinalRound(r, i, rounds.length));
        const ordinaryCount = finalFlags.filter(flag => !flag).length;
        assert.equal(entry.roundsCount, ordinaryCount || rounds.length, entry.id);
        assert.equal(entry.hasFinal, finalFlags.some(Boolean), entry.id);
        const hasMedia = rounds.some(r => r.themes.some(t => t.questions.some(q =>
            ['img', 'q_img', 'a_img', 'answer_img', 'music', 'audio', 'video', 'a_video', 'answer_video'].some(key => Boolean(q[key])))));
        assert.equal(entry.hasMedia, hasMedia, entry.id);
    }
});
