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
    if (!cssBlock) return null;
    const regex = new RegExp('(?:^|[}\\s])' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]+)\\}', 'm');
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

  describe('css/style.css Desktop & Tablet Adaptations', () => {
    it('contains desktop media query @media (min-width: 1024px)', () => {
      const query = '@media (min-width: 1024px)';
      assert.ok(
        styleCss.includes(query),
        `css/style.css must define ${query}`
      );
      const desktopBlock = extractMediaBlock(styleCss, query);
      assert.ok(desktopBlock, `Must extract ${query} block`);
      assert.ok(
        desktopBlock.includes('.game-header-actions'),
        'Desktop media query should include rules for .game-header-actions'
      );
    });

    it('desktop layout provides nowrap header actions and 220px team cards', () => {
      const desktopBlock = extractMediaBlock(styleCss, '@media (min-width: 1024px)');
      assert.ok(desktopBlock, 'Desktop media block must exist');

      const headerActions = extractRuleBlock(desktopBlock, '.game-header-actions');
      assert.ok(headerActions, '.game-header-actions rule must exist in desktop block');
      assert.ok(
        headerActions.includes('flex-wrap: nowrap'),
        '.game-header-actions on desktop must have flex-wrap: nowrap'
      );

      const teamCard = extractRuleBlock(desktopBlock, '.team-card');
      assert.ok(teamCard, '.team-card rule must exist in desktop block');
      assert.ok(
        teamCard.includes('width: 220px'),
        '.team-card on desktop must have width: 220px'
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

    it('.game-header-actions uses flex-wrap: wrap in tablet breakpoint (768-1023px) to prevent button overflow', () => {
      const tabletBlock = extractMediaBlock(styleCss, '@media (min-width: 768px) and (max-width: 1023px)');
      assert.ok(tabletBlock, '768px-1023px block must exist');
      const tabletHeaderActions = extractRuleBlock(tabletBlock, '.game-header-actions');
      assert.ok(tabletHeaderActions, '.game-header-actions rule must exist in 768px-1023px block');
      assert.ok(
        tabletHeaderActions.includes('flex-wrap: wrap'),
        `.game-header-actions in 768px-1023px must have flex-wrap: wrap, got: ${tabletHeaderActions}`
      );
    });

    it('.game-header container wraps in tablet breakpoint to maintain layout stability', () => {
      const tabletBlock = extractMediaBlock(styleCss, '@media (min-width: 768px) and (max-width: 1023px)');
      const tabletHeader = extractRuleBlock(tabletBlock, '.game-header');
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
        '.pack-card-actions must have flex-wrap: wrap in responsive block'
      );
    });
  });
});
