const fs = require('fs');
const path = require('path');

const PACKS_DIR = path.join(__dirname, '..', 'паки вопросов');
const OUTPUT_FILE = path.join(__dirname, '..', 'js', 'packs_data.js');
const OUTPUT_JSON = path.join(__dirname, '..', 'js', 'packs_catalog.json');

const categoryIcons = {
  '01_Мультфильмы_и_Сказки': '🎨',
  '02_Кино_и_Сериалы': '🎬',
  '03_Музыка_и_Хиты': '🎵',
  '04_Видеоигры_и_Гейминг': '🎮',
  '05_Наука_и_Космос': '🔬',
  '06_Животные_и_Природа': '🐾',
  '07_История_и_География': '🌍',
  '08_Поп_культура_и_Мемы': '⚡',
  '09_Еда_и_Кулинария': '🍕',
  '10_Спорт_и_Рекорды': '🏆',
  '11_Логика_и_Загадки': '💡',
  '12_Для_Самых_Маленьких': '🎈'
};

const categoryNames = {
  '01_Мультфильмы_и_Сказки': 'Мультфильмы и Сказки',
  '02_Кино_и_Сериалы': 'Кино и Сериалы',
  '03_Музыка_и_Хиты': 'Музыка и Хиты',
  '04_Видеоигры_и_Гейминг': 'Видеоигры и Гейминг',
  '05_Наука_и_Космос': 'Наука и Космос',
  '06_Животные_и_Природа': 'Животные и Природа',
  '07_История_и_География': 'История и География',
  '08_Поп_культура_и_Мемы': 'Поп-культура и Мемы',
  '09_Еда_и_Кулинария': 'Еда и Кулинария',
  '10_Спорт_и_Рекорды': 'Спорт и Рекорды',
  '11_Логика_и_Загадки': 'Логика и Загадки',
  '12_Для_Самых_Маленьких': 'Для Самых Маленьких'
};

function main() {
  const folders = fs.readdirSync(PACKS_DIR).filter(f => fs.statSync(path.join(PACKS_DIR, f)).isDirectory()).sort();
  const allPacks = [];

  folders.forEach(folder => {
    const folderPath = path.join(PACKS_DIR, folder);
    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.json')).sort();

    files.forEach(file => {
      const filePath = path.join(folderPath, file);
      let raw = fs.readFileSync(filePath, 'utf8');
      if (raw.charCodeAt(0) === 0xFEFF) {
        raw = raw.slice(1);
      }
      const data = JSON.parse(raw);

      // Extract pack number and title from filename
      // e.g. "001_Золотая классика Союзмультфильма.json" -> "Золотая классика Союзмультфильма"
      const match = file.match(/^(\d+)_(.+)\.json$/);
      const numStr = match ? match[1] : '000';
      const cleanTitle = match ? match[2] : file.replace('.json', '');

      // Normalize rounds array for metadata extraction
      let roundsArray = [];
      if (Array.isArray(data)) {
        roundsArray = data;
      } else if (data.roundName || data.themes) {
        roundsArray = [data];
      }

      const hasFinal = roundsArray.some(r => r.roundName && r.roundName.toLowerCase().includes('финал'));
      const nonFinalRounds = roundsArray.filter(r => !r.roundName || !r.roundName.toLowerCase().includes('финал'));
      const roundsCount = nonFinalRounds.length > 0 ? nonFinalRounds.length : roundsArray.length;

      const themeNames = [];
      let hasMedia = false;
      let questionsCount = 0;

      roundsArray.forEach(r => {
        if (r.themes && Array.isArray(r.themes)) {
          r.themes.forEach(t => {
            if (t.name && !t.name.toLowerCase().includes('финал')) {
              themeNames.push(t.name);
            }
            if (t.questions && Array.isArray(t.questions)) {
              questionsCount += t.questions.length;
              t.questions.forEach(q => {
                if (q.img || q.audio || q.video || q.q_img || q.a_img) {
                  hasMedia = true;
                }
              });
            }
          });
        }
      });

      const catName = categoryNames[folder] || folder.replace(/^\d+_/, '').replace(/_/g, ' ');
      const catIcon = categoryIcons[folder] || '🎯';

      // Determine difficulty
      let difficulty = 'medium';
      if (parseInt(numStr, 10) >= 191 && parseInt(numStr, 10) <= 206) {
        difficulty = 'easy';
      } else if (folder.includes('Самых_Маленьких') || cleanTitle.toLowerCase().includes('малыш') || cleanTitle.toLowerCase().includes('сказк')) {
        difficulty = 'easy';
      } else if (cleanTitle.toLowerCase().includes('продвинут') || cleanTitle.toLowerCase().includes('эксперт') || cleanTitle.toLowerCase().includes('эйнштейн')) {
        difficulty = 'hard';
      }

      // Relative path to JSON pack file
      const relativeJsonPath = `паки вопросов/${folder}/${file}`;

      const packObj = {
        id: `pack_${numStr}_${catName.slice(0, 4).toLowerCase()}`,
        title: cleanTitle,
        category: catName,
        categoryFolder: folder,
        categoryIcon: catIcon,
        difficulty: difficulty,
        roundsCount: roundsCount,
        hasFinal: hasFinal,
        description: `Увлекательная викторина по теме '${cleanTitle}'. Прекрасно подходит для игры любой компанией!`,
        hasMedia: hasMedia,
        hasCat: true,
        hasAuction: true,
        tags: [catName.toLowerCase(), 'викторина', 'квиз', 'эрудиция'],
        themeNames: themeNames,
        themesList: themeNames,
        questionsCount: questionsCount,
        filePath: relativeJsonPath
      };

      allPacks.push(packObj);
    });
  });

  // Sort by number in ID / filename
  allPacks.sort((a, b) => {
    const numA = parseInt(a.id.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(b.id.replace(/\D/g, ''), 10) || 0;
    return numA - numB;
  });

  // 1. Output lightweight packs_catalog.json (~80 KB instead of 9.6 MB!)
  const jsonCatalogStr = JSON.stringify(allPacks, null, 2);
  fs.writeFileSync(OUTPUT_JSON, jsonCatalogStr, 'utf8');

  // 2. Output lightweight JS metadata manifest (window.AVAILABLE_PACKS) for instant offline catalog rendering
  const jsContent = `// Auto-generated question packs catalog metadata (points to individual JSON files in 'паки вопросов/')\nwindow.AVAILABLE_PACKS = ${jsonCatalogStr};\n`;
  fs.writeFileSync(OUTPUT_FILE, jsContent, 'utf8');

  console.log(`Synced ${allPacks.length} packs to:`);
  console.log(` - ${OUTPUT_JSON} (${Math.round(jsonCatalogStr.length / 1024)} KB)`);
  console.log(` - ${OUTPUT_FILE} (${Math.round(jsContent.length / 1024)} KB)`);
}

main();
