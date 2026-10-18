/**
 * Поиск дублей вопросов по всем пакам (TASK-46).
 *
 *   node tools/dedupe_questions.js [--folder <папка>] [--from N] [--to M] [--threshold 0.6]
 *
 * Exact: совпадает нормализованный текст вопроса (регистр, ё/е, пунктуация не важны).
 * Near:  совпадает нормализованный ответ и пересечение основ слов вопроса (Jaccard) >= threshold.
 * Отчитывается только о парах, где хотя бы один вопрос из проверяемой области
 * (--folder и/или диапазон номеров паков --from/--to). Без фильтров — все пары.
 * Код выхода 1, если найдены дубли в области проверки.
 */
const fs = require('fs');
const path = require('path');
const PackParser = require('../js/core/PackParser.js');

const PACKS_DIR = path.join(__dirname, '..', 'паки вопросов');

const STOP = new Set(['какой', 'какая', 'какое', 'какие', 'каком', 'какого', 'какую', 'каким', 'какой', 'этого', 'этот', 'этой', 'этом', 'который', 'которая', 'которое', 'которые', 'которого', 'были', 'было', 'была', 'является', 'называют', 'называется', 'называли', 'также', 'более', 'между', 'после', 'перед', 'через', 'чтобы', 'когда', 'сколько', 'именно', 'однако', 'всего', 'свой', 'своей', 'своего', 'своих']);

function parseArgs(argv) {
    const args = { folder: null, from: 0, to: Infinity, threshold: 0.6 };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--folder') args.folder = argv[++i];
        else if (argv[i] === '--from') args.from = parseInt(argv[++i], 10);
        else if (argv[i] === '--to') args.to = parseInt(argv[++i], 10);
        else if (argv[i] === '--threshold') args.threshold = parseFloat(argv[++i]);
    }
    return args;
}

function normText(s) {
    return String(s).toLowerCase().replace(/ё/g, 'е').replace(/<[^>]+>/g, ' ').replace(/[^a-zа-я0-9]+/g, ' ').trim();
}

function normAnswer(a) {
    return normText(String(a).replace(/\([^)]*\)/g, ' '));
}

function stemSet(q) {
    return new Set(normText(q).split(' ').filter(w => w.length >= 4 && !STOP.has(w)).map(w => w.slice(0, 5)));
}

function jaccard(a, b) {
    let inter = 0;
    a.forEach(x => { if (b.has(x)) inter++; });
    const union = a.size + b.size - inter;
    return union === 0 ? 0 : inter / union;
}

function loadAll() {
    const items = [];
    fs.readdirSync(PACKS_DIR).sort().forEach(folder => {
        const dir = path.join(PACKS_DIR, folder);
        if (!fs.statSync(dir).isDirectory()) return;
        fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().forEach(file => {
            let raw = fs.readFileSync(path.join(dir, file), 'utf8');
            if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
            let data;
            try {
                data = JSON.parse(raw);
            } catch (e) {
                console.log(`SKIP ${folder}/${file}: invalid JSON`);
                return;
            }
            const num = parseInt(file, 10);
            PackParser.normalizeGameData(data).forEach(r => (r.themes || []).forEach(t => (t.questions || []).forEach((q, i) => {
                if (!q || typeof q.q !== 'string') return;
                items.push({
                    folder, file, num,
                    where: `${folder}/${file} :: "${t.name}" Q${i + 1}`,
                    q: q.q, a: String(q.a || ''),
                    nq: normText(q.q), na: normAnswer(q.a || ''),
                    stems: stemSet(q.q)
                });
            })));
        });
    });
    return items;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const filtered = args.folder !== null || args.from > 0 || args.to !== Infinity;
    const inScope = it => !filtered || ((args.folder === null || it.folder === args.folder) && it.num >= args.from && it.num <= args.to);
    const items = loadAll();
    let exact = 0;
    let near = 0;

    const byText = new Map();
    items.forEach(it => {
        if (!byText.has(it.nq)) byText.set(it.nq, []);
        byText.get(it.nq).push(it);
    });
    byText.forEach(group => {
        if (group.length < 2 || !group.some(inScope)) return;
        exact++;
        console.log(`EXACT (${group.length}x): ${group[0].q}`);
        group.forEach(g => console.log(`   - ${g.where}  [A: ${g.a}]`));
    });

    const byAnswer = new Map();
    items.forEach(it => {
        if (!it.na) return;
        if (!byAnswer.has(it.na)) byAnswer.set(it.na, []);
        byAnswer.get(it.na).push(it);
    });
    byAnswer.forEach(group => {
        if (group.length < 2 || !group.some(inScope)) return;
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                const x = group[i];
                const y = group[j];
                if (x.nq === y.nq || !(inScope(x) || inScope(y))) continue;
                const sim = jaccard(x.stems, y.stems);
                if (sim >= args.threshold) {
                    near++;
                    console.log(`NEAR (${sim.toFixed(2)}) A: ${x.a}`);
                    console.log(`   - ${x.where}: ${x.q}`);
                    console.log(`   - ${y.where}: ${y.q}`);
                }
            }
        }
    });

    console.log(`Scanned ${items.length} questions. Exact duplicate groups: ${exact}. Near duplicates: ${near}.`);
    if (exact + near > 0) process.exitCode = 1;
}

main();
