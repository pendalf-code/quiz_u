/**
 * Инструмент для микс-паков (папка 19_Микс_и_Эрудиция, TASK-46).
 *
 *   node tools/mixed_packs.js normalize [--from N] [--to M]
 *       Дописывает метаданные (id, category, themeNames, roundsCount, hasFinal...),
 *       переименовывает файл в "NNN_Название.json", пишет JSON с CRLF.
 *   node tools/mixed_packs.js check [--from N] [--to M]
 *       Проверяет структуру, правила вопросов (OVERHAUL_2026-10) и спойлеры.
 *       Код выхода 1, если есть ошибки (warnings код не меняют).
 */
const fs = require('fs');
const path = require('path');
const PackParser = require('../js/core/PackParser.js');

const ROOT = path.join(__dirname, '..');
const PACKS_DIR = path.join(ROOT, 'паки вопросов');
const MIX_FOLDER = '19_Микс_и_Эрудиция';
const MIX_DIR = path.join(PACKS_DIR, MIX_FOLDER);
const MIX_CATEGORY = 'Микс и Эрудиция';
const MIX_ICON = '🎲';
const FINAL_COST = 1500;
const MEDIA_KEYS = ['img', 'music', 'video'];
const MAX_MEDIA_PER_PACK = 2;
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const MEDIA_WORDS = /(на фото|фотограф[иі]и? изображ|изображ[её]н|изображени|на картинке|на снимке|на экране|послушайте|прослушайте|звучит мелоди|на видео|на рисунке|покажите)/i;

function parseArgs(argv) {
    const args = { cmd: argv[0], from: 0, to: Infinity };
    for (let i = 1; i < argv.length; i++) {
        if (argv[i] === '--from') args.from = parseInt(argv[++i], 10);
        else if (argv[i] === '--to') args.to = parseInt(argv[++i], 10);
    }
    return args;
}

function readJson(filePath) {
    let raw = fs.readFileSync(filePath, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    return JSON.parse(raw);
}

function writeJsonCrlf(filePath, data) {
    const text = JSON.stringify(data, null, 2).replace(/\r?\n/g, '\r\n') + '\r\n';
    fs.writeFileSync(filePath, text, 'utf8');
}

function listMixFiles(from, to) {
    if (!fs.existsSync(MIX_DIR)) return [];
    return fs.readdirSync(MIX_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => ({ file: f, num: parseInt(f, 10) }))
        .filter(x => !isNaN(x.num) && x.num >= from && x.num <= to)
        .sort((a, b) => a.num - b.num);
}

function hasQuestionMedia(q) {
    return MEDIA_KEYS.some(k => typeof q[k] === 'string' && q[k].length > 0);
}

function isFinalRound(round) {
    return !!round.isFinal || /финал/i.test(round.roundName || '');
}

function safeFileTitle(title) {
    return String(title).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
}

function normalizePack(data, num) {
    const rounds = PackParser.normalizeGameData(data);
    rounds.forEach(r => {
        if (isFinalRound(r)) r.isFinal = true;
        (r.themes || []).forEach(t => (t.questions || []).forEach(q => {
            if (q.cost === undefined && q.price !== undefined) {
                q.cost = q.price;
                delete q.price;
            }
        }));
    });
    const regular = rounds.filter(r => !isFinalRound(r));
    const themeNames = [];
    let questionsCount = 0;
    rounds.forEach(r => (r.themes || []).forEach(t => {
        if (!isFinalRound(r)) themeNames.push(t.name);
        questionsCount += (t.questions || []).length;
    }));
    const numStr = String(num).padStart(3, '0');
    return {
        num: num,
        id: `pack_${numStr}_микс`,
        title: data.title,
        category: MIX_CATEGORY,
        categoryFolder: MIX_FOLDER,
        categoryIcon: MIX_ICON,
        difficulty: data.difficulty,
        roundsCount: regular.length,
        hasFinal: rounds.some(isFinalRound),
        description: data.description,
        hasMedia: rounds.some(r => (r.themes || []).some(t => (t.questions || []).some(hasQuestionMedia))),
        hasCat: true,
        hasAuction: true,
        tags: Array.isArray(data.tags) ? data.tags : [],
        themeNames: themeNames,
        questionsCount: questionsCount,
        rounds: rounds
    };
}

function cmdNormalize(args) {
    let count = 0;
    listMixFiles(args.from, args.to).forEach(({ file, num }) => {
        const src = path.join(MIX_DIR, file);
        const pack = normalizePack(readJson(src), num);
        const target = path.join(MIX_DIR, `${String(num).padStart(3, '0')}_${safeFileTitle(pack.title)}.json`);
        writeJsonCrlf(target, pack);
        if (path.resolve(target) !== path.resolve(src)) fs.unlinkSync(src);
        count++;
    });
    console.log(`Normalized ${count} mixed packs.`);
}

// --- spoiler helpers ---
const STOP = new Set(['какой', 'какая', 'какое', 'какие', 'каком', 'какого', 'какую', 'каким', 'этого', 'этот', 'этой', 'который', 'которая', 'которое', 'были', 'было', 'была', 'является', 'называют', 'называется', 'году', 'века', 'веке', 'город', 'страна', 'стран', 'также', 'более', 'самый', 'самая', 'самое', 'самой', 'самого', 'между', 'после', 'перед', 'через']);

function normText(s) {
    return String(s).toLowerCase().replace(/ё/g, 'е').replace(/<[^>]+>/g, ' ').replace(/[^a-zа-я0-9]+/g, ' ').trim();
}

function stems(s, minLen) {
    return normText(s).split(' ').filter(w => w.length >= minLen && !STOP.has(w)).map(w => w.slice(0, 5));
}

function answerVariants(a) {
    const noParen = String(a).replace(/\([^)]*\)/g, ' ');
    return noParen.split(/\s*(?:\/|;|,|\bили\b)\s*/i).map(normText).filter(Boolean);
}

function checkPack(file, data, ctx) {
    const errors = [];
    const warnings = [];
    const num = parseInt(file, 10);
    const expectedName = `${String(num).padStart(3, '0')}_${safeFileTitle(data.title || '')}.json`;
    if (file !== expectedName) errors.push(`file name should be "${expectedName}"`);
    if (data.num !== num) errors.push(`num ${data.num} != file number ${num}`);
    if (data.categoryFolder !== MIX_FOLDER || data.category !== MIX_CATEGORY) errors.push('category/categoryFolder not normalized (run normalize)');
    if (!DIFFICULTIES.includes(data.difficulty)) errors.push(`bad difficulty "${data.difficulty}"`);
    if (!data.title || data.title.length < 6) errors.push('title missing/too short');
    if (!data.description || data.description.length < 40) errors.push('description missing/too short (<40 chars)');
    if (/Увлекательная викторина по теме/.test(data.description || '')) errors.push('template description');
    if (!Array.isArray(data.tags) || data.tags.length < 3) errors.push('need >= 3 tags');
    // catalog.js вставляет описание как HTML
    if (/[<>]/.test((data.title || '') + (data.description || ''))) errors.push('title/description must not contain < or >');

    const titleKey = normText(data.title || '');
    if (ctx.titles.has(titleKey)) errors.push(`duplicate title (also ${ctx.titles.get(titleKey)})`);
    const descKey = normText(data.description || '');
    if (ctx.descs.has(descKey)) errors.push(`duplicate description (also ${ctx.descs.get(descKey)})`);
    ctx.descs.set(descKey, file);

    const v = PackParser.validatePack(data);
    if (!v.valid) v.errors.forEach(e => errors.push('PackParser: ' + e));

    const rounds = PackParser.normalizeGameData(data);
    const regular = rounds.filter(r => !isFinalRound(r));
    const finals = rounds.filter(isFinalRound);
    if (regular.length < 1 || regular.length > 3) errors.push(`expected 1-3 regular rounds, got ${regular.length}`);
    if (finals.length > 1) errors.push('more than one final round');
    if (finals.length && !isFinalRound(rounds[rounds.length - 1])) errors.push('final round must be last');
    const themeKeys = new Set();
    regular.forEach((r, rIdx) => {
        if (!r.roundName) errors.push(`round ${rIdx + 1} has no roundName`);
        const n = (r.themes || []).length;
        if (n < 5 || n > 6) errors.push(`round ${rIdx + 1}: expected 5-6 themes, got ${n}`);
        (r.themes || []).forEach(t => {
            const tk = normText(t.name || '');
            if (!tk) errors.push(`round ${rIdx + 1}: theme without name`);
            if (themeKeys.has(tk)) errors.push(`duplicate theme name "${t.name}"`);
            themeKeys.add(tk);
            const qs = t.questions || [];
            if (qs.length !== 5) errors.push(`theme "${t.name}": expected 5 questions, got ${qs.length}`);
            qs.forEach((q, i) => {
                const expected = (i + 1) * 100 * (rIdx + 1);
                if (q.cost !== expected) errors.push(`theme "${t.name}" Q${i + 1}: cost ${q.cost}, expected ${expected}`);
            });
        });
    });
    finals.forEach(r => {
        const qs = (r.themes || []).reduce((acc, t) => acc.concat(t.questions || []), []);
        if ((r.themes || []).length !== 1 || qs.length !== 1) errors.push('final must have exactly 1 theme with 1 question');
        if (r.roundName !== 'ФИНАЛ') errors.push('final roundName must be exactly "ФИНАЛ"');
        (r.themes || []).forEach(t => {
            if (!t.name || /финал/i.test(t.name)) errors.push(`final theme must name the topic, got "${t.name}"`);
        });
        const idx = rounds.indexOf(r);
        if (!PackParser.isFinalRound(r, idx, rounds.length)) errors.push('PackParser.isFinalRound does not detect the final');
        if (qs[0] && qs[0].cost !== FINAL_COST) errors.push(`final cost must be ${FINAL_COST}`);
    });

    let mediaCount = 0;
    rounds.forEach(r => (r.themes || []).forEach(t => (t.questions || []).forEach((q, i) => {
        const where = `"${t.name}" Q${i + 1}`;
        const qt = String(q.q || '').trim();
        const at = String(q.a || '').trim();
        if (!qt.endsWith('?')) errors.push(`${where}: question must end with "?"`);
        if (qt.length < 25) warnings.push(`${where}: very short question`);
        if (at.length > 70) warnings.push(`${where}: long answer (${at.length} chars)`);
        const withMedia = hasQuestionMedia(q);
        if (withMedia) mediaCount++;
        if (MEDIA_WORDS.test(qt) && !withMedia) errors.push(`${where}: references media that does not exist`);
        if (q.type) errors.push(`${where}: do not set "type" (special types are assigned at runtime)`);
        if (q.audio) errors.push(`${where}: use "music" instead of "audio"`);
        if (q.a_img || q.a_video) errors.push(`${where}: answer media are not used in mixed packs`);
        MEDIA_KEYS.forEach(k => {
            if (q[k] && !fs.existsSync(path.join(ROOT, q[k]))) errors.push(`${where}: missing media file ${q[k]}`);
        });
        const nq = ' ' + normText(qt) + ' ';
        answerVariants(at).forEach(av => {
            if (av.length >= 3 && nq.includes(' ' + av + ' ')) errors.push(`${where}: answer "${at}" is contained in the question`);
        });
        const qStems = new Set(stems(qt, 5));
        const hit = stems(at.replace(/\([^)]*\)/g, ' '), 5).filter(s => qStems.has(s));
        if (hit.length) warnings.push(`${where}: answer stem(s) [${hit.join(', ')}] appear in question | Q: ${qt} | A: ${at}`);
    })));
    if (mediaCount > MAX_MEDIA_PER_PACK) errors.push(`${mediaCount} media questions, max ${MAX_MEDIA_PER_PACK} per pack`);
    if (data.hasMedia !== (mediaCount > 0)) errors.push('hasMedia flag out of sync (run normalize)');
    return { errors, warnings, questions: v.questionsCount, media: mediaCount };
}

function collectTitles(exceptFolder) {
    const titles = new Map();
    fs.readdirSync(PACKS_DIR).forEach(folder => {
        const dir = path.join(PACKS_DIR, folder);
        if (!fs.statSync(dir).isDirectory() || folder === exceptFolder) return;
        fs.readdirSync(dir).filter(f => f.endsWith('.json')).forEach(f => {
            const m = f.match(/^\d+_(.+)\.json$/);
            titles.set(normText(m ? m[1] : f), `${folder}/${f}`);
        });
    });
    return titles;
}

function cmdCheck(args) {
    const ctx = { titles: collectTitles(MIX_FOLDER), descs: new Map() };
    const all = listMixFiles(0, Infinity);
    // Titles of mixed packs outside the checked range also count as taken.
    all.forEach(({ file, num }) => {
        if (num < args.from || num > args.to) {
            try {
                const d = readJson(path.join(MIX_DIR, file));
                ctx.titles.set(normText(d.title || ''), file);
                ctx.descs.set(normText(d.description || ''), file);
            } catch (e) { /* reported when in range */ }
        }
    });
    let errCount = 0;
    let warnCount = 0;
    let qCount = 0;
    let packCount = 0;
    const seenNums = new Set();
    all.filter(x => x.num >= args.from && x.num <= args.to).forEach(({ file, num }) => {
        if (seenNums.has(num)) {
            console.log(`ERROR ${file}: duplicate pack number ${num}`);
            errCount++;
        }
        seenNums.add(num);
        let data;
        try {
            data = readJson(path.join(MIX_DIR, file));
        } catch (e) {
            console.log(`ERROR ${file}: invalid JSON: ${e.message}`);
            errCount++;
            return;
        }
        const res = checkPack(file, data, ctx);
        ctx.titles.set(normText(data.title || ''), file);
        packCount++;
        qCount += res.questions;
        res.errors.forEach(e => console.log(`ERROR ${file}: ${e}`));
        res.warnings.forEach(w => console.log(`WARN  ${file}: ${w}`));
        errCount += res.errors.length;
        warnCount += res.warnings.length;
    });
    console.log(`Checked ${packCount} mixed packs, ${qCount} questions: ${errCount} errors, ${warnCount} warnings.`);
    if (errCount > 0) process.exitCode = 1;
}

const args = parseArgs(process.argv.slice(2));
if (args.cmd === 'normalize') cmdNormalize(args);
else if (args.cmd === 'check') cmdCheck(args);
else {
    console.log('Usage: node tools/mixed_packs.js normalize|check [--from N] [--to M]');
    process.exitCode = 2;
}
