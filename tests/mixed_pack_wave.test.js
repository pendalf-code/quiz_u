const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const test = require('node:test');

const cli = path.join(__dirname, '../tools/mixed_pack_wave.js');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function fixture(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-mix-wave-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const before = path.join(dir, 'before');
    const after = path.join(dir, 'after');
    fs.mkdirSync(before);
    fs.mkdirSync(after);
    function run(args, expectedCode = 0) {
        const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
        assert.equal(result.status, expectedCode, result.stderr || result.stdout);
    }
    function report(expectedCode, ...options) {
        const out = path.join(dir, 'report.json');
        run(['report', before, out, '--source', after, '--from', '492', '--to', '493', ...options], expectedCode);
        return JSON.parse(fs.readFileSync(out, 'utf8'));
    }
    return { dir, before, after, run, report };
}

function pack(num) {
    const themes = [
        { name: 'Оптика', questions: [
            { q: 'Что на снимке отражает свет?', a: 'Зеркало', cost: 100, img: 'assets/q_img/123.jpg' },
            { q: 'Что на видео создаёт блик?', a: 'Зеркало', cost: 200, video: 'assets/video/flower.mp4' }
        ] },
        { name: 'Акустика', questions: [
            { q: 'Какой звук слышен в записи?', a: 'Эхо', cost: 100, music: 'assets/music/horse.mp3' },
            { q: 'Какое свойство звука меняется?', a: 'Громкость', cost: 200 }
        ] },
        { name: 'Посуда', questions: [
            { q: 'Из какого сосуда наливают воду?', a: 'Из кувшина', cost: 100 },
            { q: 'Как называется глубокая ёмкость с крышкой?', a: 'Кастрюля', cost: 200 }
        ] }
    ];
    return {
        num, id: `pack_${num}_микс`, title: `Вопросы и ответы ${num}`, category: 'Микс и Эрудиция',
        categoryFolder: '19_Микс_и_Эрудиция', categoryIcon: '🎲', difficulty: 'medium',
        roundsCount: 1, hasFinal: false, description: 'Подборка вопросов по трём предметным областям.', hasMedia: true,
        hasCat: true, hasAuction: true, tags: ['оптика', 'звук', 'быт'], themeNames: ['Оптика', 'Акустика', 'Посуда'],
        questionsCount: 6, rounds: [{ roundName: 'Первое табло', themes }]
    };
}

function writePack(dir, data, file = `${data.num}_${data.title}.json`, bom = '') {
    const target = path.join(dir, file);
    fs.writeFileSync(target, bom + JSON.stringify(data, null, 2).replace(/\n/g, '\r\n') + '\r\n', 'utf8');
    return target;
}

test('snapshot preserves source bytes and refuses overwrites or tampered contents', t => {
    const f = fixture(t);
    const file = writePack(f.before, pack(492), undefined, '\uFEFF');
    const snapshotPath = path.join(f.dir, 'snapshot.json');
    f.run(['snapshot', snapshotPath, '--source', f.before, '--from', '492', '--to', '492']);
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    const source = fs.readFileSync(file);
    assert.deepEqual(Buffer.from(snapshot.files[0].text, 'utf8'), source);
    assert.equal(snapshot.files[0].sha256, digest(source));
    f.run(['snapshot', snapshotPath, '--source', f.before, '--from', '492', '--to', '492'], 2);
    snapshot.files[0].text = snapshot.files[0].text.replace('Акустика', 'Музыка');
    const badPath = path.join(f.dir, 'bad.json');
    fs.writeFileSync(badPath, JSON.stringify(snapshot));
    const out = path.join(f.dir, 'tampered.json');
    f.run(['report', badPath, out, '--source', f.before, '--from', '492', '--to', '492'], 1);
    assert.match(JSON.parse(fs.readFileSync(out, 'utf8')).coverage.before.issues[0].reason, /SHA-256/);
});

test('report compares final cells and detects whole-question moves with media and fixed prices', t => {
    const f = fixture(t);
    const edited = pack(492);
    writePack(f.before, edited);
    const [first, second] = edited.rounds[0].themes[0].questions;
    edited.rounds[0].themes[0].questions = [{ ...second, cost: 100 }, { ...first, cost: 200 }];
    edited.rounds[0].themes[1].name = 'Что слышно';
    edited.rounds[0].themes[1].note = 'Тема уточнена';
    edited.themeNames[1] = 'Что слышно';
    edited.description = 'Обновлённое описание итоговой версии вопросов.';
    writePack(f.after, edited);
    for (const dir of [f.before, f.after]) writePack(dir, pack(493));
    const r = f.report(0);
    assert.equal(r.summary.byteChangedPacks, 1);
    assert.equal(r.summary.changedQuestionSlots, 2);
    assert.equal(r.summary.changedThemeSlots, 1);
    assert.equal(r.summary.questionMoves, 2);
    const { diff } = r.packs[0];
    assert.deepEqual(diff.moves, [
        { from: '1:1:1', to: '1:1:2', costBefore: 100, costAfter: 200 },
        { from: '1:1:2', to: '1:1:1', costBefore: 200, costAfter: 100 }
    ]);
    assert.equal(diff.cells[0].after.video, second.video);
    assert.equal(diff.cells[1].after.img, first.img);
    assert.deepEqual(diff.metadata.map(change => change.key), ['description', 'themeNames']);
    assert.deepEqual(diff.themes[0].after, { name: 'Что слышно', note: 'Тема уточнена' });
    assert.deepEqual(diff.violations, []);
    assert.equal(r.candidates.before.openingCuePatterns[0].count, 2);
    assert.equal(r.candidates.after.openingCuePatterns[0].count, 2);
    assert.equal(r.candidates.after.sameAnswerWithinTheme.length, 2);
    assert.equal(r.candidates.after.sameMediaAndAnswer.length, 3);
});

test('cross-cell answer candidates show literal and inflected evidence within one theme', t => {
    const f = fixture(t);
    const data = pack(492);
    const [rowing, measurements, other] = data.rounds[0].themes;
    rowing.questions = [
        { ...rowing.questions[0], q: 'Кто задаёт курс гребцам?', a: 'Рулевой (кокс)' },
        { ...rowing.questions[1], q: 'Сколько людей в гребной восьмёрке вместе с рулевым?', a: 'Девять' },
        { q: 'Как называется соревнование гребцов?', a: 'Гребная регата', cost: 300 },
        { q: 'Когда впервые состоялась гребная регата с участием девяти команд?', a: '1896', cost: 400 },
        { q: 'Какую отметку поставили в 1896 году за девять заездов?', a: 'Место', cost: 500 },
        { q: 'Что в отчёте упомянуто как место проведения?', a: 'Эхо', cost: 600 },
        { q: 'Что передаёт рисунок с эхом и фрагментом слова «нерулевым»?', a: 'Схему', cost: 700 }
    ];
    measurements.questions[0].q = 'Когда прошла гребная регата?';
    other.questions[0].q = 'Как отличить гребную регату от сплава?';
    data.questionsCount = 11;
    writePack(f.before, data);
    rowing.questions[1].q = 'Сколько человек составляют экипаж восьмёрки?';
    writePack(f.after, data);
    for (const dir of [f.before, f.after]) writePack(dir, pack(493));
    const r = f.report(0);
    const location = (cell, cost) => ({ num: 492, round: 1, theme: 1, cell, cost });
    assert.deepEqual(r.candidates.before.crossCellAnswerLeaks, [
        { themeName: 'Оптика', answerCell: location(1, 100), questionCell: location(2, 200),
            answer: 'рулевой', matched: 'рулевым', basis: 'adjectiveInstrumental' },
        { themeName: 'Оптика', answerCell: location(3, 300), questionCell: location(4, 400),
            answer: 'гребная регата', matched: 'гребная регата', basis: 'literal' }
    ]);
    assert.deepEqual(r.candidates.after.crossCellAnswerLeaks.map(hit => hit.basis), ['literal']);
    assert.equal(r.technicalOk, true);
});

test('theme titles flag full answers and possible names without flagging ordinary subject overlap', t => {
    const f = fixture(t);
    const data = pack(492);
    const [portrait, railway, other] = data.rounds[0].themes;
    portrait.name = 'Данте и его путь';
    portrait.questions[0].q = 'Кто изображён на портрете?';
    portrait.questions[0].a = 'Данте Алигьери';
    portrait.questions[1].q = 'Как называется поэма Данте о загробном мире?';
    portrait.questions[1].a = 'Божественная комедия';
    railway.name = 'Непростой билет';
    railway.questions[0].q = 'Что пассажир показывает при посадке?';
    railway.questions[0].a = 'Билет (электронный билет)';
    railway.questions[1].q = 'Какой документ подтверждает право на льготу?';
    railway.questions[1].a = 'Льготный билет';
    other.name = 'Лев и время';
    other.questions[0].q = 'Как звали автора романа?';
    other.questions[0].a = 'Лев Толстой';
    other.questions[1].a = 'Время';
    data.themeNames = data.rounds[0].themes.map(theme => theme.name);
    writePack(f.before, data);
    portrait.name = 'Итальянская поэма';
    data.themeNames[0] = portrait.name;
    writePack(f.after, data);
    for (const dir of [f.before, f.after]) writePack(dir, pack(493));
    const r = f.report(0);
    assert.deepEqual(r.candidates.before.titleAnswerLeaks, [
        { title: 'Данте и его путь', answer: 'Данте Алигьери',
            answerCell: { num: 492, round: 1, theme: 1, cell: 1, cost: 100 },
            matched: 'данте', basis: 'partialName', confidence: 'low' },
        { title: 'Непростой билет', answer: 'Билет (электронный билет)',
            answerCell: { num: 492, round: 1, theme: 2, cell: 1, cost: 100 },
            matched: 'билет', basis: 'literal' }
    ]);
    assert.deepEqual(r.candidates.after.titleAnswerLeaks, r.candidates.before.titleAnswerLeaks.slice(1));
    assert.equal(r.technicalOk, true);
});

test('report flags missing references, required types, changed prices and stale derived metadata', t => {
    const f = fixture(t);
    const edited = pack(492);
    writePack(f.before, edited);
    const [first, second] = edited.rounds[0].themes[0].questions;
    first.img = 'assets/q_img/other.jpg';
    delete second.video;
    second.cost = 400;
    edited.roundsCount = 2;
    edited.themeNames[0] = 'Старое имя';
    writePack(f.after, edited);
    for (const dir of [f.before, f.after]) writePack(dir, pack(493));
    const r = f.report(1);
    const { diff, currentIssues } = r.packs[0];
    assert.deepEqual(diff.violations, ['prices']);
    assert.deepEqual(currentIssues, ['roundsCount', 'themeNames', 'requiredMedia:video', 'mediaReference:1:1:1:img:assets/q_img/other.jpg']);
    assert.equal(diff.cells[0].before.img, 'assets/q_img/123.jpg');
    assert.equal(diff.cells[0].after.img, 'assets/q_img/other.jpg');
    assert.deepEqual(diff.mediaCells[1], {
        slot: '1:1:2', changes: [{ key: 'video', before: 'assets/video/flower.mp4' }]
    });
});

test('valid editorial media replacement is reported and passes technical checks', t => {
    const f = fixture(t);
    const edited = pack(492);
    writePack(f.before, edited);
    edited.rounds[0].themes[0].questions[1].q = 'Как предмет в ролике отражает луч?';
    edited.rounds[0].themes[0].questions[1].video = 'assets/video/friday.mp4';
    writePack(f.after, edited);
    for (const dir of [f.before, f.after]) writePack(dir, pack(493));
    const r = f.report(0);
    assert.equal(r.technicalOk, true);
    assert.equal(r.editorialReviewState, 'not_supplied');
    assert.equal(r.packs[0].diff.mediaCells[0].slot, '1:1:2');
    assert.deepEqual(r.summary.mediaInventoryChangedIds, [492]);
    assert.deepEqual(r.packs[0].diff.mediaInventoryChanges, [
        { field: 'video', reference: 'assets/video/flower.mp4', before: 1, after: 0 },
        { field: 'video', reference: 'assets/video/friday.mp4', before: 0, after: 1 }
    ]);
});

test('invalid UTF-8 is attributed to the offending file', t => {
    const f = fixture(t);
    const current = writePack(f.after, pack(492));
    fs.writeFileSync(current, Buffer.from([0xff]));
    writePack(f.before, pack(492));
    for (const dir of [f.before, f.after]) writePack(dir, pack(493));
    const r = f.report(1);
    assert.equal(r.coverage.after.issues[0].file, path.basename(current));
    assert.match(r.coverage.after.issues[0].reason, /utf-8/i);
});

test('an equal file count cannot hide a missing ID, duplicate ID or file/data disagreement', t => {
    const f = fixture(t);
    writePack(f.before, pack(492));
    writePack(f.before, pack(493));
    writePack(f.after, pack(492));
    writePack(f.after, pack(493), '492_Другая копия.json');
    const r = f.report(1);
    assert.deepEqual(r.coverage.after.missing, [493]);
    assert.deepEqual(r.coverage.after.duplicates, [492]);
    assert.match(r.coverage.after.issues[0].reason, /num\/id/);
    assert.equal(r.summary.comparablePacks, 0);
});

test('review coverage checks final hashes, declared full reading and exactly one record per ID', t => {
    const f = fixture(t);
    const old = pack(492);
    const oldFile = writePack(f.before, old);
    old.rounds[0].themes[0].questions[0].q += ' Уточнение?';
    const newFile = writePack(f.after, old);
    const other = pack(493);
    writePack(f.before, other);
    const otherFile = writePack(f.after, other);
    const row = (pack, file) => ({ num: pack.num, title: pack.title, sourceSha256: digest(fs.readFileSync(file)),
        coverage: 'full_question_text', decision: 'edit', rationale: 'Проверены итоговые вопросы' });
    const reviewed = path.join(f.dir, 'reviews.json');
    const finalRow = row(old, newFile);
    fs.writeFileSync(reviewed, JSON.stringify({ records: [finalRow, row(other, otherFile)] }));
    const valid = f.report(0, '--review', reviewed);
    assert.equal(valid.editorialReviewState, 'records_match');
    assert.deepEqual(valid.coverage.reviews, { expected: 2, unique: 2, missing: [], duplicates: [], issues: [] });
    assert.equal(valid.packs[0].review.rationale, finalRow.rationale);
    fs.unlinkSync(path.join(f.dir, 'report.json'));
    fs.writeFileSync(reviewed, JSON.stringify([row(old, oldFile), { ...finalRow, coverage: 'answers_only' }]));
    const invalid = f.report(1, '--review', reviewed);
    assert.equal(invalid.editorialReviewState, 'incomplete_or_stale');
    assert.deepEqual(invalid.coverage.reviews.missing, [493]);
    assert.deepEqual(invalid.coverage.reviews.duplicates, [492]);
    assert.equal(invalid.coverage.reviews.issues.length, 2);
    assert.equal(invalid.packs[0].review, undefined);
});
