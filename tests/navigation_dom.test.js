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
      'sub-menu-first-turn',
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

  it('sub-menu-packs-catalog must provide navigation back to choice via top-right button', () => {
    const catalogIdx = indexHtml.indexOf('id="sub-menu-packs-catalog"');
    const editorIdx = indexHtml.indexOf('id="sub-menu-editor"');
    assert.ok(catalogIdx !== -1, 'sub-menu-packs-catalog found');
    const catalogSlice = indexHtml.slice(catalogIdx, editorIdx !== -1 ? editorIdx : catalogIdx + 5000);

    assert.ok(
      catalogSlice.includes("showSubScreen('sub-menu-prepare-choice')"),
      'Catalog must have a back to choice button in header'
    );
  });

  it('sub-menu-editor must provide navigation back to choice via top-right button', () => {
    const editorIdx = indexHtml.indexOf('id="sub-menu-editor"');
    const settingsIdx = indexHtml.indexOf('id="sub-menu-settings"');
    assert.ok(editorIdx !== -1, 'sub-menu-editor found');
    const editorSlice = indexHtml.slice(editorIdx, settingsIdx !== -1 ? settingsIdx : editorIdx + 5000);

    assert.ok(
      editorSlice.includes("showSubScreen('sub-menu-prepare-choice')"),
      'Editor must have a back to choice button in header'
    );
  });

  it('in-game header actions must include quit to main menu button', () => {
    assert.ok(
      indexHtml.includes('quitToMainMenuDirectly()'),
      'Game header must have quitToMainMenuDirectly() button'
    );
  });

  it('all modal containers with action buttons must be styled for centering (.modal-controls or .modal-actions)', () => {
    const styleCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');

    // Ensure CSS supports both .modal-controls and .modal-actions with justify-content: center
    assert.ok(
      styleCss.includes('.modal-controls') && styleCss.includes('justify-content: center'),
      'style.css must have .modal-controls with justify-content: center'
    );
    assert.ok(
      styleCss.includes('.modal-actions') && styleCss.includes('justify-content: center'),
      'style.css must have .modal-actions with justify-content: center'
    );

    // Verify index.html button areas
    const buttonAreas = ['modal-buttons-area', 'system-modal-buttons'];
    for (const areaId of buttonAreas) {
      const tagMatch = indexHtml.match(new RegExp(`<div[^>]*id="${areaId}"[^>]*>`));
      assert.ok(tagMatch, `Button area #${areaId} exists`);
      const classMatch = tagMatch[0].match(/class="([^"]*)"/);
      assert.ok(classMatch, `Button area #${areaId} must have class attribute`);
      const classes = classMatch[1].split(/\s+/);
      const hasValidClass = classes.includes('modal-controls') || classes.includes('modal-actions');
      assert.ok(hasValidClass, `Button area #${areaId} must have class modal-controls or modal-actions, got: ${classMatch[1]}`);
    }
  });

  it('sub-menu-settings must have all required input fields and save handler', () => {
    const requiredInputs = ['setting-reading-time', 'setting-thinking-time', 'setting-answer-time', 'setting-type-cat', 'setting-type-auction', 'setting-type-auction-leader'];
    for (const inputId of requiredInputs) {
      assert.ok(indexHtml.includes(`id="${inputId}"`), `Settings input #${inputId} must exist in index.html`);
    }
    assert.ok(indexHtml.includes('saveSettings()'), 'Settings screen must have saveSettings() button');
  });

  it('team setup container action buttons must be styled vertically and centered before starting game', () => {
    const styleCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');

    assert.ok(
      styleCss.includes('.team-setup-actions-vertical') &&
      styleCss.includes('flex-direction: column'),
      'style.css must define .team-setup-actions-vertical with flex-direction: column'
    );

    const teamSetupIdx = indexHtml.indexOf('id="team-setup-container"');
    assert.ok(teamSetupIdx !== -1, 'team-setup-container exists');
    const teamSetupSlice = indexHtml.slice(teamSetupIdx, teamSetupIdx + 1500);
    assert.ok(
      teamSetupSlice.includes('setup-actions'),
      'team-setup-container must contain setup-actions'
    );
    assert.ok(
      teamSetupSlice.includes('team-setup-actions-vertical'),
      'team-setup-container must use team-setup-actions-vertical for vertical layout'
    );
  });
});
