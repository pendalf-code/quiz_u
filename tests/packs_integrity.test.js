const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function normalizeRounds(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'object') {
    if (Array.isArray(data.value)) return normalizeRounds(data.value);
    if (Array.isArray(data.rounds)) return normalizeRounds(data.rounds);
    if (data.themes) return [data];
    if (data.rounds && typeof data.rounds === 'object') return normalizeRounds(data.rounds);
    return [data];
  }
  return [];
}

describe('Packs Integrity & Schema Tests', () => {
  const packsDataPath = path.join(__dirname, '..', 'js', 'packs_data.js');
  const packsCatalogJsonPath = path.join(__dirname, '..', 'js', 'packs_catalog.json');
  const packsDir = path.join(__dirname, '..', 'паки вопросов');

  it('js/packs_data.js must exist and contain no replacement characters (\\uFFFD)', () => {
    assert.ok(fs.existsSync(packsDataPath), 'js/packs_data.js does not exist');
    const content = fs.readFileSync(packsDataPath, 'utf8');
    assert.strictEqual(content.includes('\uFFFD'), false, 'js/packs_data.js contains \\uFFFD!');
  });

  it('js/packs_catalog.json must exist and be valid JSON', () => {
    assert.ok(fs.existsSync(packsCatalogJsonPath), 'js/packs_catalog.json does not exist');
    const content = fs.readFileSync(packsCatalogJsonPath, 'utf8');
    const catalog = JSON.parse(content);
    assert.ok(Array.isArray(catalog), 'Catalog must be an array');
    assert.ok(catalog.length >= 200, `Expected >= 200 packs in catalog, got ${catalog.length}`);
  });

  it('js/packs_data.js must load and export a non-empty window.AVAILABLE_PACKS array', () => {
    const sandbox = { window: {} };
    const code = fs.readFileSync(packsDataPath, 'utf8');
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);

    assert.ok(Array.isArray(sandbox.window.AVAILABLE_PACKS), 'AVAILABLE_PACKS must be an array');
    assert.ok(sandbox.window.AVAILABLE_PACKS.length >= 200, `Expected >= 200 packs, got ${sandbox.window.AVAILABLE_PACKS.length}`);
  });

  it('every pack in catalog must have valid metadata and valid JSON file with questions in "паки вопросов"', () => {
    const sandbox = { window: {} };
    const code = fs.readFileSync(packsDataPath, 'utf8');
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    const packs = sandbox.window.AVAILABLE_PACKS;

    const validDifficulties = ['easy', 'medium', 'hard', 'expert'];

    packs.forEach((pack, idx) => {
      assert.ok(pack.title && typeof pack.title === 'string', `Pack #${idx} missing title`);
      assert.ok(pack.category && typeof pack.category === 'string', `Pack "${pack.title}" missing category`);
      assert.ok(validDifficulties.includes(pack.difficulty), `Pack "${pack.title}" invalid difficulty: ${pack.difficulty}`);
      assert.ok(pack.filePath && typeof pack.filePath === 'string', `Pack "${pack.title}" missing filePath`);

      const fullFilePath = path.join(__dirname, '..', pack.filePath);
      assert.ok(fs.existsSync(fullFilePath), `Pack "${pack.title}" JSON file not found at ${fullFilePath}`);

      // Read pack data directly from individual JSON file
      let raw = fs.readFileSync(fullFilePath, 'utf8');
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
      const fileData = JSON.parse(raw);

      const rounds = normalizeRounds(fileData);
      assert.ok(rounds.length > 0, `Pack "${pack.title}" in ${pack.filePath} has no valid rounds`);

      rounds.forEach((round, rIdx) => {
        assert.ok(round.roundName, `Pack "${pack.title}" round #${rIdx} missing roundName`);
        assert.ok(Array.isArray(round.themes) && round.themes.length > 0, `Pack "${pack.title}" round #${rIdx} has no themes`);

        round.themes.forEach((theme, tIdx) => {
          assert.ok(theme.name, `Pack "${pack.title}" round #${rIdx} theme #${tIdx} missing name`);
          assert.ok(Array.isArray(theme.questions) && theme.questions.length > 0, `Pack "${pack.title}" theme "${theme.name}" has no questions`);

          theme.questions.forEach((q, qIdx) => {
            assert.ok(typeof q.q === 'string' && q.q.trim().length > 0, `Pack "${pack.title}" theme "${theme.name}" Q#${qIdx} missing question text`);
            assert.ok(typeof q.a === 'string' && q.a.trim().length > 0, `Pack "${pack.title}" theme "${theme.name}" Q#${qIdx} missing answer text`);
            assert.ok(typeof q.cost === 'number' && q.cost > 0, `Pack "${pack.title}" theme "${theme.name}" Q#${qIdx} invalid cost: ${q.cost}`);
          });
        });
      });
    });
  });

  it('all pack JSON files in "паки вопросов" must be valid JSON and contain no \\uFFFD', () => {
    function getJsonFiles(dir) {
      let results = [];
      const list = fs.readdirSync(dir);
      list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(getJsonFiles(fullPath));
        } else if (file.endsWith('.json')) {
          results.push(fullPath);
        }
      });
      return results;
    }

    const files = getJsonFiles(packsDir);
    assert.ok(files.length >= 200, `Expected at least 200 JSON files, found ${files.length}`);

    files.forEach(file => {
      const raw = fs.readFileSync(file, 'utf8');
      assert.strictEqual(raw.includes('\uFFFD'), false, `File ${file} contains \\uFFFD!`);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        assert.fail(`File ${file} is not valid JSON: ${err.message}`);
      }
      assert.ok(parsed, `File ${file} parsed as empty/falsy`);
    });
  });
});
