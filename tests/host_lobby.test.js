const {test, describe} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');

describe('Host Lobby & Network Client Integration Tests', () => {
    const htmlContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

    test('TASK-06, 07, 08, 10, 11, 12: main menu mode buttons and navigation cleanup', () => {
        // TASK-06: Local game without "(один экран)"
        assert.ok(
            htmlContent.includes('checkSavedGame()') && htmlContent.includes('Локальная игра'),
            'Local game button must be present in sub-menu-main'
        );
        assert.ok(
            !htmlContent.includes('Локальная игра (один экран)'),
            'TASK-06: "один экран" subtitle must be removed'
        );

        // TASK-07: LAN game
        assert.ok(
            htmlContent.includes('openOnlineLobby()') && htmlContent.includes('LAN игра'),
            'TASK-07: LAN-game button must be present in sub-menu-main'
        );

        // TASK-08: Disabled WAN button
        assert.ok(
            htmlContent.includes('btn-menu-wan') && htmlContent.includes('Сетевая игра') && htmlContent.includes('Скоро'),
            'TASK-08: Disabled WAN game button with badge must exist'
        );

        // TASK-10, 11, 12: Cleaned up main menu
        const menuIdx = htmlContent.indexOf('id="sub-menu-main"');
        const nextScreenIdx = htmlContent.indexOf('id="sub-menu-prepare-choice"');
        const mainMenuSlice = htmlContent.slice(menuIdx, nextScreenIdx);

        assert.ok(!mainMenuSlice.includes('btn-menu-settings'), 'TASK-10: Settings button removed from main menu');
        assert.ok(!mainMenuSlice.includes('btn-menu-dev'), 'TASK-11: Dev button removed from main menu');
        assert.ok(!mainMenuSlice.includes('btn-menu-packs'), 'TASK-12: Prepare questions button removed from main menu');

        // Pre-game settings access (TASK-10)
        assert.ok(htmlContent.includes('openPreGameSettings()'), 'TASK-10: Pre-game settings access in team setup');
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

    test('TASK-02: index.html contains in-game #online-buzzer-banner with answering avatar and SVG ring', () => {
        assert.ok(htmlContent.includes('id="online-buzzer-banner"'), 'Buzzer banner container must exist');
        assert.ok(htmlContent.includes('id="online-buzzer-text"'), 'Buzzer text element must exist');
        assert.ok(htmlContent.includes('id="online-buzzer-avatar"'), 'TASK-02: Buzzer avatar element must exist');
        assert.ok(htmlContent.includes('id="online-buzzer-ring-progress"'), 'TASK-02: Circular SVG progress ring must exist');
        assert.ok(htmlContent.includes('id="online-buzzer-ring-seconds"'), 'TASK-02: Answering seconds display must exist');
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

        const {ERROR_CODES, MSG_TYPES} = require('../js/net/Protocol.js');
        assert.equal(ERROR_CODES.NOT_ENOUGH_PLAYERS, 'NOT_ENOUGH_PLAYERS', 'NOT_ENOUGH_PLAYERS error code must exist');
        assert.equal(ERROR_CODES.HOST_REQUIRED, 'HOST_REQUIRED', 'HOST_REQUIRED error code must exist');
        assert.equal(MSG_TYPES.HOST_SET_LOCAL_HOST, 'HOST_SET_LOCAL_HOST', 'HOST_SET_LOCAL_HOST message type must exist');

        const NetworkClient = require('../js/net/NetworkClient.js');
        const client = new NetworkClient({url: 'ws://127.0.0.1:8080', isHost: true});
        assert.equal(typeof client.setLocalHost, 'function', 'client.setLocalHost method must exist');
    });

    test('Network Protocol and NetworkClient modules instantiate correctly', () => {
        const {MSG_TYPES, ERROR_CODES, createMessage, parseMessage} = require('../js/net/Protocol.js');
        assert.ok(MSG_TYPES.HOST_CREATE_ROOM, 'HOST_CREATE_ROOM message type must exist');
        assert.ok(MSG_TYPES.BUZZ_LOCKED, 'BUZZ_LOCKED message type must exist');

        const testMsg = createMessage(MSG_TYPES.HOST_CREATE_ROOM, {foo: 'bar'});
        const parsed = parseMessage(testMsg);
        assert.equal(parsed.type, MSG_TYPES.HOST_CREATE_ROOM);
        assert.equal(parsed.payload.foo, 'bar');

        const NetworkClient = require('../js/net/NetworkClient.js');
        const client = new NetworkClient({url: 'ws://127.0.0.1:8080', isHost: true});
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
        const {MSG_TYPES} = require('../js/net/Protocol.js');
        assert.equal(MSG_TYPES.HOST_UPDATE_ROOM_SETTINGS, 'HOST_UPDATE_ROOM_SETTINGS');
        assert.equal(MSG_TYPES.ROOM_SETTINGS_UPDATED, 'ROOM_SETTINGS_UPDATED');

        // NetworkClient method
        const NetworkClient = require('../js/net/NetworkClient.js');
        const client = new NetworkClient({url: 'ws://127.0.0.1:8080', isHost: true});
        assert.equal(typeof client.updateRoomSettings, 'function', 'updateRoomSettings method must exist on NetworkClient');
    });

    test('TASK-13: 3-column LAN lobby layout, pack management card, player roles/ping, and bottom action bar', () => {
        // 3 Zones structure in HTML
        assert.ok(htmlContent.includes('class="lobby-card lobby-connect-card"'), 'Zone 1: Connect card must exist');
        assert.ok(htmlContent.includes('class="lobby-card lobby-players-card"'), 'Zone 2: Players card must exist');
        assert.ok(htmlContent.includes('class="lobby-card lobby-pack-card"'), 'Zone 3: Pack card must exist');

        // Zone 3: Pack status badge & upload controls
        assert.ok(htmlContent.includes('id="lobby-pack-status-badge"'), 'Pack status badge must exist');
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
    test('TASK-02: Visual answering player banner, common timer freeze and circular countdown ring', () => {
        const cssContent = fs.readFileSync(path.join(rootDir, 'css', 'style.css'), 'utf8');
        const gameJsContent = fs.readFileSync(path.join(rootDir, 'js', 'game.js'), 'utf8');
        const mobileHtml = fs.readFileSync(path.join(rootDir, 'mobile', 'index.html'), 'utf8');
        const mobileCss = fs.readFileSync(path.join(rootDir, 'mobile', 'mobile.css'), 'utf8');
        const mobileJs = fs.readFileSync(path.join(rootDir, 'mobile', 'mobile.js'), 'utf8');

        // TV / Host Screen elements & styles (TASK-02)
        assert.ok(htmlContent.includes('id="online-buzzer-avatar"'), 'Answering avatar element exists');
        assert.ok(htmlContent.includes('id="online-buzzer-ring-wrap"'), 'Circular progress ring wrap exists');
        assert.ok(htmlContent.includes('id="online-buzzer-ring-progress"'), 'Circular progress ring SVG circle exists');
        assert.ok(htmlContent.includes('id="online-buzzer-ring-seconds"'), 'Circular countdown seconds element exists');

        assert.ok(cssContent.includes('.online-buzzer-avatar'), '.online-buzzer-avatar CSS exists');
        assert.ok(cssContent.includes('.online-ring-progress'), '.online-ring-progress CSS exists');
        assert.ok(cssContent.includes('.timer.paused'), '.timer.paused CSS exists for timer freeze');

        // Game.js synchronization & timer pause (TASK-02)
        assert.ok(gameJsContent.includes('startOnlineAnswerCountdown'), 'startOnlineAnswerCountdown function exists');
        assert.ok(gameJsContent.includes('stopOnlineAnswerCountdown'), 'stopOnlineAnswerCountdown function exists');
        assert.ok(gameJsContent.includes('timerElem.classList.add(\'paused\')'), 'Common question timer paused when buzzer locked');
        assert.ok(gameJsContent.includes('timerElem.classList.remove(\'paused\')'), 'Common timer unpaused when answer rejected and reopened');

        // Mobile Screen circular timer & synchronization (TASK-02)
        assert.ok(mobileHtml.includes('id="mobile-answer-ring-progress"'), 'Mobile circular progress ring exists');
        assert.ok(mobileCss.includes('.mobile-ring-progress'), 'Mobile circular ring CSS exists');
        assert.ok(mobileJs.includes('mobile-answer-ring-progress'), 'Mobile JS animates circular ring synchronously');
    });

    test('LAN game menu mobile responsiveness and readability for phones', () => {
        const cssContent = fs.readFileSync(path.join(rootDir, 'css', 'style.css'), 'utf8');

        // Verify mobile media queries exist for lobby
        assert.ok(cssContent.includes('@media (max-width: 768px)'), 'Mobile 768px media query must exist');
        assert.ok(cssContent.includes('@media (max-width: 540px)'), 'Mobile 540px media query must exist');
        assert.ok(cssContent.includes('@media (max-width: 380px)'), 'Narrow mobile 380px media query must exist');
        assert.ok(cssContent.includes('@media (max-height: 520px) and (orientation: landscape)'), 'Landscape mobile media query must exist');

        // Header adaptations
        assert.ok(cssContent.includes('grid-template-areas') && cssContent.includes('"back . status"'), 'Header two-row grid on mobile exists');

        // Connect card adaptations: room code, QR, join link, and server row
        assert.ok(cssContent.includes('clamp(34px, 8.5vw, 44px)'), 'Room code clamp font size exists');
        assert.ok(cssContent.includes('.lobby-join-link') && cssContent.includes('border-radius: 12px'), 'Lobby join link touch card styling exists');
        assert.ok(cssContent.includes('.lobby-server-row') && cssContent.includes('flex-direction: column'), 'Server row vertical stack for mobile exists');

        // Players card: readiness panel & local host toggle
        assert.ok(cssContent.includes('.lobby-readiness-panel') && cssContent.includes('flex-direction: column'), 'Readiness panel vertical flow on mobile exists');
        assert.ok(cssContent.includes('.btn-toggle-local-host') && cssContent.includes('width: 100%'), 'Local host button full width on mobile exists');

        // Settings modal on phones
        assert.ok(cssContent.includes('.lobby-settings-modal-card') && cssContent.includes('width: 95vw !important'), 'Settings modal responsive width exists');
    });

    test('Host PC Disable & Disconnect Functionality: can enable and disable local host on PC cleanly', () => {
        assert.ok(htmlContent.includes('id="btn-kick-host"'), 'Button to kick/disconnect host must exist');
        const cssContent = fs.readFileSync(path.join(rootDir, 'css', 'style.css'), 'utf8');
        assert.ok(cssContent.includes('.btn-kick-host'), '.btn-kick-host CSS must exist');

        const NetworkClient = require('../js/net/NetworkClient.js');
        const client = new NetworkClient({url: 'ws://127.0.0.1:8080', isHost: true});

        // 1. Enable local host on PC
        client.setLocalHost(true);
        assert.equal(client.isHostOnPC, true);
        assert.equal(client.hasHost, true);
        assert.ok(client.getHost(), 'Host object must exist');
        assert.equal(client.getHost().id, 'host_pc');

        // 2. Simulate server sending state with host_pc
        client._syncPlayersFromState({
            hasHost: true,
            isHostOnPC: true,
            host: {id: 'host_pc', name: 'Ведущий (ПК)', role: 'host', isConnected: true},
            players: []
        });
        assert.equal(client.hasHost, true);
        assert.equal(client.getHost().id, 'host_pc');

        // 3. Disable local host on PC
        client.setLocalHost(false);
        assert.equal(client.isHostOnPC, false);
        assert.equal(client.hasHost, false);
        assert.equal(client.getHost(), null, 'Host must be null when disabled');

        // 4. Simulate server responding with host: null
        client._syncPlayersFromState({
            hasHost: false,
            isHostOnPC: false,
            host: null,
            players: []
        });
        assert.equal(client.hasHost, false);
        assert.equal(client.getHost(), null);

        // 5. Test kickPlayer method
        assert.equal(typeof client.kickPlayer, 'function');
        client.setLocalHost(true);
        assert.equal(client.isHostOnPC, true);
        client.kickPlayer('host_pc');
        assert.equal(client.isHostOnPC, false);
        assert.equal(client.hasHost, false);
        assert.equal(client.getHost(), null);
    });

});
