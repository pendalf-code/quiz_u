const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('Responsive CSS Integrity Tests (768px - 1304px Breakpoints)', () => {
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

  describe('css/style.css Media Queries and Breakpoint Adaptations', () => {
    it('contains wide desktop media query @media (min-width: 1305px)', () => {
      assert.ok(
        styleCss.includes('@media (min-width: 1305px)'),
        'css/style.css must define @media (min-width: 1305px)'
      );
      const wideBlock = extractMediaBlock(styleCss, '@media (min-width: 1305px)');
      assert.ok(wideBlock, 'Must extract @media (min-width: 1305px) block');
      assert.ok(
        wideBlock.includes('.game-header-actions'),
        'Wide desktop media query should include rules for .game-header-actions'
      );
    });

    it('contains medium desktop/laptop media query @media (min-width: 1024px) and (max-width: 1304px)', () => {
      const query = '@media (min-width: 1024px) and (max-width: 1304px)';
      assert.ok(
        styleCss.includes(query),
        `css/style.css must define ${query}`
      );
      const block = extractMediaBlock(styleCss, query);
      assert.ok(block, `Must extract ${query} block`);
      assert.ok(
        block.includes('.game-header-actions'),
        'Laptop/desktop media query must contain .game-header-actions rules'
      );
    });

    it('contains tablet media query @media (min-width: 768px) and (max-width: 1023px)', () => {
      const query = '@media (min-width: 768px) and (max-width: 1023px)';
      assert.ok(
        styleCss.includes(query),
        `css/style.css must define ${query}`
      );
      const block = extractMediaBlock(styleCss, query);
      assert.ok(block, `Must extract ${query} block`);
      assert.ok(
        block.includes('.game-header-actions'),
        'Tablet media query must contain .game-header-actions rules'
      );
    });

    it('.game-header-actions uses flex-wrap: wrap in intermediate breakpoints (1024-1304px and 768-1023px) to prevent button overflow', () => {
      // 1024px - 1304px block
      const mediumBlock = extractMediaBlock(styleCss, '@media (min-width: 1024px) and (max-width: 1304px)');
      assert.ok(mediumBlock, '1024px-1304px block must exist');
      const mediumHeaderActions = extractRuleBlock(mediumBlock, '.game-header-actions');
      assert.ok(mediumHeaderActions, '.game-header-actions rule must exist in 1024px-1304px block');
      assert.ok(
        mediumHeaderActions.includes('flex-wrap: wrap'),
        `.game-header-actions in 1024px-1304px must have flex-wrap: wrap, got: ${mediumHeaderActions}`
      );

      // 768px - 1023px block
      const tabletBlock = extractMediaBlock(styleCss, '@media (min-width: 768px) and (max-width: 1023px)');
      assert.ok(tabletBlock, '768px-1023px block must exist');
      const tabletHeaderActions = extractRuleBlock(tabletBlock, '.game-header-actions');
      assert.ok(tabletHeaderActions, '.game-header-actions rule must exist in 768px-1023px block');
      assert.ok(
        tabletHeaderActions.includes('flex-wrap: wrap'),
        `.game-header-actions in 768px-1023px must have flex-wrap: wrap, got: ${tabletHeaderActions}`
      );
    });

    it('.game-header container also wraps in intermediate breakpoints to maintain layout stability', () => {
      const mediumBlock = extractMediaBlock(styleCss, '@media (min-width: 1024px) and (max-width: 1304px)');
      const tabletBlock = extractMediaBlock(styleCss, '@media (min-width: 768px) and (max-width: 1023px)');

      const mediumHeader = extractRuleBlock(mediumBlock, '.game-header');
      const tabletHeader = extractRuleBlock(tabletBlock, '.game-header');

      assert.ok(mediumHeader && mediumHeader.includes('flex-wrap: wrap'), '.game-header must wrap in 1024px-1304px');
      assert.ok(tabletHeader && tabletHeader.includes('flex-wrap: wrap'), '.game-header must wrap in 768px-1023px');
    });
  });

  describe('css/catalog.css Responsive Adaptations (768px - 1304px)', () => {
    it('contains responsive media query @media (min-width: 768px) and (max-width: 1304px)', () => {
      const query = '@media (min-width: 768px) and (max-width: 1304px)';
      assert.ok(
        catalogCss.includes(query),
        `css/catalog.css must contain ${query}`
      );
    });

    it('.pack-card-actions uses flex-wrap: wrap in (min-width: 768px) and (max-width: 1304px)', () => {
      const query = '@media (min-width: 768px) and (max-width: 1304px)';
      const catalogBlock = extractMediaBlock(catalogCss, query);
      assert.ok(catalogBlock, `Must extract block for ${query}`);

      const packCardActionsRule = extractRuleBlock(catalogBlock, '.pack-card-actions');
      assert.ok(packCardActionsRule, '.pack-card-actions must exist in catalog responsive query');
      assert.ok(
        packCardActionsRule.includes('flex-wrap: wrap'),
        `.pack-card-actions must have flex-wrap: wrap, got: ${packCardActionsRule}`
      );
    });

    it('pack action buttons (.btn-pack-play, .btn-pack-preview, .btn-pack-download) have proper responsive flex sizing', () => {
      const query = '@media (min-width: 768px) and (max-width: 1304px)';
      const catalogBlock = extractMediaBlock(catalogCss, query);
      assert.ok(catalogBlock, `Must extract block for ${query}`);

      const playRule = extractRuleBlock(catalogBlock, '.btn-pack-play');
      const previewRule = extractRuleBlock(catalogBlock, '.btn-pack-preview');
      const downloadRule = extractRuleBlock(catalogBlock, '.btn-pack-download');

      assert.ok(playRule, '.btn-pack-play rule exists in catalog intermediate query');
      assert.ok(previewRule, '.btn-pack-preview rule exists in catalog intermediate query');
      assert.ok(downloadRule, '.btn-pack-download rule exists in catalog intermediate query');

      assert.ok(playRule.includes('flex: 1 1 100%'), '.btn-pack-play takes full row');
      assert.ok(previewRule.includes('flex: 1 1 calc(50% - 4px)'), '.btn-pack-preview takes half row');
      assert.ok(downloadRule.includes('flex: 1 1 calc(50% - 4px)'), '.btn-pack-download takes half row');
    });
  });
});
