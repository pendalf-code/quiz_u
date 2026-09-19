const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('Navigation & DOM Integrity Tests', () => {
  const indexPath = path.join(__dirname, '..', 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');

  it('index.html must not contain unicode replacement character (\\uFFFD)', () => {
    assert.strictEqual(indexHtml.includes('\uFFFD'), false, 'index.html contains \\uFFFD replacement characters!');
  });

  it('all required navigation screens must exist in index.html', () => {
    const requiredScreens = [
      'sub-menu-main',
      'sub-menu-prepare-choice',
      'sub-menu-packs-catalog',
      'sub-menu-editor',
      'sub-menu-settings',
      'sub-menu-dev',
      'team-setup-container',
      'game-board'
    ];

    for (const screenId of requiredScreens) {
      assert.ok(
        indexHtml.includes(`id="${screenId}"`),
        `Screen with id="${screenId}" is missing in index.html`
      );
    }
  });

  it('all required modals and overlays must exist', () => {
    const requiredModals = [
      'question-modal',
      'turn-order-modal',
      'cat-splash-overlay',
      'auction-splash-overlay',
      'pack-preview-modal'
    ];

    for (const modalId of requiredModals) {
      assert.ok(
        indexHtml.includes(`id="${modalId}"`),
        `Modal/overlay with id="${modalId}" is missing in index.html`
      );
    }
  });

  it('sub-menu-settings back button must navigate to main menu via backToMainMenu()', () => {
    const settingsIdx = indexHtml.indexOf('id="sub-menu-settings"');
    const devIdx = indexHtml.indexOf('id="sub-menu-dev"');
    assert.ok(settingsIdx !== -1, 'sub-menu-settings found');
    const settingsSlice = indexHtml.slice(settingsIdx, devIdx !== -1 ? devIdx : settingsIdx + 5000);

    assert.ok(
      settingsSlice.includes('backToMainMenu()'),
      'sub-menu-settings must have a button with onclick="backToMainMenu()"'
    );
    assert.ok(
      !settingsSlice.includes("showSubScreen('sub-menu-prepare-choice')"),
      'sub-menu-settings must NOT navigate back to sub-menu-prepare-choice'
    );
  });

  it('sub-menu-prepare-choice back button must navigate to main menu via backToMainMenu()', () => {
    const choiceIdx = indexHtml.indexOf('id="sub-menu-prepare-choice"');
    const catalogIdx = indexHtml.indexOf('id="sub-menu-packs-catalog"');
    assert.ok(choiceIdx !== -1, 'sub-menu-prepare-choice found');
    const choiceSlice = indexHtml.slice(choiceIdx, catalogIdx !== -1 ? catalogIdx : choiceIdx + 5000);

    assert.ok(
      choiceSlice.includes('backToMainMenu()'),
      'sub-menu-prepare-choice must have a button with onclick="backToMainMenu()"'
    );
  });

  it('sub-menu-packs-catalog must provide navigation back to choice and to main menu', () => {
    const catalogIdx = indexHtml.indexOf('id="sub-menu-packs-catalog"');
    const editorIdx = indexHtml.indexOf('id="sub-menu-editor"');
    assert.ok(catalogIdx !== -1, 'sub-menu-packs-catalog found');
    const catalogSlice = indexHtml.slice(catalogIdx, editorIdx !== -1 ? editorIdx : catalogIdx + 5000);

    assert.ok(
      catalogSlice.includes("showSubScreen('sub-menu-prepare-choice')"),
      'Catalog must have a back to choice button'
    );
    assert.ok(
      catalogSlice.includes('backToMainMenu()'),
      'Catalog must have a back to main menu button'
    );
  });

  it('sub-menu-editor must provide navigation back to choice and to main menu', () => {
    const editorIdx = indexHtml.indexOf('id="sub-menu-editor"');
    const settingsIdx = indexHtml.indexOf('id="sub-menu-settings"');
    assert.ok(editorIdx !== -1, 'sub-menu-editor found');
    const editorSlice = indexHtml.slice(editorIdx, settingsIdx !== -1 ? settingsIdx : editorIdx + 5000);

    assert.ok(
      editorSlice.includes("showSubScreen('sub-menu-prepare-choice')"),
      'Editor must have a back to choice button'
    );
    assert.ok(
      editorSlice.includes('backToMainMenu()'),
      'Editor must have a back to main menu button'
    );
  });

  it('in-game header actions must include quit to main menu button', () => {
    assert.ok(
      indexHtml.includes('quitToMainMenuDirectly()'),
      'Game header must have quitToMainMenuDirectly() button'
    );
  });
});
