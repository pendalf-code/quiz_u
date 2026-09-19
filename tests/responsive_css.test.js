const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('Responsive CSS Integrity Tests', () => {
  const styleCssPath = path.join(__dirname, '..', 'css', 'style.css');
  const catalogCssPath = path.join(__dirname, '..', 'css', 'catalog.css');

  const styleCss = fs.readFileSync(styleCssPath, 'utf8');
  const catalogCss = fs.readFileSync(catalogCssPath, 'utf8');

  // Helper to extract the content inside a specific @media block
  function extractMediaBlock(css, mediaQuerySelector) {
    const queryIndex = css.indexOf(mediaQuerySelector);
    if (queryIndex === -1) return null;

    const startBrace = css.indexOf('{', queryIndex);
    if (startBrace === -1) return null;

    let depth = 1;
    let i = startBrace + 1;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    return css.substring(startBrace + 1, i - 1);
  }

  // Helper to extract a rule block inside CSS text
  function extractRuleBlock(cssBlock, selector) {
    const regex = new RegExp(`(?:^|[}\\s])${selector.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*\\{([^}]+)\\}`, 'm');
    const match = cssBlock.match(regex);
    return match ? match[1] : null;
  }

  describe('CSS Files File Integrity', () => {
    it('css/style.css and css/catalog.css must exist and contain no unicode replacement chars (\\uFFFD)', () => {
      assert.ok(fs.existsSync(styleCssPath), 'css/style.css must exist');
      assert.ok(fs.existsSync(catalogCssPath), 'css/catalog.css must exist');
      assert.strictEqual(styleCss.includes('\uFFFD'), false, 'css/style.css contains \\uFFFD');
      assert.strictEqual(catalogCss.includes('\uFFFD'), false, 'css/catalog.css contains \\uFFFD');
    });
  });

  describe('css/style.css Desktop, Tablet and Mobile Media Queries', () => {
    it('contains desktop media query @media (min-width: 1024px) with desktop styles', () => {
      const query = '@media (min-width: 1024px)';
      assert.ok(styleCss.includes(query), `css/style.css must define ${query}`);

      const desktopBlock = extractMediaBlock(styleCss, query);
      assert.ok(desktopBlock, `Must extract ${query} block`);

      // .game-header
      const headerRule = extractRuleBlock(desktopBlock, '.game-header');
      assert.ok(headerRule, '.game-header rule must exist in desktop block');
      assert.ok(headerRule.includes('flex-wrap: nowrap'), '.game-header in desktop must have flex-wrap: nowrap');
      assert.ok(headerRule.includes('justify-content: space-between'), '.game-header in desktop must justify-content: space-between');

      // .game-header-actions
      const actionsRule = extractRuleBlock(desktopBlock, '.game-header-actions');
      assert.ok(actionsRule, '.game-header-actions rule must exist in desktop block');
      assert.ok(actionsRule.includes('flex-wrap: nowrap'), '.game-header-actions in desktop must have flex-wrap: nowrap');

      // .theme-row
      const themeRowRule = extractRuleBlock(desktopBlock, '.theme-row');
      assert.ok(themeRowRule, '.theme-row rule must exist in desktop block');
      assert.ok(themeRowRule.includes('grid-template-columns: minmax(220px, 320px) repeat(5, minmax(0, 1fr))'), '.theme-row must have desktop grid columns');

      // .team-card
      const teamCardRule = extractRuleBlock(desktopBlock, '.team-card');
      assert.ok(teamCardRule, '.team-card rule must exist in desktop block');
      assert.ok(teamCardRule.includes('width: 220px'), '.team-card in desktop must have width: 220px');
    });

    it('contains tablet media query @media (min-width: 768px) and (max-width: 1023px)', () => {
      const query = '@media (min-width: 768px) and (max-width: 1023px)';
      assert.ok(styleCss.includes(query), `css/style.css must define ${query}`);

      const tabletBlock = extractMediaBlock(styleCss, query);
      assert.ok(tabletBlock, `Must extract ${query} block`);

      const headerRule = extractRuleBlock(tabletBlock, '.game-header');
      assert.ok(headerRule, '.game-header rule must exist in tablet block');
      assert.ok(headerRule.includes('flex-wrap: wrap'), '.game-header must wrap in tablet');

      const actionsRule = extractRuleBlock(tabletBlock, '.game-header-actions');
      assert.ok(actionsRule, '.game-header-actions rule must exist in tablet block');
      assert.ok(actionsRule.includes('flex-wrap: wrap'), '.game-header-actions must wrap in tablet');

      const themeRowRule = extractRuleBlock(tabletBlock, '.theme-row');
      assert.ok(themeRowRule, '.theme-row rule must exist in tablet block');
      assert.ok(themeRowRule.includes('grid-template-columns: minmax(160px, 220px) repeat(5, minmax(0, 1fr))'), '.theme-row must adapt columns for tablet');
    });

    it('contains mobile media query @media (max-width: 767px)', () => {
      const query = '@media (max-width: 767px)';
      assert.ok(styleCss.includes(query), `css/style.css must define ${query}`);

      const mobileBlock = extractMediaBlock(styleCss, query);
      assert.ok(mobileBlock, `Must extract ${query} block`);

      const headerRule = extractRuleBlock(mobileBlock, '.game-header');
      assert.ok(headerRule, '.game-header rule must exist in mobile block');
      assert.ok(headerRule.includes('flex-direction: column'), '.game-header must be vertical on mobile');

      const actionsRule = extractRuleBlock(mobileBlock, '.game-header-actions');
      assert.ok(actionsRule, '.game-header-actions rule must exist in mobile block');
      assert.ok(actionsRule.includes('grid-template-columns: repeat(2, 1fr)'), '.game-header-actions must use 2-col grid on mobile');

      const themeNameRule = extractRuleBlock(mobileBlock, '.theme-name');
      assert.ok(themeNameRule, '.theme-name rule must exist in mobile block');
      assert.ok(themeNameRule.includes('grid-column: 1 / -1'), '.theme-name must span full row on mobile');
    });
  });

  describe('css/catalog.css Responsive Rules', () => {
    it('contains responsive media query @media (min-width: 768px) and (max-width: 1304px)', () => {
      const query = '@media (min-width: 768px) and (max-width: 1304px)';
      assert.ok(catalogCss.includes(query), `css/catalog.css must contain ${query}`);

      const block = extractMediaBlock(catalogCss, query);
      assert.ok(block, `Must extract block for ${query}`);

      const packCardActionsRule = extractRuleBlock(block, '.pack-card-actions');
      assert.ok(packCardActionsRule, '.pack-card-actions must exist');
      assert.ok(packCardActionsRule.includes('flex-wrap: wrap'), '.pack-card-actions must have flex-wrap: wrap');

      const playRule = extractRuleBlock(block, '.btn-pack-play');
      const previewRule = extractRuleBlock(block, '.btn-pack-preview');
      const downloadRule = extractRuleBlock(block, '.btn-pack-download');

      assert.ok(playRule && playRule.includes('flex: 1 1 100%'), '.btn-pack-play takes full row');
      assert.ok(previewRule && previewRule.includes('flex: 1 1 calc(50% - 4px)'), '.btn-pack-preview takes half row');
      assert.ok(downloadRule && downloadRule.includes('flex: 1 1 calc(50% - 4px)'), '.btn-pack-download takes half row');
    });

    it('contains intermediate media query @media (max-width: 1024px)', () => {
      const query = '@media (max-width: 1024px)';
      assert.ok(catalogCss.includes(query), `css/catalog.css must contain ${query}`);

      const block = extractMediaBlock(catalogCss, query);
      assert.ok(block, `Must extract block for ${query}`);

      const choiceGridRule = extractRuleBlock(block, '.prepare-choice-grid');
      assert.ok(choiceGridRule, '.prepare-choice-grid must exist in max-width: 1024px');
      assert.ok(choiceGridRule.includes('grid-template-columns: 1fr'), '.prepare-choice-grid switches to single column');
    });

    it('contains mobile media query @media (max-width: 767px)', () => {
      const query = '@media (max-width: 767px)';
      assert.ok(catalogCss.includes(query), `css/catalog.css must contain ${query}`);

      const block = extractMediaBlock(catalogCss, query);
      assert.ok(block, `Must extract block for ${query}`);

      const gridRule = extractRuleBlock(block, '.catalog-packs-grid');
      assert.ok(gridRule, '.catalog-packs-grid must exist in mobile block');
      assert.ok(gridRule.includes('grid-template-columns: 1fr'), '.catalog-packs-grid switches to 1 col on mobile');

      const actionsRule = extractRuleBlock(block, '.pack-card-actions');
      assert.ok(actionsRule, '.pack-card-actions must exist in mobile block');
      assert.ok(actionsRule.includes('flex-direction: column'), '.pack-card-actions stacks buttons vertically on mobile');
    });
  });
});
