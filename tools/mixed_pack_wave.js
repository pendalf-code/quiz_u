const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual: equal } = require('node:util');
const PackParser = require('../js/core/PackParser');
const { MIX_DIR, MEDIA_KEYS, ANSWER_MEDIA_KEYS, normalizePack, requiredMediaTypes, safeFileTitle } = require('./mixed_packs');
const { normText, normAnswer } = require('./dedupe_questions');

const ROOT = path.join(__dirname, '..');
const DEFAULT_SCOPE = { from: 407, to: 891 };
const MEDIA_FIELDS = [...MEDIA_KEYS, ...ANSWER_MEDIA_KEYS];
const DERIVED_FIELDS = ['roundsCount', 'hasFinal', 'hasMedia', 'themeNames', 'questionsCount'];
const IDENTITY_FIELDS = ['num', 'id', 'category', 'categoryFolder', 'categoryIcon'];
const OPENING_CUES = {
    'свет и оптика': /(?:^| )(?:свет|оптик|отражен|преломл|линз|зеркал|тен[ьи]|луч|блик|призм|спектр)/,
    'звук': /(?:^| )(?:звук|аудио|слыш|акуст|громк|шум|тон(?: |а|е|ы|ов|$)|бас|эхо|высот[аыу] тона|герц|децибел)/,
    'сосуды и жидкости': /(?:^| )(?:сосуд|жидк|посуд|кастрюл|крышк|кувшин|стакан|котел|чайник|перелив|налив|емкост|вязк|капл)/
};

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const inScope = (num, { from, to }) => num >= from && num <= to;
const parseJson = text => JSON.parse(text.replace(/^\uFEFF/, ''));
const without = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const fields = (object, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(object, key)).map(key => [key, object[key]]));
const price = question => question.cost ?? question.price;
const slotKey = cell => `${cell.round}:${cell.theme}:${cell.cell}`;

function groupBy(items, keyFor) {
    const groups = new Map();
    for (const item of items) {
        const key = keyFor(item);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    }
    return groups;
}

function changedFields(before, after) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
        .filter(key => !equal(before[key], after[key]))
        .map(key => ({ key, before: before[key], after: after[key] }));
}

function readSource(source, scope) {
    if (!fs.statSync(source).isDirectory()) {
        const snapshot = parseJson(fs.readFileSync(source, 'utf8'));
        if (snapshot.version !== 1 || !Array.isArray(snapshot.files) ||
            snapshot.scope?.from > scope.from || snapshot.scope?.to < scope.to ||
            !Number.isSafeInteger(snapshot.scope?.from) || !Number.isSafeInteger(snapshot.scope?.to)) {
            throw new Error(`${source}: неверный формат или диапазон снимка`);
        }
        return snapshot.files;
    }
    return fs.readdirSync(source, { withFileTypes: true })
        .filter(entry => (entry.isFile() || entry.isSymbolicLink()) && /\.json$/i.test(entry.name))
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
        .filter(({ name }) => {
            const prefix = name.match(/^\d+/);
            return !prefix || inScope(Number(prefix[0]), scope);
        })
        .map(({ name: file }) => {
            try {
                const bytes = fs.readFileSync(path.join(source, file));
                return { file, sha256: sha256(bytes), text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) };
            } catch (error) {
                return { file, readError: error.message };
            }
        });
}

function checkCoverage(groups, scope, issues) {
    const missing = [];
    const duplicates = [];
    for (let num = scope.from; num <= scope.to; num++) {
        const records = groups.get(num) || [];
        if (records.length === 0) missing.push(num);
        if (records.length > 1) duplicates.push(num);
    }
    return { expected: scope.to - scope.from + 1, unique: groups.size, missing, duplicates, issues };
}

function readPacks(source, scope) {
    const entries = [];
    const issues = [];
    for (const record of readSource(source, scope)) {
        const match = typeof record?.file === 'string' && /^(\d{3,})_[^/\\]+\.json$/.exec(record.file);
        if (!match) {
            issues.push({ file: record?.file, reason: 'Некорректное имя файла' });
            continue;
        }
        const num = Number(match[1]);
        if (!inScope(num, scope)) continue;
        const entry = { num, ...fields(record, ['file', 'sha256', 'text']) };
        entries.push(entry);
        try {
            if (record.readError) throw new Error(record.readError);
            if (typeof entry.text !== 'string' || sha256(entry.text) !== entry.sha256) {
                throw new Error('SHA-256 содержимого не совпадает со снимком');
            }
            entry.data = parseJson(entry.text);
            const validation = PackParser.validatePack(entry.data);
            if (!validation.valid) throw new Error(validation.errors.join(' | '));
            if (entry.data.num !== num || entry.data.id !== `pack_${match[1]}_микс`) {
                throw new Error(`num/id не соответствует файлу (${entry.data.num}, ${entry.data.id})`);
            }
        } catch (error) {
            issues.push({ file: entry.file, reason: error.message });
            delete entry.data;
        }
    }
    const groups = groupBy(entries, entry => entry.num);
    const coverage = checkCoverage(groups, scope, issues);
    const packs = new Map([...groups].filter(([, entries]) => entries.length === 1 && entries[0].data)
        .sort(([a], [b]) => a - b).map(([num, [entry]]) => [num, entry]));
    return { packs, coverage };
}

function project({ num, data }) {
    const rounds = PackParser.normalizeGameData(data);
    const themes = [];
    const cells = [];
    const layout = rounds.map((r, roundIndex) => {
        const round = roundIndex + 1;
        r.themes.forEach((t, themeIndex) => {
            const theme = themeIndex + 1;
            const cards = t.questions.map((question, index) => ({
                num, round, theme, cell: index + 1, question
            }));
            themes.push({ round, theme, name: t.name, properties: without(t, ['questions']), cards });
            cells.push(...cards);
        });
        return { final: PackParser.isFinalRound(r, roundIndex, rounds.length), themes: r.themes.map(t => t.questions.length) };
    });
    return { rounds, themes, cells, layout };
}

function mediaInventory(cells) {
    const references = cells.flatMap(({ question }) => Object.entries(fields(question, MEDIA_FIELDS)));
    return new Map([...groupBy(references, pair => JSON.stringify(pair))].map(([key, group]) => [key, group.length]));
}

function comparePack(before, after, beforeBoard, afterBoard) {
    const metadata = changedFields(without(before.data, ['rounds']), without(after.data, ['rounds']));
    const rounds = compareSlots(beforeBoard.rounds, afterBoard.rounds, round => without(round, ['themes']), (_, i) => i + 1);
    const themes = compareSlots(beforeBoard.themes, afterBoard.themes, theme => theme.properties, theme => `${theme.round}:${theme.theme}`);
    const cells = compareSlots(beforeBoard.cells, afterBoard.cells, cell => cell.question, slotKey);
    const payload = ({ question }) => without(question, ['cost', 'price']);
    const key = cell => JSON.stringify(Object.entries(payload(cell)).sort(([a], [b]) => a.localeCompare(b)));
    const originals = groupBy(beforeBoard.cells, key);
    const finalCells = groupBy(afterBoard.cells, key);
    const moves = [];
    for (const [signature, [source]] of originals) {
        const matches = finalCells.get(signature);
        if (originals.get(signature).length !== 1 || matches?.length !== 1) continue;
        const [target] = matches;
        if (slotKey(source) !== slotKey(target)) {
            moves.push({ from: slotKey(source), to: slotKey(target), costBefore: price(source.question), costAfter: price(target.question) });
        }
    }
    const mediaCells = cells.flatMap(({ slot, before, after }) => {
        const changes = changedFields(fields(before || {}, MEDIA_FIELDS), fields(after || {}, MEDIA_FIELDS));
        return changes.length ? [{ slot, changes }] : [];
    });
    const violations = [];
    if (!equal(beforeBoard.layout, afterBoard.layout)) violations.push('layout');
    const costSlots = board => board.cells.map(cell => [slotKey(cell), price(cell.question)]);
    if (!equal(costSlots(beforeBoard), costSlots(afterBoard))) violations.push('prices');
    const oldMedia = mediaInventory(beforeBoard.cells);
    const newMedia = mediaInventory(afterBoard.cells);
    const mediaInventoryChanges = [...new Set([...oldMedia.keys(), ...newMedia.keys()])].sort()
        .filter(key => oldMedia.get(key) !== newMedia.get(key)).map(key => {
            const [field, reference] = JSON.parse(key);
            return { field, reference, before: oldMedia.get(key) || 0, after: newMedia.get(key) || 0 };
        });
    if (metadata.some(({ key }) => IDENTITY_FIELDS.includes(key))) violations.push('identity');
    return { fileBefore: before.file, fileAfter: after.file, sha256Before: before.sha256, sha256After: after.sha256,
        metadata, rounds, themes, cells, moves, mediaInventoryChanges, mediaCells, violations };
}

function compareSlots(before, after, value, key) {
    const oldSlots = new Map(before.map((item, i) => [key(item, i), value(item)]));
    const newSlots = new Map(after.map((item, i) => [key(item, i), value(item)]));
    return [...new Set([...oldSlots.keys(), ...newSlots.keys()])]
        .filter(slot => !equal(oldSlots.get(slot), newSlots.get(slot)))
        .map(slot => ({ slot, before: oldSlots.get(slot), after: newSlots.get(slot) }));
}

function currentIssues(entry, board, mediaExists) {
    const { file, data, num, text } = entry;
    const issues = [];
    if (file !== `${String(num).padStart(3, '0')}_${safeFileTitle(data.title)}.json`) issues.push('fileName');
    if (/(?<!\r)\n|\r(?!\n)/.test(text)) issues.push('lineEndings');
    const normalized = normalizePack(structuredClone(data), num);
    for (const key of [...DERIVED_FIELDS, ...IDENTITY_FIELDS]) {
        if (!equal(data[key], normalized[key])) issues.push(key);
    }
    for (const key of requiredMediaTypes(num)) {
        if (!board.cells.some(({ question }) => typeof question[key] === 'string' && question[key].trim())) {
            issues.push(`requiredMedia:${key}`);
        }
    }
    for (const cell of board.cells) {
        for (const [key, reference] of Object.entries(fields(cell.question, MEDIA_FIELDS))) {
            if (!mediaExists(reference)) issues.push(`mediaReference:${slotKey(cell)}:${key}:${reference}`);
        }
    }
    return issues;
}

function repeatedGroups(items, signature, present) {
    return [...groupBy(items, signature)].filter(([key, group]) => key && group.length > 1)
        .sort(([a, left], [b, right]) => right.length - left.length || a.localeCompare(b, 'ru'))
        .map(([key, group]) => ({ key, count: group.length, examples: group.map(present) }));
}

const COMMON_ANSWERS = new Set(['да', 'нет', 'ничего', 'человек', 'предмет', 'сторона', 'время', 'место']);
const NUMBER_WORDS = new Set([
    'ноль нуль один одна одно два две три четыре пять шесть семь восемь девять десять',
    'одиннадцать двенадцать тринадцать четырнадцать пятнадцать шестнадцать семнадцать восемнадцать девятнадцать',
    'двадцать тридцать сорок пятьдесят шестьдесят семьдесят восемьдесят девяносто',
    'сто двести триста четыреста пятьсот шестьсот семьсот восемьсот девятьсот'
].join(' ').split(' '));
const containsPhrase = (text, phrase) => ` ${text} `.includes(` ${phrase} `);

function answerForLeakCheck(rawAnswer) {
    const answer = normAnswer(rawAnswer);
    if (answer.replace(/ /g, '').length < 5 || COMMON_ANSWERS.has(answer) ||
        /\d/.test(answer) || answer.split(' ').some(word => NUMBER_WORDS.has(word))) return null;

    // A narrow fallback for standalone Russian adjectives such as «рулевой» / «рулевым».
    const adjective = /^([а-я]{5,})(?:ой|ый)$/.exec(answer);
    return { answer, instrumental: adjective ? adjective[1] + 'ым' : null };
}

function matchAnswer(text, { answer, instrumental }) {
    if (containsPhrase(text, answer)) return { matched: answer, basis: 'literal' };
    if (instrumental && containsPhrase(text, instrumental)) return { matched: instrumental, basis: 'adjectiveInstrumental' };
    return null;
}

function crossCellAnswerLeaks(themes, cardLocation) {
    return themes.flatMap(({ name, cards }) => {
        const questions = cards.map(card => ({ card, text: normText(card.question.q) }));
        return cards.flatMap(answerCard => {
            const candidate = answerForLeakCheck(answerCard.question.a);
            if (!candidate) return [];
            return questions.flatMap(({ card, text }) => {
                if (card === answerCard) return [];
                const match = matchAnswer(text, candidate);
                return match ? [{
                    themeName: name,
                    answerCell: cardLocation(answerCard),
                    questionCell: cardLocation(card),
                    answer: candidate.answer,
                    ...match
                }] : [];
            });
        });
    });
}

function titleAnswerLeaks(themes, cardLocation) {
    return themes.flatMap(({ name, cards }) => {
        const title = normText(name || '');
        return cards.flatMap(card => {
            const { q, a } = card.question;
            const candidate = answerForLeakCheck(a);
            if (!candidate) return [];
            let match = matchAnswer(title, candidate);
            // Partial overlap counts only for name-shaped answers to identity questions.
            if (!match && /^\p{Lu}\p{Ll}{2,}(?:[ -]\p{Lu}\p{Ll}{2,}){1,3}$/u.test(a.replace(/\s*\([^)]*\)\s*$/, '').trim()) &&
                /^(?:кто |как звали |чье имя |чья фамилия )/.test(normText(q))) {
                const word = candidate.answer.split(' ').find(part =>
                    part.length >= 5 && !COMMON_ANSWERS.has(part) && containsPhrase(title, part));
                if (word) match = { matched: word, basis: 'partialName', confidence: 'low' };
            }
            return match ? [{ title: name, answer: a, answerCell: cardLocation(card), ...match }] : [];
        });
    });
}

function candidates(boards) {
    const packs = [...boards].map(([num, board]) => ({ num, ...board }));
    const themes = packs.flatMap(({ num, themes }) => themes.map(theme => ({ num, ...theme })));
    const location = ({ num, round, theme }) => ({ num, round, theme });
    const cardLocation = card => ({ ...location(card), cell: card.cell, cost: price(card.question) });
    const openings = packs.filter(pack => pack.themes.length >= 3).map(pack => ({
        num: pack.num,
        slots: pack.themes.filter(theme => theme.round === 1).slice(0, 3).map(theme => {
            const cues = Object.entries(OPENING_CUES).map(([label, pattern]) => ({
                label,
                cells: theme.cards.filter(({ question }) => pattern.test(normText(`${question.q} ${question.a}`))).map(card => card.cell)
            })).filter(cue => cue.cells.length >= 2);
            return { name: theme.name, cues };
        })
    })).filter(({ slots }) => slots.length === 3 && slots.filter(slot => slot.cues.length).length >= 2);
    const mediaCards = packs.flatMap(pack => pack.cells.flatMap(card => {
        const answer = normAnswer(card.question.a);
        return Object.entries(fields(card.question, MEDIA_KEYS))
            .filter(([, ref]) => typeof ref === 'string' && ref.trim() && answer)
            .map(([kind, ref]) => ({ card, key: JSON.stringify([kind === 'audio' ? 'music' : kind, ref, answer]) }));
    }));
    return {
        note: 'Сигналы для ручного сравнения. Совпадение названий, лексики, медиа или ответа само по себе не доказывает повтор факта.',
        repeatedThemeNames: repeatedGroups(themes, theme => normText(theme.name || ''), location),
        repeatedTitleSequences: repeatedGroups(packs,
            pack => JSON.stringify(pack.themes.map(theme => [theme.round, normText(theme.name || '')])), pack => pack.num),
        repeatedMediaLayouts: repeatedGroups(packs, pack => {
            const slots = pack.cells.flatMap(cell => {
                const keys = MEDIA_KEYS.filter(key => cell.question[key]);
                return keys.length ? [[slotKey(cell), keys]] : [];
            });
            return slots.length ? JSON.stringify(slots) : '';
        }, pack => pack.num),
        openingCuePatterns: repeatedGroups(openings,
            pack => JSON.stringify(pack.slots.map(slot => slot.cues.map(cue => cue.label))), pack => pack),
        sameAnswerWithinTheme: themes.flatMap(theme =>
            repeatedGroups(theme.cards, card => normAnswer(card.question.a), cardLocation)),
        crossCellAnswerLeaks: crossCellAnswerLeaks(themes, cardLocation),
        titleAnswerLeaks: titleAnswerLeaks(themes, cardLocation),
        sameMediaAndAnswer: repeatedGroups(mediaCards, item => item.key, item => cardLocation(item.card))
            .filter(group => new Set(group.examples.map(example => example.num)).size > 1)
    };
}

function reviewCoverage(files, current, scope) {
    const records = [];
    const issues = [];
    for (const file of files) {
        const input = parseJson(fs.readFileSync(file, 'utf8'));
        const items = Array.isArray(input) ? input : input?.records;
        if (!Array.isArray(items)) throw new Error(`${file}: нужен массив записей или объект {records: [...]}`);
        for (const item of items) {
            if (!Number.isSafeInteger(item?.num) || !inScope(item.num, scope)) {
                issues.push({ file, num: item?.num, reason: 'Запись вне диапазона или без числового ID' });
                continue;
            }
            records.push({ file, item });
            const entry = current.get(item.num);
            if (!entry || item.title !== entry.data.title || item.sourceSha256 !== entry.sha256 ||
                item.coverage !== 'full_question_text' || typeof item.decision !== 'string' || !item.decision.trim()) {
                issues.push({ file, num: item.num, reason: 'Нужны актуальные title и sourceSha256, full_question_text и решение' });
            }
        }
    }
    const groups = groupBy(records, record => record.item.num);
    const coverage = checkCoverage(groups, scope, issues);
    const invalid = new Set(issues.map(issue => issue.num));
    const verified = new Map([...groups].filter(([num, rows]) => rows.length === 1 && !invalid.has(num))
        .map(([num, [{ item }]]) => [num, fields(item, ['decision', 'rationale', 'factCheck', 'media', 'unresolved'])]));
    return { coverage, verified };
}

function complete(coverage) {
    return !coverage.missing.length && !coverage.duplicates.length && !coverage.issues.length;
}

function writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2).replace(/\n/g, '\r\n') + '\r\n', {
        encoding: 'utf8', flag: 'wx'
    });
}

function createReport(before, after, scope, reviewFiles) {
    const beforeBoards = new Map([...before.packs].map(([num, entry]) => [num, project(entry)]));
    const afterBoards = new Map([...after.packs].map(([num, entry]) => [num, project(entry)]));
    const reviews = reviewFiles.length ? reviewCoverage(reviewFiles, after.packs, scope) : null;
    const checkedMedia = new Map();
    const mediaExists = reference => {
        if (typeof reference !== 'string' || !reference.trim()) return false;
        if (!checkedMedia.has(reference)) {
            const resolved = path.resolve(ROOT, reference);
            const relative = path.relative(ROOT, resolved);
            const local = relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
            checkedMedia.set(reference, Boolean(local && fs.statSync(resolved, { throwIfNoEntry: false })?.isFile()));
        }
        return checkedMedia.get(reference);
    };
    const packs = [...after.packs].map(([num, entry]) => {
        const board = afterBoards.get(num);
        const original = before.packs.get(num);
        const current = { num, title: entry.data.title, file: entry.file, sha256: entry.sha256, questions: board.cells.length,
            currentIssues: currentIssues(entry, board, mediaExists), review: reviews?.verified.get(num) };
        if (!original) return { ...current, diff: null };
        return { ...current, diff: comparePack(original, entry, beforeBoards.get(num), board) };
    });
    const summary = {
        comparablePacks: packs.filter(pack => pack.diff).length,
        byteChangedPacks: packs.filter(({ diff }) => diff && diff.sha256Before !== diff.sha256After).length,
        renamedFiles: packs.filter(({ diff }) => diff && diff.fileBefore !== diff.fileAfter).length,
        changedThemeSlots: packs.reduce((sum, { diff }) => sum + (diff?.themes.length || 0), 0),
        changedQuestionSlots: packs.reduce((sum, { diff }) => sum + (diff?.cells.length || 0), 0),
        questionMoves: packs.reduce((sum, { diff }) => sum + (diff?.moves.length || 0), 0),
        mediaInventoryChangedIds: packs.filter(pack => pack.diff?.mediaInventoryChanges.length).map(pack => pack.num),
        questionsBefore: [...beforeBoards.values()].reduce((sum, board) => sum + board.cells.length, 0),
        questionsAfter: packs.reduce((sum, pack) => sum + pack.questions, 0),
        invariantFailureIds: packs.filter(pack => pack.currentIssues.length || pack.diff?.violations.length).map(pack => pack.num)
    };
    const technicalOk = complete(before.coverage) && complete(after.coverage) &&
        (!reviews || complete(reviews.coverage)) && !summary.invariantFailureIds.length;
    return { version: 1, technicalOk, scope, summary,
        editorialReviewState: reviews ? (complete(reviews.coverage) ? 'records_match' : 'incomplete_or_stale') : 'not_supplied',
        limits: 'Проверены исходники, инварианты и предоставленные записи ревью. Полнота чтения заявлена редактором. Качество, факты, сложность и воспроизведение медиа требуют отдельной проверки.',
        coverage: { before: before.coverage, after: after.coverage, reviews: reviews?.coverage ?? null },
        packs, candidates: { before: candidates(beforeBoards), after: candidates(afterBoards) } };
}

function parseArgs(argv) {
    const [command, first, ...rest] = argv;
    if (!first || first.startsWith('--') || !['snapshot', 'report'].includes(command)) throw new Error('Неверная команда');
    const output = command === 'report' ? rest.shift() : first;
    if (!output || output.startsWith('--')) throw new Error('Укажите путь для вывода');
    const options = { scope: { ...DEFAULT_SCOPE }, source: MIX_DIR, reviews: [] };
    for (let i = 0; i < rest.length; i += 2) {
        const [flag, value] = rest.slice(i, i + 2);
        if (!value || value.startsWith('--')) throw new Error(`Укажите значение ${flag}`);
        if (flag === '--from' || flag === '--to') options.scope[flag.slice(2)] = Number(value);
        else if (flag === '--source') options.source = value;
        else if (flag === '--review' && command === 'report') options.reviews.push(value);
        else throw new Error(`Неизвестный параметр ${flag}`);
    }
    const { from, to } = options.scope;
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 1 || to < from || to > 9999) {
        throw new Error('Диапазон должен быть целочисленным, 1 ≤ from ≤ to ≤ 9999');
    }
    return { command, before: first, output, ...options };
}

function main() {
    try {
        const { command, before, output, source, scope, reviews } = parseArgs(process.argv.slice(2));
        const current = readPacks(source, scope);
        if (command === 'snapshot') {
            if (!complete(current.coverage)) throw new Error(JSON.stringify(current.coverage));
            const files = [...current.packs.values()].map(({ file, sha256, text }) => ({ file, sha256, text }));
            writeJson(output, { version: 1, scope, files });
            console.log(`Снимок ${files.length} паков: ${output}`);
            return;
        }
        const report = createReport(readPacks(before, scope), current, scope, reviews);
        writeJson(output, report);
        console.log(JSON.stringify({ technicalOk: report.technicalOk, summary: report.summary, output }));
        if (!report.technicalOk) process.exitCode = 1;
    } catch (error) {
        console.error(error.message);
        console.error('node tools/mixed_pack_wave.js snapshot OUTPUT [--source DIR] [--from N --to M]');
        console.error('node tools/mixed_pack_wave.js report BEFORE OUTPUT [--source DIR] [--from N --to M] [--review FILE ...]');
        process.exitCode = 2;
    }
}

main();
