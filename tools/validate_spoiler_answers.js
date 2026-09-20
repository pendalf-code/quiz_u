const fs = require('fs');
const path = require('path');

const PACKS_DIR = path.join(__dirname, '..', 'паки вопросов');

function validateAll() {
  const folders = fs.readdirSync(PACKS_DIR).filter(f => fs.statSync(path.join(PACKS_DIR, f)).isDirectory());
  let issues = 0;
  let totalQuestions = 0;

  folders.forEach(folder => {
    const folderPath = path.join(PACKS_DIR, folder);
    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.json'));

    files.forEach(file => {
      const filePath = path.join(folderPath, file);
      let raw = fs.readFileSync(filePath, 'utf8');
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
      const data = JSON.parse(raw);
      const rounds = Array.isArray(data) ? data : [data];

      rounds.forEach((r, rIdx) => {
        (r.themes || []).forEach((t, tIdx) => {
          (t.questions || []).forEach((qObj, qIdx) => {
            totalQuestions++;
            const qText = qObj.q.toLowerCase();
            const aText = qObj.a.toLowerCase().replace(/[«»"()]/g, '').trim();

            // Check if full answer phrase (if >= 4 chars and not ultra generic) is in question
            if (aText.length >= 4 && !['один', 'два', 'три', 'пять', 'шесть', 'семь', 'восемь', 'девять', 'десять', 'синий', 'белый', 'черный', 'красный'].includes(aText)) {
              // Check if exact answer is directly inside the question
              if (qText.includes(aText)) {
                console.warn(`[SPOILER WARNING] In ${file} -> R${rIdx+1} "${t.name}" Q${qIdx+1}:`);
                console.warn(`  Q: ${qObj.q}`);
                console.warn(`  A: ${qObj.a}`);
                issues++;
              }
            }
          });
        });
      });
    });
  });

  console.log(`Validation finished. Checked ${totalQuestions} questions. Found ${issues} potential spoiler warnings.`);
}

validateAll();
