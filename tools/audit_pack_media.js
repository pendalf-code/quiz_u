// Группирует медиавопросы по SHA-256, включая копии под другими путями.
// Вывод нужен для ручного сравнения наблюдений, ответы сами по себе могут совпадать.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'паки вопросов', '19_Микс_и_Эрудиция');
const [from = 492, to = 691] = process.argv.slice(2).map(Number);
const groups = new Map();
const hashes = new Map();
let slots = 0;

for (const filename of fs.readdirSync(folder).sort()) {
    const num = Number(filename.split('_')[0]);
    if (!filename.endsWith('.json') || !(num >= from && num <= to)) continue;
    const pack = JSON.parse(fs.readFileSync(path.join(folder, filename), 'utf8'));
    for (const round of pack.rounds) {
        for (const theme of round.themes) {
            for (const question of theme.questions) {
                for (const key of ['img', 'music', 'video']) {
                    if (!question[key]) continue;
                    const media = path.resolve(root, question[key]);
                    if (!hashes.has(media)) {
                        hashes.set(media, createHash('sha256').update(fs.readFileSync(media)).digest('hex'));
                    }
                    const hash = hashes.get(media);
                    if (!groups.has(hash)) groups.set(hash, []);
                    groups.get(hash).push({ num, file: question[key], q: question.q, a: question.a });
                    slots++;
                }
            }
        }
    }
}

for (const [hash, entries] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    if (entries.length < 2) continue;
    const files = [...new Set(entries.map(entry => entry.file))];
    console.log(`\n${entries.length} × ${files.join(', ')} [${hash}]`);
    for (const { num, q, a } of entries) console.log(`  ${num} | ${q} | ${a}`);
}
console.log(`\n${slots} слотов, ${hashes.size} путей, ${groups.size} SHA-256`);
