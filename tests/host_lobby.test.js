const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');

describe('Host Lobby & Network Client Integration Tests', () => {
    const htmlContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

    test('index.html contains dual-mode launch buttons in main menu', () => {
        assert.ok(
            htmlContent.includes('checkSavedGame()') && htmlContent.includes('Локальная игра (один экран)'),
            'Local game button must be present in sub-menu-main'
        );
        assert.ok(
            htmlContent.includes('openOnlineLobby()') && htmlContent.includes('Создать онлайн-комнату (Jackbox-режим)'),
            'Online lobby button must be present in sub-menu-main'
        );
    });

    test('index.html contains #sub-menu-online-lobby with all required elements', () => {
        assert.ok(htmlContent.includes('id="sub-menu-online-lobby"'), 'Lobby container must exist');
        assert.ok(htmlContent.includes('id="lobby-server-status"'), 'Server status indicator must exist');
        assert.ok(htmlContent.includes('id="lobby-room-code"'), 'Room code element must exist');
        assert.ok(htmlContent.includes('id="lobby-qr-code"'), 'QR code container must exist');
        assert.ok(htmlContent.includes('id="lobby-players-list"'), 'Players list container must exist');
        assert.ok(htmlContent.includes('id="btn-lobby-start-game"'), 'Start game button must exist');
        assert.ok(htmlContent.includes('id="lobby-active-pack-title"'), 'Active pack title must exist');
        assert.ok(htmlContent.includes('id="btn-copy-room-code"'), 'Copy room code button must exist');
    });

    test('index.html contains in-game #online-buzzer-banner in modal', () => {
        assert.ok(htmlContent.includes('id="online-buzzer-banner"'), 'Buzzer banner container must exist');
        assert.ok(htmlContent.includes('id="online-buzzer-text"'), 'Buzzer text element must exist');
    });

    test('index.html references required network scripts in correct order', () => {
        const protocolIdx = htmlContent.indexOf('js/net/Protocol.js');
        const qrcodeIdx = htmlContent.indexOf('js/net/qrcode.min.js');
        const netClientIdx = htmlContent.indexOf('js/net/NetworkClient.js');
        const gameJsIdx = htmlContent.indexOf('js/game.js');

        assert.ok(protocolIdx !== -1, 'Protocol.js must be referenced');
        assert.ok(qrcodeIdx !== -1, 'qrcode.min.js must be referenced');
        assert.ok(netClientIdx !== -1, 'NetworkClient.js must be referenced');
        assert.ok(gameJsIdx !== -1, 'game.js must be referenced');

        assert.ok(protocolIdx < netClientIdx, 'Protocol.js must precede NetworkClient.js');
        assert.ok(netClientIdx < gameJsIdx, 'NetworkClient.js must precede game.js');
    });

    test('css/style.css contains responsive styles for online lobby and buzzer banner', () => {
        const cssContent = fs.readFileSync(path.join(rootDir, 'css', 'style.css'), 'utf8');
        assert.ok(cssContent.includes('.btn-menu-online'), 'Online menu button style must exist');
        assert.ok(cssContent.includes('.online-lobby-header'), 'Lobby header style must exist');
        assert.ok(cssContent.includes('.lobby-room-code'), 'Lobby room code style must exist');
        assert.ok(cssContent.includes('.lobby-qr-container'), 'Lobby QR container style must exist');
        assert.ok(cssContent.includes('.lobby-player-chip'), 'Lobby player chip style must exist');
        assert.ok(cssContent.includes('.online-buzzer-banner'), 'Online buzzer banner style must exist');
        assert.ok(cssContent.includes('body.light-theme .online-lobby-title'), 'Light theme overrides must exist');
    });

    test('TASK-05: Lobby UI contains readiness badges, local host toggle, and validation rules', () => {
        assert.ok(htmlContent.includes('id="lobby-readiness-panel"'), 'Lobby readiness panel must exist');
        assert.ok(htmlContent.includes('id="lobby-host-badge"'), 'Host readiness badge must exist');
        assert.ok(htmlContent.includes('id="lobby-players-badge"'), 'Players readiness badge must exist');
        assert.ok(htmlContent.includes('id="btn-toggle-local-host"'), 'Local host toggle button must exist');

        const cssContent = fs.readFileSync(path.join(rootDir, 'css', 'style.css'), 'utf8');
        assert.ok(cssContent.includes('.lobby-readiness-panel'), '.lobby-readiness-panel CSS must exist');
        assert.ok(cssContent.includes('.readiness-badge'), '.readiness-badge CSS must exist');
        assert.ok(cssContent.includes('.badge-ready'), '.badge-ready CSS must exist');
        assert.ok(cssContent.includes('.badge-warning'), '.badge-warning CSS must exist');
        assert.ok(cssContent.includes('.btn-toggle-local-host'), '.btn-toggle-local-host CSS must exist');

        const { ERROR_CODES, MSG_TYPES } = require('../js/net/Protocol.js');
        assert.equal(ERROR_CODES.NOT_ENOUGH_PLAYERS, 'NOT_ENOUGH_PLAYERS', 'NOT_ENOUGH_PLAYERS error code must exist');
        assert.equal(ERROR_CODES.HOST_REQUIRED, 'HOST_REQUIRED', 'HOST_REQUIRED error code must exist');
        assert.equal(MSG_TYPES.HOST_SET_LOCAL_HOST, 'HOST_SET_LOCAL_HOST', 'HOST_SET_LOCAL_HOST message type must exist');

        const NetworkClient = require('../js/net/NetworkClient.js');
        const client = new NetworkClient({ url: 'ws://127.0.0.1:8080', isHost: true });
        assert.equal(typeof client.setLocalHost, 'function', 'client.setLocalHost method must exist');
    });

    test('Network Protocol and NetworkClient modules instantiate correctly', () => {
        const { MSG_TYPES, ERROR_CODES, createMessage, parseMessage } = require('../js/net/Protocol.js');
        assert.ok(MSG_TYPES.HOST_CREATE_ROOM, 'HOST_CREATE_ROOM message type must exist');
        assert.ok(MSG_TYPES.BUZZ_LOCKED, 'BUZZ_LOCKED message type must exist');

        const testMsg = createMessage(MSG_TYPES.HOST_CREATE_ROOM, { foo: 'bar' });
        const parsed = parseMessage(testMsg);
        assert.equal(parsed.type, MSG_TYPES.HOST_CREATE_ROOM);
        assert.equal(parsed.payload.foo, 'bar');

        const NetworkClient = require('../js/net/NetworkClient.js');
        const client = new NetworkClient({ url: 'ws://127.0.0.1:8080', isHost: true });
        assert.equal(typeof client.createRoom, 'function');
        assert.equal(typeof client.setPack, 'function');
        assert.equal(typeof client.startGame, 'function');
        assert.equal(typeof client.selectQuestion, 'function');
        assert.equal(typeof client.activateBuzzer, 'function');
        assert.equal(typeof client.judgeAnswer, 'function');
        assert.equal(typeof client.getPlayersList, 'function');
    });

    test('TASK-01: Lobby Game & Timer Settings UI, Modal, and Protocol Integration', () => {
        // Summary chips bar
        assert.ok(htmlContent.includes('id="lobby-settings-bar"'), '#lobby-settings-bar must exist');
        assert.ok(htmlContent.includes('id="chip-reading-time"'), '#chip-reading-time must exist');
        assert.ok(htmlContent.includes('id="chip-thinking-time"'), '#chip-thinking-time must exist');
        assert.ok(htmlContent.includes('id="chip-answer-time"'), '#chip-answer-time must exist');
        assert.ok(htmlContent.includes('id="chip-penalty"'), '#chip-penalty must exist');
        assert.ok(htmlContent.includes('id="btn-open-lobby-settings"'), '#btn-open-lobby-settings must exist');

        // Modal dialog & inputs
        assert.ok(htmlContent.includes('id="lobby-settings-modal"'), '#lobby-settings-modal must exist');
        assert.ok(htmlContent.includes('id="lobby-setting-reading-time"'), '#lobby-setting-reading-time must exist');
        assert.ok(htmlContent.includes('id="lobby-setting-thinking-time"'), '#lobby-setting-thinking-time must exist');
        assert.ok(htmlContent.includes('id="lobby-setting-answer-time"'), '#lobby-setting-answer-time must exist');
        assert.ok(htmlContent.includes('id="lobby-setting-penalty-enabled"'), '#lobby-setting-penalty-enabled must exist');
        assert.ok(htmlContent.includes('id="lobby-setting-penalty-mode"'), '#lobby-setting-penalty-mode must exist');
        assert.ok(htmlContent.includes('id="lobby-setting-penalty-fixed-amount"'), '#lobby-setting-penalty-fixed-amount must exist');
        assert.ok(htmlContent.includes('id="btn-save-lobby-settings"'), '#btn-save-lobby-settings must exist');

        // Protocol message types
        const { MSG_TYPES } = require('../js/net/Protocol.js');
        assert.equal(MSG_TYPES.HOST_UPDATE_ROOM_SETTINGS, 'HOST_UPDATE_ROOM_SETTINGS');
        assert.equal(MSG_TYPES.ROOM_SETTINGS_UPDATED, 'ROOM_SETTINGS_UPDATED');

        // NetworkClient method
        const NetworkClient = require('../js/net/NetworkClient.js');
        const client = new NetworkClient({ url: 'ws://127.0.0.1:8080', isHost: true });
        assert.equal(typeof client.updateRoomSettings, 'function', 'updateRoomSettings method must exist on NetworkClient');
    });

    test('TASK-13: 3-column LAN lobby layout, pack management card, player roles/ping, and bottom action bar', () => {
        // 3 Zones structure in HTML
        assert.ok(htmlContent.includes('class="lobby-card lobby-connect-card"'), 'Zone 1: Connect card must exist');
        assert.ok(htmlContent.includes('class="lobby-card lobby-players-card"'), 'Zone 2: Players card must exist');
        assert.ok(htmlContent.includes('class="lobby-card lobby-pack-card"'), 'Zone 3: Pack card must exist');

        // Zone 3: Pack meta & upload controls
        assert.ok(htmlContent.includes('id="lobby-active-pack-meta"'), 'Pack metadata container must exist');
        assert.ok(htmlContent.includes('id="pack-meta-rounds"'), 'Pack rounds pill must exist');
        assert.ok(htmlContent.includes('id="pack-meta-themes"'), 'Pack themes pill must exist');
        assert.ok(htmlContent.includes('btn-change-pack'), 'Change pack button must exist');
        assert.ok(htmlContent.includes('btn-upload-lobby-pack'), 'Upload pack button must exist');
        assert.ok(htmlContent.includes('id="lobby-pack-file-input"'), 'Lobby pack file input must exist');

        // Dominant bottom action bar
        assert.ok(htmlContent.includes('lobby-bottom-action-bar'), 'Dominant bottom action bar must exist');
        assert.ok(htmlContent.includes('id="btn-lobby-start-game"'), 'Start button must be present in lobby');

        // CSS Styles verification
        const cssContent = fs.readFileSync(path.join(rootDir, 'css', 'style.css'), 'utf8');
        assert.ok(cssContent.includes('.lobby-pack-card') || cssContent.includes('.lobby-bottom-action-bar'), 'Lobby redesign CSS must exist');
        assert.ok(cssContent.includes('.lobby-role-badge'), 'Role badge style must exist');
        assert.ok(cssContent.includes('.role-host'), 'Host role style must exist');
        assert.ok(cssContent.includes('.role-player'), 'Player role style must exist');
        assert.ok(cssContent.includes('.lobby-player-ping'), 'Player ping style must exist');
        assert.ok(cssContent.includes('.btn-upload-lobby-pack'), 'Upload pack button style must exist');
        assert.ok(cssContent.includes('body.light-theme .lobby-bottom-action-bar'), 'Light theme for action bar must exist');
        assert.ok(cssContent.includes('body.light-theme .lobby-pack-card'), 'Light theme for pack card must exist');

        // JS logic verification
        const gameJsContent = fs.readFileSync(path.join(rootDir, 'js', 'game.js'), 'utf8');
        assert.ok(gameJsContent.includes('uploadLobbyCustomPack'), 'uploadLobbyCustomPack function must exist in game.js');
        assert.ok(gameJsContent.includes('lobby-role-badge'), 'Player chip rendering must include role badges');
        assert.ok(gameJsContent.includes('lobby-player-ping'), 'Player chip rendering must include ping indicator');
    });
});
