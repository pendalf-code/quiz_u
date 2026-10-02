const { describe, it } = require('node:test');
const assert = require('node:assert');
const SteamIntegration = require('../js/desktop/SteamIntegration.js');

describe('Steam Integration & Graceful Fallback Tests (Stage 5.3)', () => {
    it('initializes in standalone fallback mode without errors when outside Steam', async () => {
        const steam = new SteamIntegration();
        assert.strictEqual(steam.initialized, false);

        const isSteam = await steam.init();
        assert.strictEqual(isSteam, false);
        assert.strictEqual(steam.isAvailable(), false);
        assert.strictEqual(steam.isSteamDeck(), false);

        const user = steam.getCurrentUser();
        assert.strictEqual(user.personaName, 'Игрок');
        assert.strictEqual(user.steamId, null);
    });

    it('handles rich presence updates gracefully without throwing in fallback mode', async () => {
        const steam = new SteamIntegration();
        await steam.init();

        const formatted = steam.updateGameStatus({
            activity: 'В викторине',
            theme: 'Кино и Музыка',
            roomCode: 'ABCD',
            playersCount: 4
        });

        assert.ok(formatted.includes('В викторине: Кино и Музыка'));
        assert.ok(formatted.includes('(Код: ABCD)'));
        assert.strictEqual(steam.richPresenceState['steam_player_group'], 'ABCD');
        assert.strictEqual(steam.richPresenceState['steam_player_group_size'], '4');
        assert.strictEqual(steam.richPresenceState['steam_display'], '#StatusFull');

        // Clear rich presence
        steam.clearRichPresence();
        assert.deepStrictEqual(steam.richPresenceState, {});
    });

    it('works with mock Steamworks backend when present', async () => {
        const mockCalls = [];
        const mockBackend = {
            getSteamId: () => '76561198123456789',
            getPersonaName: () => 'SteamGamerHost',
            isSteamDeck: () => true,
            setRichPresence: (k, v) => mockCalls.push({ type: 'setRP', key: k, value: v }),
            clearRichPresence: () => mockCalls.push({ type: 'clearRP' }),
            showFloatingGamepadTextInput: () => true,
            activateGameOverlay: (d) => mockCalls.push({ type: 'overlay', dialog: d })
        };

        const steam = new SteamIntegration();
        const isSteam = await steam.init({ mockBackend });

        assert.strictEqual(isSteam, true);
        assert.strictEqual(steam.isAvailable(), true);
        assert.strictEqual(steam.isSteamDeck(), true);

        const user = steam.getCurrentUser();
        assert.strictEqual(user.personaName, 'SteamGamerHost');
        assert.strictEqual(user.steamId, '76561198123456789');

        steam.updateGameStatus({ activity: 'Финал', packTitle: 'Киномания' });
        assert.ok(mockCalls.some(c => c.type === 'setRP' && c.key === 'status' && c.value.includes('Финал [Киномания]')));

        const keyboardOpened = steam.openGamepadTextInput({ description: 'Имя команды' });
        assert.strictEqual(keyboardOpened, true);

        const overlayOpened = steam.openOverlay('Friends');
        assert.strictEqual(overlayOpened, true);
        assert.ok(mockCalls.some(c => c.type === 'overlay' && c.dialog === 'Friends'));

        steam.shutdown();
        assert.strictEqual(steam.initialized, false);
        assert.strictEqual(steam.isAvailable(), false);
    });
});
