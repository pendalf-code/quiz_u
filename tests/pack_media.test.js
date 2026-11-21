const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mixedPackMediaLimit } = require('../tools/mixed_packs.js');

const rootDir = path.join(__dirname, '..');
const packsDir = path.join(rootDir, 'паки вопросов');
const MEDIA_KEYS = ['img', 'music', 'audio', 'video', 'a_img', 'a_video', 'answer_img', 'answer_video'];

function forEachQuestion(cb) {
    for (const folder of fs.readdirSync(packsDir)) {
        const folderPath = path.join(packsDir, folder);
        if (!fs.statSync(folderPath).isDirectory()) continue;
        for (const file of fs.readdirSync(folderPath).filter(f => f.endsWith('.json'))) {
            const raw = fs.readFileSync(path.join(folderPath, file), 'utf8').replace(/^﻿/, '');
            const data = JSON.parse(raw);
            const rounds = Array.isArray(data) ? data : (data.rounds || [data]);
            for (const round of rounds) {
                for (const theme of round.themes || []) {
                    for (const q of theme.questions || []) cb(q, `${folder}/${file}`);
                }
            }
        }
    }
}

test('PC answer screen shows a_img (pack format) as well as legacy answer_img', () => {
    const src = fs.readFileSync(path.join(rootDir, 'js', 'game.js'), 'utf8');
    assert.ok(src.includes('currentQuestionObj.a_img || currentQuestionObj.answer_img'));
    assert.ok(src.includes('question.a_video || question.answer_video'));
});

test('every media file referenced by packs exists', () => {
    const missing = [];
    forEachQuestion((q, where) => {
        for (const key of MEDIA_KEYS) {
            const val = q[key];
            if (typeof val !== 'string' || val.startsWith('data:') || /^https?:/.test(val)) continue;
            if (!fs.existsSync(path.join(rootDir, val))) missing.push(`${where}: ${key}=${val}`);
        }
    });
    assert.deepEqual(missing.slice(0, 20), []);
});

test('final rounds are named «ФИНАЛ» and their themes have real topic names', () => {
    const PackParser = require('../js/core/PackParser');
    const bad = [];
    for (const folder of fs.readdirSync(packsDir)) {
        const folderPath = path.join(packsDir, folder);
        if (!fs.statSync(folderPath).isDirectory()) continue;
        for (const file of fs.readdirSync(folderPath).filter(f => f.endsWith('.json'))) {
            const data = JSON.parse(fs.readFileSync(path.join(folderPath, file), 'utf8').replace(/^﻿/, ''));
            const rounds = Array.isArray(data) ? data : (data.rounds || [data]);
            rounds.forEach((round, idx) => {
                if (!PackParser.isFinalRound(round, idx, rounds.length)) return;
                if (round.roundName !== 'ФИНАЛ') bad.push(`${folder}/${file}: roundName=${round.roundName}`);
                for (const theme of round.themes) {
                    if (/финал/i.test(theme.name || '')) bad.push(`${folder}/${file}: theme=${theme.name}`);
                }
            });
        }
    }
    assert.deepEqual(bad.slice(0, 20), []);
});

test('costs grow within every theme (difficulty follows the cost, TASK-57)', () => {
    const bad = [];
    for (const folder of fs.readdirSync(packsDir)) {
        const folderPath = path.join(packsDir, folder);
        if (!fs.statSync(folderPath).isDirectory()) continue;
        for (const file of fs.readdirSync(folderPath).filter(f => f.endsWith('.json'))) {
            const data = JSON.parse(fs.readFileSync(path.join(folderPath, file), 'utf8').replace(/^﻿/, ''));
            const rounds = Array.isArray(data) ? data : (data.rounds || [data]);
            for (const round of rounds) {
                for (const theme of round.themes || []) {
                    const costs = (theme.questions || []).map(q => (q.cost !== undefined ? q.cost : q.price));
                    if (costs.some((c, i) => i > 0 && c <= costs[i - 1])) bad.push(`${folder}/${file}: ${theme.name} [${costs}]`);
                }
            }
        }
    }
    assert.deepEqual(bad.slice(0, 20), []);
});

test('media questions stay balanced: at most 2 per pack outside the art category and requested multimedia packs', () => {
    const over = [];
    for (const folder of fs.readdirSync(packsDir)) {
        const folderPath = path.join(packsDir, folder);
        if (!fs.statSync(folderPath).isDirectory() || folder.startsWith('16_')) continue;
        for (const file of fs.readdirSync(folderPath).filter(f => f.endsWith('.json'))) {
            const data = JSON.parse(fs.readFileSync(path.join(folderPath, file), 'utf8').replace(/^﻿/, ''));
            const rounds = Array.isArray(data) ? data : (data.rounds || [data]);
            let media = 0;
            for (const round of rounds) {
                for (const theme of round.themes || []) {
                    for (const q of theme.questions || []) if (q.img || q.music || q.audio || q.video) media++;
                }
            }
            const packNumber = parseInt(file, 10);
            const isTask70 = folder === '19_Микс_и_Эрудиция' && packNumber >= 492 && packNumber <= 691;
            const isTask73 = folder === '19_Микс_и_Эрудиция' && packNumber >= 692 && packNumber <= 891;
            const isPartyPack = folder === '20_Семейная_вечеринка' && packNumber >= 892 && packNumber <= 894;
            if (isPartyPack) {
                const questions = rounds.flatMap(round => round.themes.flatMap(theme => theme.questions));
                for (const key of ['img', 'music', 'video']) {
                    assert.ok(questions.filter(q => q[key]).length >= 2, `${file}: требуется несколько ${key}`);
                }
            }
            const mediaLimit = folder === '19_Микс_и_Эрудиция' ? mixedPackMediaLimit(packNumber) : 2;
            if (!isTask70 && !isTask73 && !isPartyPack && media > mediaLimit) over.push(`${folder}/${file}: ${media}`);
        }
    }
    assert.deepEqual(over, []);
});

test('семейная вечеринка: три табло 5×5 с ростом цен и отдельный финал', () => {
    const folder = path.join(packsDir, '20_Семейная_вечеринка');
    for (let number = 1; number <= 3; number++) {
        const file = path.join(folder, `${891 + number}_пак ${number}.json`);
        const { rounds } = JSON.parse(fs.readFileSync(file, 'utf8'));
        assert.equal(rounds.length, 4, file);
        const boards = rounds.slice(0, 3);
        boards.forEach((round, index) => {
            assert.ok(!round.isFinal, file);
            assert.equal(round.themes.length, 5, file);
            for (const theme of round.themes) {
                assert.deepEqual(theme.questions.map(q => q.cost),
                    [100, 200, 300, 400, 500].map(cost => cost * (index + 1)), theme.name);
            }
        });
        const hybrids = boards.flatMap(r => r.themes).filter(t => t.name === 'Шлакоблокунь');
        assert.equal(hybrids.length, 1, file);
        const pictures = hybrids[0].questions.map(q => q.img);
        assert.ok(pictures.every(Boolean), file);
        assert.equal(new Set(pictures).size, 5, file);
        const final = rounds[3];
        assert.equal(final.roundName, 'ФИНАЛ', file);
        assert.equal(final.isFinal, true, file);
        assert.equal(final.themes.length, 1, file);
        assert.equal(final.themes[0].questions.length, 1, file);
    }
});

test('every pack question ends with a question mark', () => {
    const bad = [];
    forEachQuestion((q, where) => {
        if (!/\?\s*$/.test(String(q.q || ''))) bad.push(`${where}: ${q.q}`);
    });
    assert.deepEqual(bad.slice(0, 20), []);
});
