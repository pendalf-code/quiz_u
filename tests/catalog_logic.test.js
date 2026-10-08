const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('Catalog Logic Tests', () => {
  let catalogContext;

  beforeEach(() => {
    catalogContext = {
      window: {
        addEventListener: () => {},
        removeEventListener: () => {}
      },
      document: {
        getElementById: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {}
      },
      console
    };
    catalogContext.window = Object.assign(catalogContext.window, catalogContext);

    // Load catalog.js into context
    const catalogCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'catalog.js'), 'utf8');
    vm.createContext(catalogContext);
    vm.runInContext(catalogCode, catalogContext);
  });

  const samplePacks = [
    {
      id: 'pack_1',
      title: 'Disney Принцессы',
      category: 'Мультфильмы и Сказки',
      categoryFolder: '01_Мультфильмы_и_Сказки',
      difficulty: 'easy',
      roundsCount: 1,
      hasFinal: false,
      description: 'Сказки и принцессы Диснея',
      tags: ['дисней', 'сказки'],
      themeNames: ['Русалочка', 'Золушка']
    },
    {
      id: 'pack_2',
      title: 'Квантовая физика',
      category: 'Наука и Космос',
      categoryFolder: '05_Наука_и_Космос',
      difficulty: 'expert',
      roundsCount: 3,
      hasFinal: true,
      description: 'Сложные вопросы о Вселенной',
      tags: ['физика', 'наука'],
      themeNames: ['Бозоны', 'Теория струн']
    },
    {
      id: 'pack_3',
      title: 'Властелин Колец',
      category: 'Кино и Сериалы',
      categoryFolder: '02_Кино_и_Сериалы',
      difficulty: 'medium',
      roundsCount: 2,
      hasFinal: false,
      description: 'Путешествие по Средиземью',
      tags: ['толкин', 'кино'],
      themeNames: ['Братство', 'Мордор']
    },
    {
      id: 'pack_4',
      title: 'Хиты 90-х',
      category: 'Музыка и Хиты',
      categoryFolder: '03_Музыка_и_Хиты',
      difficulty: 'hard',
      roundsCount: 1,
      hasFinal: true,
      description: 'Популярная музыка девяностых',
      tags: ['руки вверх', 'поп'],
      themeNames: ['Дискотека', 'Ретро']
    }
  ];

  it('filters packs by difficulty', () => {
    catalogContext.window.AVAILABLE_PACKS = samplePacks;

    vm.runInContext("currentCatalogDifficulty = 'easy';", catalogContext);
    let result = vm.runInContext("getFilteredPacks();", catalogContext);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'pack_1');

    vm.runInContext("currentCatalogDifficulty = 'expert';", catalogContext);
    result = vm.runInContext("getFilteredPacks();", catalogContext);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'pack_2');

    vm.runInContext("currentCatalogDifficulty = 'all';", catalogContext);
    result = vm.runInContext("getFilteredPacks();", catalogContext);
    assert.strictEqual(result.length, 4);
  });

  it('filters packs by rounds count and final round flag', () => {
    catalogContext.window.AVAILABLE_PACKS = samplePacks;

    vm.runInContext("currentCatalogRounds = '1';", catalogContext);
    let result = vm.runInContext("getFilteredPacks();", catalogContext);
    assert.strictEqual(result.length, 2);

    vm.runInContext("currentCatalogRounds = '3';", catalogContext);
    result = vm.runInContext("getFilteredPacks();", catalogContext);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'pack_2');

    vm.runInContext("currentCatalogRounds = 'final';", catalogContext);
    result = vm.runInContext("getFilteredPacks();", catalogContext);
    assert.strictEqual(result.length, 2); // pack_2, pack_4

    vm.runInContext("currentCatalogRounds = 'nofinal';", catalogContext);
    result = vm.runInContext("getFilteredPacks();", catalogContext);
    assert.strictEqual(result.length, 2); // pack_1, pack_3
  });

  it('filters packs by search query matching title, tags, description, themes', () => {
    catalogContext.window.AVAILABLE_PACKS = samplePacks;

    vm.runInContext("currentCatalogSearch = 'средиземью';", catalogContext);
    let result = vm.runInContext("getFilteredPacks();", catalogContext);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'pack_3');

    vm.runInContext("currentCatalogSearch = 'толкин';", catalogContext);
    result = vm.runInContext("getFilteredPacks();", catalogContext);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'pack_3');

    vm.runInContext("currentCatalogSearch = 'русалочка';", catalogContext);
    result = vm.runInContext("getFilteredPacks();", catalogContext);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'pack_1');

    vm.runInContext("currentCatalogSearch = 'несуществующий запрос';", catalogContext);
    result = vm.runInContext("getFilteredPacks();", catalogContext);
    assert.strictEqual(result.length, 0);
  });

  it('filters packs by category folder', () => {
    catalogContext.window.AVAILABLE_PACKS = samplePacks;

    vm.runInContext("currentCatalogCategory = '01_Мультфильмы_и_Сказки';", catalogContext);
    let result = vm.runInContext("getFilteredPacks();", catalogContext);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'pack_1');

    vm.runInContext("currentCatalogCategory = 'all';", catalogContext);
    result = vm.runInContext("getFilteredPacks();", catalogContext);
    assert.strictEqual(result.length, 4);
  });

  it('sorts packs by title, difficulty, and rounds count', () => {
    catalogContext.window.AVAILABLE_PACKS = samplePacks;

    // Sort title asc (Russian locale)
    vm.runInContext("currentCatalogSort = 'title_asc';", catalogContext);
    let result = vm.runInContext("getFilteredPacks();", catalogContext);
    assert.strictEqual(result[0].title, 'Властелин Колец');
    assert.strictEqual(result[result.length - 1].title, 'Disney Принцессы');

    // Sort diff asc (easy -> expert)
    vm.runInContext("currentCatalogSort = 'diff_asc';", catalogContext);
    result = vm.runInContext("getFilteredPacks();", catalogContext);
    assert.strictEqual(result[0].difficulty, 'easy');
    assert.strictEqual(result[result.length - 1].difficulty, 'expert');

    // Sort rounds desc (3 -> 1)
    vm.runInContext("currentCatalogSort = 'rounds_desc';", catalogContext);
    result = vm.runInContext("getFilteredPacks();", catalogContext);
    assert.strictEqual(result[0].roundsCount, 3);
  });

  
  describe('Pack Download & HTML Viewer Generation', () => {
    it('catalog card template contains "📥 Скачать пак" instead of ".JSON"', () => {
      const catalogCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'catalog.js'), 'utf8');
      assert.ok(catalogCode.includes('📥 Скачать пак'), 'Card template must have "📥 Скачать пак"');
      assert.strictEqual(catalogCode.includes('>📥 .JSON</button>'), false, 'Card template must not contain ">📥 .JSON</button>"');
    });

    it('preview modal button in index.html contains "📥 Скачать пак"', () => {
      const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
      const btnIdx = indexHtml.indexOf('id="preview-btn-download"');
      assert.ok(btnIdx !== -1, 'preview-btn-download button must exist in index.html');
      const btnSlice = indexHtml.slice(btnIdx, btnIdx + 250);
      assert.ok(btnSlice.includes('📥 Скачать пак'), 'preview-btn-download must say "📥 Скачать пак"');
      assert.strictEqual(btnSlice.includes('Скачать файл (.json)'), false, 'Must not say "Скачать файл (.json)"');
    });

    it('generatePackHtmlDocument generates a complete, interactive, self-contained HTML document with questions and answers', () => {
      const generatePackHtmlDocument = catalogContext.generatePackHtmlDocument;
      assert.strictEqual(typeof generatePackHtmlDocument, 'function', 'generatePackHtmlDocument must be a function');

      const mockPack = {
        title: 'Тестовый Пак <Кино>',
        category: 'Кино и Сериалы',
        categoryIcon: '🎬',
        difficulty: 'medium',
        description: 'Увлекательные вопросы о фильмах & сериалах',
        hasCat: true,
        hasAuction: true
      };

      const mockRounds = [
        {
          roundName: 'Раунд 1: Советские комедии',
          themes: [
            {
              name: 'Бриллиантовая рука',
              questions: [
                { q: 'Какую фразу произносит управдом <Плющ>?', a: 'Собака — друг человека!', cost: 100 },
                { q: 'Пароль в аптеке?', a: 'Чёрт побери!', cost: 200 }
              ]
            }
          ]
        }
      ];

      const html = generatePackHtmlDocument(mockPack, mockRounds);
      assert.ok(typeof html === 'string', 'Returned html must be a string');
      assert.ok(html.startsWith('<!DOCTYPE html>'), 'Must start with <!DOCTYPE html>');
      assert.ok(html.includes('<title>Тестовый Пак &lt;Кино&gt; — Вопросы и ответы (Quiz U)</title>'), 'Title must be escaped');
      assert.ok(html.includes('Тестовый Пак &lt;Кино&gt;'), 'Title must be present in header');
      assert.ok(html.includes('Увлекательные вопросы о фильмах &amp; сериалах'), 'Description must be present and escaped');
      assert.ok(html.includes('🎬 Кино и Сериалы'), 'Category must be present');
      assert.ok(html.includes('⭐ Средняя'), 'Difficulty label must be mapped and present');
      assert.ok(html.includes('🐱 Кот в мешке'), 'Cat in bag badge must be present');
      assert.ok(html.includes('💰 Аукцион'), 'Auction badge must be present');
      assert.ok(html.includes('Раунд 1: Советские комедии'), 'Round name must be present');
      assert.ok(html.includes('Бриллиантовая рука'), 'Theme name must be present');
      assert.ok(html.includes('Какую фразу произносит управдом &lt;Плющ&gt;?'), 'Question must be present and escaped');
      assert.ok(html.includes('Собака — друг человека!'), 'Answer must be present');
      assert.ok(html.includes('100 очков'), 'Cost must be formatted');
      assert.ok(html.includes('200 очков'), 'Cost must be formatted');

      // Verify interactive controls
      assert.ok(html.includes('id="search-input"'), 'Must have search input for live question filter');
      assert.ok(html.includes('id="btn-toggle-answers"'), 'Must have toggle answers button');
      assert.ok(html.includes('window.print()'), 'Must have print/PDF action');
      assert.ok(html.includes('toggleTheme()'), 'Must have dark/light theme switch');
      assert.ok(html.includes('copyPlainQa()'), 'Must have copy questions and answers as text action');
      assert.ok(html.includes('downloadRawJson()'), 'Must have raw JSON export action');
      assert.ok(html.includes('@media print'), 'Must have print stylesheet');
    });
  });

});
