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
});
