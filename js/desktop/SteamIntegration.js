/**
 * Quiz U - Steamworks SDK Integration & Abstraction Layer
 * Provides seamless bridge to Steamworks API with graceful offline/browser fallback.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.SteamIntegration = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    class SteamIntegration {
        constructor() {
            this.initialized = false;
            this.isSteamClient = false;
            this.isDeck = false;
            this.currentUser = {
                steamId: null,
                personaName: 'Игрок',
                avatarUrl: null
            };
            this.richPresenceState = {};
            this.nativeBackend = null;
        }

        /**
         * Initialize Steamworks integration.
         * Auto-detects Tauri invoke, GreenLuma / Electron steamworks.js, or falls back to Web Standalone.
         * @param {Object} [options]
         * @returns {Promise<boolean>} Whether running under active Steam client.
         */
        async init(options = {}) {
            if (this.initialized) return this.isSteamClient;

            // 1. Check if mock/testing backend is provided
            if (options.mockBackend) {
                this.nativeBackend = options.mockBackend;
                this.isSteamClient = true;
                this.currentUser = {
                    steamId: this.nativeBackend.getSteamId ? this.nativeBackend.getSteamId() : '76561198000000000',
                    personaName: this.nativeBackend.getPersonaName ? this.nativeBackend.getPersonaName() : 'SteamХост',
                    avatarUrl: null
                };
                this.isDeck = Boolean(this.nativeBackend.isSteamDeck && this.nativeBackend.isSteamDeck());
                this.initialized = true;
                return true;
            }

            // 2. Check for Tauri runtime IPC
            if (typeof window !== 'undefined' && window.__TAURI__ && window.__TAURI__.core) {
                try {
                    const sysInfo = await window.__TAURI__.core.invoke('get_system_info');
                    if (sysInfo) {
                        this.isDeck = Boolean(sysInfo.is_steam_deck);
                    }
                } catch (e) {
                    // Running in dev or non-steam environment
                }
            }

            // 3. Check for Steam environment variables or globals
            if (typeof process !== 'undefined' && process.env && (process.env.SteamAppId || process.env.SteamGameId)) {
                this.isSteamClient = true;
            }

            // 4. Check for node/electron steamworks.js
            if (typeof window !== 'undefined' && window.steamworks) {
                try {
                    this.nativeBackend = window.steamworks;
                    this.isSteamClient = true;
                    if (this.nativeBackend.localplayer) {
                        this.currentUser.steamId = String(this.nativeBackend.localplayer.getSteamId());
                        this.currentUser.personaName = this.nativeBackend.localplayer.getName();
                    }
                } catch (e) {
                    console.warn('[SteamIntegration] Native steamworks init error:', e);
                }
            }

            // 5. Check URL parameters for Steam Deck preview mode (?steamdeck=1)
            if (typeof window !== 'undefined' && window.location && window.location.search) {
                const params = new URLSearchParams(window.location.search);
                if (params.get('steamdeck') === '1') {
                    this.isDeck = true;
                }
            }

            this.initialized = true;
            return this.isSteamClient;
        }

        /**
         * Returns true if active Steam API is available.
         */
        isAvailable() {
            return this.isSteamClient;
        }

        /**
         * Returns true if running on Steam Deck or Steam Deck emulation mode.
         */
        isSteamDeck() {
            return this.isDeck;
        }

        /**
         * Get current Steam user info or default fallback profile.
         */
        getCurrentUser() {
            return { ...this.currentUser };
        }

        /**
         * Set low-level Steam Rich Presence key/value.
         * @param {string} key
         * @param {string} value
         */
        setRichPresence(key, value) {
            this.richPresenceState[key] = String(value);

            if (this.nativeBackend && typeof this.nativeBackend.setRichPresence === 'function') {
                try {
                    this.nativeBackend.setRichPresence(key, String(value));
                } catch (e) {
                    // Safe fallback
                }
            }
        }

        /**
         * High-level helper to update Steam Rich Presence status.
         * Formats friendly status string visible to Steam Friends.
         *
         * @param {Object} status
         * @param {string} status.activity - e.g. "В лобби", "В викторине", "Финальный раунд"
         * @param {string} [status.theme] - Current round theme name
         * @param {string} [status.roomCode] - 4-letter online lobby room code
         * @param {number} [status.playersCount] - Connected players count
         * @param {string} [status.packTitle] - Selected question pack title
         */
        updateGameStatus(status = {}) {
            const { activity = 'В игре', theme, roomCode, playersCount, packTitle } = status;

            let displayStatus = activity;
            if (theme) {
                displayStatus += `: ${theme}`;
            } else if (packTitle) {
                displayStatus += ` [${packTitle}]`;
            }

            if (roomCode) {
                displayStatus += ` (Код: ${roomCode})`;
                this.setRichPresence('steam_player_group', roomCode);
            }

            if (typeof playersCount === 'number') {
                this.setRichPresence('steam_player_group_size', String(playersCount));
            }

            this.setRichPresence('status', displayStatus);
            this.setRichPresence('steam_display', '#StatusFull');

            return displayStatus;
        }

        /**
         * Clear all Steam Rich Presence tokens.
         */
        clearRichPresence() {
            this.richPresenceState = {};
            if (this.nativeBackend && typeof this.nativeBackend.clearRichPresence === 'function') {
                try {
                    this.nativeBackend.clearRichPresence();
                } catch (e) {
                    // Fallback
                }
            }
        }

        /**
         * Triggers the Steam Deck floating virtual gamepad text input dialog.
         * @param {Object} [options]
         * @param {string} [options.description] - Description hint above keyboard
         * @param {number} [options.maxLength] - Maximum allowable length
         * @param {string} [options.existingText] - Pre-filled input string
         * @returns {boolean} Whether the native request was dispatched
         */
        openGamepadTextInput(options = {}) {
            const { description = 'Введите текст', maxLength = 32, existingText = '' } = options;

            if (this.nativeBackend && typeof this.nativeBackend.showFloatingGamepadTextInput === 'function') {
                try {
                    return Boolean(this.nativeBackend.showFloatingGamepadTextInput(0, 0, 0, 0, 0));
                } catch (e) {
                    return false;
                }
            }

            // Fallback for desktop/browser: focus standard HTML active input if any
            if (typeof document !== 'undefined') {
                const active = document.activeElement;
                if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
                    active.focus();
                    return true;
                }
            }
            return false;
        }

        /**
         * Opens the Steam Overlay to a specific dialog ("Friends", "Community", "Players", "Settings").
         * @param {string} [dialog='Friends']
         */
        openOverlay(dialog = 'Friends') {
            if (this.nativeBackend && typeof this.nativeBackend.activateGameOverlay === 'function') {
                try {
                    this.nativeBackend.activateGameOverlay(dialog);
                    return true;
                } catch (e) {
                    return false;
                }
            }
            return false;
        }

        /**
         * Clean shutdown
         */
        shutdown() {
            this.clearRichPresence();
            this.initialized = false;
            this.isSteamClient = false;
        }
    }

    return SteamIntegration;
}));
