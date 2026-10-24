const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const PackParser = require('../js/core/PackParser.js');

const ROOT = path.join(__dirname, '..');
const MIX_FOLDER = '19_Микс_и_Эрудиция';
const MIX_DIR = path.join(ROOT, 'паки вопросов', MIX_FOLDER);
const FIRST_PACK = 407;
const MIN_PACKS = 15;
const MAX_MEDIA_PER_PACK = 2;

function readPack(file) {
  let raw = fs.readFileSync(path.join(MIX_DIR, file), 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  return JSON.parse(raw);
}

function mixFiles() {
  return fs.readdirSync(MIX_DIR).filter(f => f.endsWith('.json')).sort();
}

function loadCatalogContext() {
  const ctx = {
    window: { addEventListener: () => {}, removeEventListener: () => {} },
    document: {
      getElementById: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    console
  };
  ctx.window = Object.assign(ctx.window, ctx);
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'catalog.js'), 'utf8'), ctx);
  return ctx;
}

describe('TASK-46: mixed-topic packs (Микс и Эрудиция)', () => {
  it('catalog category filter offers the mixed category', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const select = html.slice(html.indexOf('id="catalog-category-select"'), html.indexOf('</select>', html.indexOf('id="catalog-category-select"')));
    assert.ok(select.includes(`<option value="${MIX_FOLDER}">🎲 Микс и Эрудиция</option>`), 'mixed option missing in #catalog-category-select');
  });

  it('catalog sync knows the mixed folder name and icon', () => {
    const src = fs.readFileSync(path.join(ROOT, 'tools', 'sync_all_catalog.js'), 'utf8');
    assert.ok(src.includes(`'${MIX_FOLDER}': '🎲'`));
    assert.ok(src.includes(`'${MIX_FOLDER}': 'Микс и Эрудиция'`));
  });

  it('folder has mixed packs numbered contiguously from 407', () => {
    const nums = mixFiles().map(f => parseInt(f, 10));
    assert.ok(nums.length >= MIN_PACKS, `at least ${MIN_PACKS} packs`);
    assert.deepStrictEqual(nums, Array.from({ length: nums.length }, (_, i) => FIRST_PACK + i));
  });

  it('round shapes: 1/2/3 rounds, with or without a final; every shape present', () => {
    const shapes = {};
    mixFiles().forEach(file => {
      const rounds = PackParser.normalizeGameData(readPack(file));
      const finals = rounds.filter((r, i) => PackParser.isFinalRound(r, i, rounds.length));
      const key = `${rounds.length - finals.length}${finals.length ? '+F' : ''}`;
      shapes[key] = (shapes[key] || 0) + 1;
      finals.forEach(r => {
        assert.strictEqual(r.roundName, 'ФИНАЛ', `${file}: final roundName`);
        assert.strictEqual(r.themes.length, 1, `${file}: final has one theme`);
        assert.ok(r.themes[0].name && !/финал/i.test(r.themes[0].name), `${file}: final theme must name the topic`);
      });
    });
    assert.deepStrictEqual(Object.keys(shapes).sort(), ['1', '1+F', '2', '2+F', '3', '3+F']);
    Object.entries(shapes).forEach(([key, n]) => assert.ok(n >= 2, `shape ${key}: ${n} packs`));
  });

  it('every mixed pack passes PackParser.validatePack and the mixed-pack rules', () => {
    const titles = new Set();
    mixFiles().forEach(file => {
      const data = readPack(file);
      const v = PackParser.validatePack(data);
      assert.ok(v.valid, `${file}: ${v.errors.join('; ')}`);
      assert.strictEqual(data.categoryFolder, MIX_FOLDER, `${file}: categoryFolder`);
      assert.ok(['easy', 'medium', 'hard'].includes(data.difficulty), `${file}: difficulty`);
      assert.ok(!titles.has(data.title), `${file}: duplicate title`);
      titles.add(data.title);

      const rounds = PackParser.normalizeGameData(data);
      const regular = rounds.filter((r, i) => !PackParser.isFinalRound(r, i, rounds.length));
      assert.ok(regular.length >= 1 && regular.length <= 3, `${file}: 1-3 regular rounds`);
      regular.forEach(r => assert.ok(r.themes.length >= 5 && r.themes.length <= 6, `${file}: 5-6 themes per round`));
      let media = 0;
      rounds.forEach(r => r.themes.forEach(t => t.questions.forEach(q => {
        assert.ok(q.q.trim().endsWith('?'), `${file}: question without "?": ${q.q}`);
        assert.ok(!q.type, `${file}: special types are assigned at runtime`);
        if (q.img || q.music || q.video) media++;
      })));
      assert.ok(media <= MAX_MEDIA_PER_PACK, `${file}: ${media} media questions, max ${MAX_MEDIA_PER_PACK}`);
      assert.strictEqual(!!data.hasMedia, media > 0, `${file}: hasMedia flag`);
    });
  });

  it('category filter returns only mixed packs and combines with search', () => {
    const ctx = loadCatalogContext();
    ctx.window.AVAILABLE_PACKS = [
      { id: 'pack_1', title: 'Мультики', category: 'Мультфильмы и Сказки', categoryFolder: '01_Мультфильмы_и_Сказки', difficulty: 'easy', roundsCount: 1, hasFinal: false, tags: [], themeNames: ['Тема'] },
      { id: 'pack_407_микс', title: 'Эрудит-марафон', category: 'Микс и Эрудиция', categoryFolder: MIX_FOLDER, difficulty: 'medium', roundsCount: 2, hasFinal: true, tags: ['микс'], themeNames: ['Оптика', 'Футбол'] },
      { id: 'pack_408_микс', title: 'Обо всём понемногу', category: 'Микс и Эрудиция', categoryFolder: MIX_FOLDER, difficulty: 'hard', roundsCount: 1, hasFinal: false, tags: ['микс'], themeNames: ['Сыры', 'Вулканы'] }
    ];
    vm.runInContext(`currentCatalogCategory = '${MIX_FOLDER}';`, ctx);
    let result = vm.runInContext('getFilteredPacks();', ctx);
    assert.deepStrictEqual(result.map(p => p.id), ['pack_407_микс', 'pack_408_микс']);
    vm.runInContext("currentCatalogSearch = 'вулканы';", ctx);
    result = vm.runInContext('getFilteredPacks();', ctx);
    assert.deepStrictEqual(result.map(p => p.id), ['pack_408_микс']);
  });
});
