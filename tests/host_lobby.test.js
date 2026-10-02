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
});
