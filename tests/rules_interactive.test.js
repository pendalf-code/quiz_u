const {describe, it} = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('TASK-09: Interactive Rules Modal & Mode Tabs Suite', () => {
    const indexPath = path.join(__dirname, '..', 'index.html');
    const indexHtml = fs.readFileSync(indexPath, 'utf8');

    const cssPath = path.join(__dirname, '..', 'css', 'style.css');
    const styleCss = fs.readFileSync(cssPath, 'utf8');

    const jsPath = path.join(__dirname, '..', 'js', 'game.js');
    const gameJs = fs.readFileSync(jsPath, 'utf8');

    it('index.html must not contain replacement characters (\\uFFFD)', () => {
        assert.strictEqual(indexHtml.includes('\uFFFD'), false, 'index.html contains \\uFFFD!');
    });

    it('main menu contains button to open rules modal', () => {
        assert.ok(
            indexHtml.includes('btn-menu-rules') && indexHtml.includes('showJeopardyRules()'),
            'Main menu must contain button with btn-menu-rules calling showJeopardyRules()'
        );
    });

    it('index.html defines #rules-modal with header, close controls, and footer', () => {
        assert.ok(indexHtml.includes('id="rules-modal"'), 'Modal #rules-modal must exist');
        assert.ok(indexHtml.includes('rules-modal-card'), 'Modal must have .rules-modal-card');
        assert.ok(indexHtml.includes('rules-title'), 'Modal must have .rules-title header');
        assert.ok(indexHtml.includes('onclick="closeRulesModal()"'), 'Modal must have close button calling closeRulesModal()');
        assert.ok(indexHtml.includes('id="btn-close-rules"'), 'Modal footer must have #btn-close-rules');
    });

    it('defines 3 interactive mode tabs in navigation bar with ARIA roles', () => {
        assert.ok(indexHtml.includes('id="rules-tabs-nav"'), '#rules-tabs-nav container must exist');
        assert.ok(indexHtml.includes('role="tablist"'), 'Navigation must declare role="tablist"');

        const requiredTabs = [
            {id: 'tab-btn-local', mode: 'local', label: 'Локальная игра'},
            {id: 'tab-btn-lan', mode: 'lan', label: 'LAN игра'},
            {id: 'tab-btn-special', mode: 'special', label: 'Специальные вопросы'}
        ];

        for (const tab of requiredTabs) {
            assert.ok(indexHtml.includes(`id="${tab.id}"`), `Tab #${tab.id} must exist`);
            assert.ok(indexHtml.includes(`switchRulesTab('${tab.mode}')`), `Tab #${tab.id} must call switchRulesTab('${tab.mode}')`);
            assert.ok(indexHtml.includes(tab.label), `Tab #${tab.id} must contain label ${tab.label}`);
        }
    });

    it('defines 3 tabpanels with rich cards for each game mode', () => {
        const requiredPanels = [
            'rules-tab-local',
            'rules-tab-lan',
            'rules-tab-special'
        ];

        for (const panelId of requiredPanels) {
            assert.ok(indexHtml.includes(`id="${panelId}"`), `Panel #${panelId} must exist`);
            assert.ok(indexHtml.includes(`id="${panelId}" role="tabpanel"`), `Panel #${panelId} must declare role="tabpanel"`);
        }
    });

    it('Tab 1 (Локальная игра) covers key controls, turn order, and scoring', () => {
        const localIdx = indexHtml.indexOf('id="rules-tab-local"');
        const lanIdx = indexHtml.indexOf('id="rules-tab-lan"');
        assert.ok(localIdx !== -1 && lanIdx !== -1, 'Panels must exist');
        const localContent = indexHtml.slice(localIdx, lanIdx);

        // Key controls
        assert.ok(localContent.includes('Пробел'), 'Must explain Space key control');
        assert.ok(localContent.includes('rules-kbd'), 'Must use .rules-kbd styled keycaps');
        assert.ok(localContent.includes('Esc'), 'Must explain Esc key');
        assert.ok(localContent.includes('Enter'), 'Must explain Enter key');

        // Turn order & Scoring
        assert.ok(localContent.includes('Очередность ходов'), 'Must explain turn order');
        assert.ok(localContent.includes('Подсчёт очков'), 'Must explain scoring rules');
        assert.ok(localContent.includes('Очки всем'), 'Must mention quick bonus points for all teams');
    });

    it('Tab 2 (LAN игра) covers smartphones connection, host/player roles, buzzer race, and penalties', () => {
        const lanIdx = indexHtml.indexOf('id="rules-tab-lan"');
        const specialIdx = indexHtml.indexOf('id="rules-tab-special"');
        assert.ok(lanIdx !== -1 && specialIdx !== -1, 'Panels must exist');
        const lanContent = indexHtml.slice(lanIdx, specialIdx);

        assert.ok(lanContent.includes('Wi-Fi') || lanContent.includes('QR-код'), 'Must explain network/QR connection');
        assert.ok(lanContent.includes('Ведущий') && lanContent.includes('Игрок'), 'Must explain host & player roles');
        assert.ok(lanContent.includes('Баззер') || lanContent.includes('баззер'), 'Must explain buzzer race');
        assert.ok(lanContent.includes('таймер') || lanContent.includes('Тайминг'), 'Must explain timers');
        assert.ok(lanContent.includes('Штраф') || lanContent.includes('штраф'), 'Must explain penalties and second chance');
    });

    it('Tab 3 (Специальные вопросы) covers Cat in Bag, Auction, and Question without transfer', () => {
        const specialIdx = indexHtml.indexOf('id="rules-tab-special"');
        const closeBtnIdx = indexHtml.indexOf('id="btn-close-rules"');
        assert.ok(specialIdx !== -1 && closeBtnIdx !== -1, 'Sections must exist');
        const specialContent = indexHtml.slice(specialIdx, closeBtnIdx);

        // Cat in bag
        assert.ok(specialContent.includes('Кот в мешке'), 'Must cover Cat in bag');
        assert.ok(specialContent.includes('не может отвечать сама') || specialContent.includes('передать'), 'Must state cat question cannot be answered by picker');

        // Auction
        assert.ok(specialContent.includes('Аукцион'), 'Must cover Auction');
        assert.ok(specialContent.includes('торг') || specialContent.includes('ставк'), 'Must cover auction bidding');

        // Without transfer / Final
        assert.ok(specialContent.includes('Без передачи') || specialContent.includes('без передачи'), 'Must cover question without transfer');
        assert.ok(specialContent.includes('Финальный раунд') || specialContent.includes('Финал'), 'Must cover final round');
    });

    it('css/style.css contains all required styles for rules modal and tabs', () => {
        assert.ok(styleCss.includes('.rules-modal-card'), 'style.css must define .rules-modal-card');
        assert.ok(styleCss.includes('.rules-tabs-nav'), 'style.css must define .rules-tabs-nav');
        assert.ok(styleCss.includes('.rules-tab-btn'), 'style.css must define .rules-tab-btn');
        assert.ok(styleCss.includes('.rules-content-scroll'), 'style.css must define .rules-content-scroll');
        assert.ok(styleCss.includes('.rules-block'), 'style.css must define .rules-block');
        assert.ok(styleCss.includes('.rules-kbd'), 'style.css must define .rules-kbd keycaps');
    });

    it('css/style.css contains light theme styling for rules modal', () => {
        assert.ok(styleCss.includes('body.light-theme .rules-modal-card'), 'Must support light theme for .rules-modal-card');
        assert.ok(styleCss.includes('body.light-theme .rules-tabs-nav'), 'Must support light theme for .rules-tabs-nav');
        assert.ok(styleCss.includes('body.light-theme .rules-tab-btn'), 'Must support light theme for .rules-tab-btn');
    });

    it('js/game.js defines and exports rules modal functions and Escape handler', () => {
        assert.ok(gameJs.includes('function switchRulesTab'), 'Must define switchRulesTab');
        assert.ok(gameJs.includes('function showJeopardyRules'), 'Must define showJeopardyRules');
        assert.ok(gameJs.includes('function closeRulesModal'), 'Must define closeRulesModal');
        assert.ok(gameJs.includes('window.switchRulesTab = switchRulesTab'), 'Must export switchRulesTab to window');
        assert.ok(gameJs.includes('window.showJeopardyRules = showJeopardyRules'), 'Must export showJeopardyRules to window');
        assert.ok(gameJs.includes('window.closeRulesModal = closeRulesModal'), 'Must export closeRulesModal to window');

        // Keydown Escape support
        assert.ok(
            gameJs.includes("document.getElementById('rules-modal')") &&
            gameJs.includes('closeRulesModal()'),
            'Keydown listener must support Escape key closing for rules modal'
        );
    });
});
