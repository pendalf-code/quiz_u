const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const PackParser = require('../js/core/PackParser.js');
const { checkPack, normalizePack } = require('../tools/mixed_packs.js');

const ROOT = path.join(__dirname, '..');
const MIX_FOLDER = '19_Микс_и_Эрудиция';
const MIX_DIR = path.join(ROOT, 'паки вопросов', MIX_FOLDER);
const FIRST_PACK = 407;
const MIXED_PACKS = 85;
const EXPECTED_SHAPES = { 1: 17, 2: 24, 3: 17, '1+F': 9, '2+F': 9, '3+F': 9 };
const MAX_MEDIA_PER_PACK = 2;
const TASK_70_FIRST_PACK = 492;
const TASK_70_LAST_PACK = 691;
const TASK_73_FIRST_PACK = 692;
const TASK_73_LAST_PACK = 891;

function readPack(file) {
  let raw = fs.readFileSync(path.join(MIX_DIR, file), 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  return JSON.parse(raw);
}

function mixFiles() {
  return fs.readdirSync(MIX_DIR).filter(f => f.endsWith('.json')).sort();
}

function checkWithFreshContext(file, data) {
  return checkPack(file, data, { titles: new Map(), descs: new Map() });
}

it('the mixed-pack checker accepts the existing TASK-77 answer image in pack 850', () => {
  const file = mixFiles().find(name => name.startsWith('850_'));
  const data = readPack(file);
  const questions = data.rounds.flatMap(round => round.themes.flatMap(theme => theme.questions));
  assert.ok(questions.some(q => q.a_img === 'assets/a_img/creation_of_adam.jpg'));
  assert.deepStrictEqual(checkWithFreshContext(file, data).errors.filter(error => /answer media/.test(error)), []);
});

it('the checker validates answer files and keeps them separate from question media', () => {
  const title = 'Проверка медиа ответа';
  const data = normalizePack({
    title, difficulty: 'medium', description: 'Пак для проверки медиа вопроса и медиа ответа.',
    tags: ['медиа', 'вопрос', 'ответ'], rounds: [{ roundName: 'Раунд 1',
      themes: Array.from({ length: 5 }, (_, theme) => ({ name: `Тема ${theme + 1}`,
        questions: Array.from({ length: 5 }, (_, i) => ({
          q: 'Как называется документ для посадки на поезд?', a: 'Билет', cost: (i + 1) * 100
        })) })) }]
  }, 492);
  const [picture, video, legacyPicture, legacyVideo] = data.rounds[0].themes[0].questions;
  picture.q = 'Что изображено на фото?';
  picture.a_img = 'assets/a_img/creation_of_adam.jpg';
  video.a_video = 'assets/video/flower.mp4';
  legacyPicture.answer_img = 'assets/q_img/123.jpg';
  legacyVideo.answer_video = 'assets/video/friday.mp4';
  const file = `492_${title}.json`;
  assert.strictEqual(data.hasMedia, false);
  assert.deepStrictEqual(checkWithFreshContext(file, data).errors, [
    '"Тема 1" Q1: references media that does not exist',
    'missing required media type: img', 'missing required media type: music', 'missing required media type: video'
  ]);

  picture.img = 'assets/q_img/123.jpg';
  video.video = 'assets/video/flower.mp4';
  legacyPicture.music = 'assets/music/horse.mp3';
  data.hasMedia = true;
  assert.deepStrictEqual(checkWithFreshContext(file, data).errors, []);
  legacyVideo.answer_video = 'assets/video/nonexistent-answer.mp4';
  assert.deepStrictEqual(checkWithFreshContext(file, data).errors, [
    '"Тема 1" Q4: missing answer media file answer_video: assets/video/nonexistent-answer.mp4'
  ]);
});

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

  it(`original wave has exactly ${MIXED_PACKS} mixed packs numbered 407-491`, () => {
    const nums = mixFiles().map(f => parseInt(f, 10)).filter(num => num < TASK_70_FIRST_PACK);
    assert.deepStrictEqual(nums, Array.from({ length: MIXED_PACKS }, (_, i) => FIRST_PACK + i));
  });

  it('round shapes: 15 original + 70 new packs keep the 1/2/3 rounds ± final proportions', () => {
    const shapes = {};
    mixFiles().filter(file => parseInt(file, 10) < TASK_70_FIRST_PACK).forEach(file => {
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
    assert.deepStrictEqual(shapes, EXPECTED_SHAPES);
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
      const mediaTypes = new Set();
      rounds.forEach(r => r.themes.forEach(t => t.questions.forEach(q => {
        assert.ok(q.q.trim().endsWith('?'), `${file}: question without "?": ${q.q}`);
        assert.ok(!q.type, `${file}: special types are assigned at runtime`);
        if (q.img || q.music || q.audio || q.video) media++;
        if (q.img) mediaTypes.add('img');
        if (q.music) mediaTypes.add('music');
        if (q.video) mediaTypes.add('video');
      })));
      const packNumber = parseInt(file, 10);
      if ((packNumber >= TASK_70_FIRST_PACK && packNumber <= TASK_70_LAST_PACK) ||
        (packNumber >= TASK_73_FIRST_PACK && packNumber <= TASK_73_LAST_PACK)) {
        for (const type of ['img', 'music', 'video']) {
          assert.ok(mediaTypes.has(type), `${file}: missing ${type}`);
        }
      } else {
        assert.ok(media <= MAX_MEDIA_PER_PACK, `${file}: ${media} media questions, max ${MAX_MEDIA_PER_PACK}`);
      }
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
