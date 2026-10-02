/**
 * Quiz U - Gamepad API & Steam Deck Navigation Manager
 * Implements 2D grid navigation, D-Pad/stick deadzone filtering, button mappings (A, B, X, Y),
 * and Steam Deck 1280x800 HUD integration.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.GamepadManager = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Standard Gamepad button indices (W3C Standard Gamepad Mapping)
    const BUTTON_A = 0;         // South (Xbox A, PS Cross) -> Select / Confirm / Buzz
    const BUTTON_B = 1;         // East  (Xbox B, PS Circle) -> Back / Close / Cancel
    const BUTTON_X = 2;         // West  (Xbox X, PS Square) -> Quick Action / Judge Correct
    const BUTTON_Y = 3;         // North (Xbox Y, PS Triangle) -> Pause/Resume Timer / Judge Incorrect
    const BUTTON_LB = 4;        // Left Bumper
    const BUTTON_RB = 5;        // Right Bumper
    const BUTTON_LT = 6;        // Left Trigger
    const BUTTON_RT = 7;        // Right Trigger
    const BUTTON_SELECT = 8;    // Back / View / Select -> Toggle Fullscreen (F11)
    const BUTTON_START = 9;     // Start / Menu -> Pause / Rules / Menu
    const BUTTON_L3 = 10;       // Left Stick Press
    const BUTTON_R3 = 11;       // Right Stick Press
    const BUTTON_DPAD_UP = 12;  // D-Pad Up
    const BUTTON_DPAD_DOWN = 13;// D-Pad Down
    const BUTTON_DPAD_LEFT = 14;// D-Pad Left
    const BUTTON_DPAD_RIGHT = 15;// D-Pad Right

    const STICK_DEADZONE = 0.45;
    const NAVIGATION_REPEAT_DELAY_MS = 190;

    class GamepadManager {
        constructor(options = {}) {
            this.enabled = options.enabled !== false;
            this.focusedElement = null;
            this.activeGamepadIndex = null;
            this.lastNavTime = 0;
            this.prevButtonStates = {};
            this.pollingRafId = null;
            this.toastTimer = null;
            this.customKeyBindings = options.keyBindings || {};
            this.onButtonPress = options.onButtonPress || null;

            this.boundPollLoop = this.pollLoop.bind(this);
            this.boundOnConnected = this.onGamepadConnected.bind(this);
            this.boundOnDisconnected = this.onGamepadDisconnected.bind(this);
            this.boundOnKeyDown = this.onKeyDown.bind(this);
        }

        /**
         * Initialize Gamepad listeners, keyboard F11 hook, and start polling loop.
         */
        init() {
            if (typeof window === 'undefined') return;

            window.addEventListener('gamepadconnected', this.boundOnConnected);
            window.addEventListener('gamepaddisconnected', this.boundOnDisconnected);
            window.addEventListener('keydown', this.boundOnKeyDown);

            // Expose globally for UI handlers
            window.toggleFullscreen = this.toggleFullscreen.bind(this);

            this.startPolling();
        }

        /**
         * Teardown listeners and stop polling
         */
        destroy() {
            if (typeof window === 'undefined') return;

            window.removeEventListener('gamepadconnected', this.boundOnConnected);
            window.removeEventListener('gamepaddisconnected', this.boundOnDisconnected);
            window.removeEventListener('keydown', this.boundOnKeyDown);

            this.stopPolling();
            this.clearFocus();
        }

        startPolling() {
            if (this.pollingRafId === null && typeof window !== 'undefined' && window.requestAnimationFrame) {
                this.pollingRafId = window.requestAnimationFrame(this.boundPollLoop);
            }
        }

        stopPolling() {
            if (this.pollingRafId !== null && typeof window !== 'undefined' && window.cancelAnimationFrame) {
                window.cancelAnimationFrame(this.pollingRafId);
                this.pollingRafId = null;
            }
        }

        onGamepadConnected(e) {
            const gp = e.gamepad;
            this.activeGamepadIndex = gp.index;
            this.showToast(`🎮 Подключен геймпад: ${gp.id.split('(')[0].trim() || 'Controller'}`);
            this.ensureInitialFocus();
        }

        onGamepadDisconnected(e) {
            this.showToast(`🔌 Геймпад отключен: ${e.gamepad.id.split('(')[0].trim()}`);
            if (this.activeGamepadIndex === e.gamepad.index) {
                this.activeGamepadIndex = null;
            }
        }

        onKeyDown(e) {
            if (e.key === 'F11') {
                e.preventDefault();
                this.toggleFullscreen();
            }
        }

        /**
         * Toggle application fullscreen mode (Web Fullscreen API with Tauri fallback).
         */
        async toggleFullscreen() {
            if (typeof window !== 'undefined' && window.__TAURI__ && window.__TAURI__.core) {
                try {
                    return await window.__TAURI__.core.invoke('toggle_fullscreen');
                } catch (e) {
                    console.warn('[GamepadManager] Tauri toggle_fullscreen fallback to DOM:', e);
                }
            }

            if (typeof document === 'undefined') return false;

            try {
                if (!document.fullscreenElement) {
                    await document.documentElement.requestFullscreen();
                    this.showToast('⛶ Полноэкранный режим включен');
                    return true;
                } else {
                    await document.exitFullscreen();
                    this.showToast('⛶ Оконный режим');
                    return false;
                }
            } catch (err) {
                console.warn('[GamepadManager] Fullscreen request failed:', err);
                return false;
            }
        }

        /**
         * Polling loop invoked via requestAnimationFrame.
         */
        pollLoop() {
            if (!this.enabled) return;

            if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
                const gamepads = navigator.getGamepads();
                this.processGamepads(gamepads);
            }

            if (typeof window !== 'undefined' && window.requestAnimationFrame) {
                this.pollingRafId = window.requestAnimationFrame(this.boundPollLoop);
            }
        }

        /**
         * Processes an array-like list of Gamepad objects (pure method suitable for testing).
         * @param {Array<Gamepad>} gamepads
         */
        processGamepads(gamepads) {
            if (!gamepads) return;

            for (let i = 0; i < gamepads.length; i++) {
                const gp = gamepads[i];
                if (!gp) continue;

                this.activeGamepadIndex = gp.index;
                this.processGamepadInput(gp);
                break; // Use the primary active gamepad
            }
        }

        /**
         * Processes single gamepad buttons and axes.
         * @param {Gamepad} gp
         */
        processGamepadInput(gp) {
            const now = Date.now();
            const axes = gp.axes || [];
            const buttons = gp.buttons || [];

            // 1. Process Directional Input (D-Pad + Left Stick)
            const leftX = axes[0] !== undefined ? axes[0] : 0;
            const leftY = axes[1] !== undefined ? axes[1] : 0;

            let dirX = 0;
            let dirY = 0;

            // D-Pad checks
            const dpadUp = this.isButtonPressed(buttons[BUTTON_DPAD_UP]);
            const dpadDown = this.isButtonPressed(buttons[BUTTON_DPAD_DOWN]);
            const dpadLeft = this.isButtonPressed(buttons[BUTTON_DPAD_LEFT]);
            const dpadRight = this.isButtonPressed(buttons[BUTTON_DPAD_RIGHT]);

            if (dpadUp || leftY < -STICK_DEADZONE) dirY = -1;
            else if (dpadDown || leftY > STICK_DEADZONE) dirY = 1;

            if (dpadLeft || leftX < -STICK_DEADZONE) dirX = -1;
            else if (dpadRight || leftX > STICK_DEADZONE) dirX = 1;

            if ((dirX !== 0 || dirY !== 0) && (now - this.lastNavTime > NAVIGATION_REPEAT_DELAY_MS)) {
                this.lastNavTime = now;
                this.navigateDirection(dirX, dirY);
            }

            // 2. Process Action Buttons (Rising Edge Detection)
            this.checkButtonEdge(buttons, BUTTON_A, 'A', () => this.handleButtonA());
            this.checkButtonEdge(buttons, BUTTON_B, 'B', () => this.handleButtonB());
            this.checkButtonEdge(buttons, BUTTON_X, 'X', () => this.handleButtonX());
            this.checkButtonEdge(buttons, BUTTON_Y, 'Y', () => this.handleButtonY());
            this.checkButtonEdge(buttons, BUTTON_SELECT, 'SELECT', () => this.toggleFullscreen());
            this.checkButtonEdge(buttons, BUTTON_START, 'START', () => this.handleButtonStart());
        }

        isButtonPressed(btn) {
            if (!btn) return false;
            return typeof btn === 'object' ? btn.pressed || btn.value > 0.5 : Boolean(btn);
        }

        checkButtonEdge(buttons, btnIdx, btnName, callback) {
            const isDown = this.isButtonPressed(buttons[btnIdx]);
            const wasDown = Boolean(this.prevButtonStates[btnIdx]);

            if (isDown && !wasDown) {
                if (typeof this.onButtonPress === 'function') {
                    this.onButtonPress(btnName, btnIdx);
                }
                callback();
            }

            this.prevButtonStates[btnIdx] = isDown;
        }

        /**
         * Button A: Select / Confirm / Buzz
         */
        handleButtonA() {
            // 1. If question modal is open, check if buzzer can be pressed
            const buzzerBanner = typeof document !== 'undefined' ? document.getElementById('online-buzzer-banner') : null;
            if (buzzerBanner && buzzerBanner.style.display !== 'none') {
                const buzzerBtn = buzzerBanner.querySelector('button');
                if (buzzerBtn && !buzzerBtn.disabled) {
                    buzzerBtn.click();
                    return;
                }
            }

            // 2. If an element has focus, activate it
            if (this.focusedElement && typeof this.focusedElement.click === 'function') {
                this.focusedElement.click();
                return;
            }

            // 3. Otherwise ensure focus
            this.ensureInitialFocus();
        }

        /**
         * Button B: Back / Close modal / Return
         */
        handleButtonB() {
            if (typeof document === 'undefined') return;

            // 1. Check if Question Modal is active
            const qModal = document.getElementById('question-modal');
            if (qModal && qModal.style.display !== 'none' && qModal.classList.contains('active')) {
                // If question modal has close or continue button
                const closeBtn = qModal.querySelector('.btn-close-modal, .btn-modal-close, #btn-close-question');
                if (closeBtn) {
                    closeBtn.click();
                    return;
                }
            }

            // 2. Check if Pack Preview Modal is active
            const packPreview = document.getElementById('pack-preview-modal');
            if (packPreview && packPreview.style.display !== 'none') {
                const closeBtn = packPreview.querySelector('.btn-close-modal, button');
                if (closeBtn) {
                    closeBtn.click();
                    return;
                }
            }

            // 3. Check if Sub-screen is active (Settings, Dev, Catalog, Editor, Prepare Choice)
            const activeSub = document.querySelector('.start-menu-container > div[id^="sub-menu-"]:not([style*="display: none"])');
            if (activeSub && activeSub.id !== 'sub-menu-main') {
                const backBtn = activeSub.querySelector('.btn-close-modal, .catalog-top-back-btn, .btn-back-lobby');
                if (backBtn) {
                    backBtn.click();
                    return;
                }
            }
        }

        /**
         * Button X: Quick Action / Secondary
         */
        handleButtonX() {
            if (typeof document === 'undefined') return;

            // In Question modal with host judging: Judge Correct / +
            const btnCorrect = document.querySelector('#online-host-controls .btn-judge-correct, #question-modal .btn-correct');
            if (btnCorrect && btnCorrect.offsetParent !== null) {
                btnCorrect.click();
                return;
            }

            // In Main Menu: Toggle Theme
            if (typeof window !== 'undefined' && typeof window.toggleTheme === 'function') {
                window.toggleTheme();
            }
        }

        /**
         * Button Y: Pause / Resume countdown timer
         */
        handleButtonY() {
            if (typeof window !== 'undefined' && typeof window.toggleTimerPause === 'function') {
                window.toggleTimerPause();
                return;
            }

            // In Question modal with host judging: Judge Incorrect / -
            const btnWrong = document.querySelector('#online-host-controls .btn-judge-wrong, #question-modal .btn-wrong');
            if (btnWrong && btnWrong.offsetParent !== null) {
                btnWrong.click();
            }
        }

        /**
         * Button Start: Pause / Menu
         */
        handleButtonStart() {
            if (typeof window !== 'undefined' && typeof window.showJeopardyRules === 'function') {
                const qModal = typeof document !== 'undefined' ? document.getElementById('question-modal') : null;
                if (!qModal || qModal.style.display === 'none') {
                    window.showJeopardyRules();
                }
            }
        }

        /**
         * Navigate focus in 2D direction (dx: -1, 0, 1; dy: -1, 0, 1)
         */
        navigateDirection(dx, dy) {
            const focusables = this.getFocusableElements();
            if (focusables.length === 0) return;

            if (!this.focusedElement || !focusables.includes(this.focusedElement)) {
                this.setFocus(focusables[0]);
                return;
            }

            // Check if we are navigating the Jeopardy Game Board grid
            const currentCell = this.focusedElement.closest('.cell');
            if (currentCell) {
                const movedCell = this.navigateBoardGrid(currentCell, dx, dy);
                if (movedCell) {
                    this.setFocus(movedCell);
                    return;
                }
            }

            // Linear / Spatial navigation for general menus & modals
            const nextElem = this.findNearestSpatialElement(this.focusedElement, focusables, dx, dy);
            if (nextElem) {
                this.setFocus(nextElem);
            }
        }

        /**
         * Specialized 2D grid navigation for #game-board
         */
        navigateBoardGrid(cell, dx, dy) {
            if (typeof document === 'undefined') return null;

            const board = document.getElementById('game-board');
            if (!board) return null;

            const rows = Array.from(board.querySelectorAll('.theme-row'));
            if (rows.length === 0) return null;

            // Find current row and column index
            const currentRow = cell.closest('.theme-row');
            const rowIndex = rows.indexOf(currentRow);
            if (rowIndex === -1) return null;

            const cellsInRow = Array.from(currentRow.querySelectorAll('.cell'));
            const colIndex = cellsInRow.indexOf(cell);
            if (colIndex === -1) return null;

            let targetRowIdx = rowIndex + dy;
            let targetColIdx = colIndex + dx;

            // Wrap or clamp row
            if (targetRowIdx < 0) targetRowIdx = rows.length - 1;
            if (targetRowIdx >= rows.length) targetRowIdx = 0;

            // Target row cells
            const targetRowCells = Array.from(rows[targetRowIdx].querySelectorAll('.cell'));
            if (targetRowCells.length === 0) return null;

            // Wrap or clamp col
            if (targetColIdx < 0) targetColIdx = targetRowCells.length - 1;
            if (targetColIdx >= targetRowCells.length) targetColIdx = 0;

            return targetRowCells[targetColIdx];
        }

        /**
         * Finds nearest spatial element using bounding client rects.
         */
        findNearestSpatialElement(current, candidates, dx, dy) {
            if (typeof current.getBoundingClientRect !== 'function') {
                const idx = candidates.indexOf(current);
                const step = dy !== 0 ? dy : dx;
                const nextIdx = (idx + step + candidates.length) % candidates.length;
                return candidates[nextIdx];
            }

            const curRect = current.getBoundingClientRect();
            const curCenterX = curRect.left + curRect.width / 2;
            const curCenterY = curRect.top + curRect.height / 2;

            let bestMatch = null;
            let bestDistance = Infinity;

            for (const el of candidates) {
                if (el === current) continue;
                const rect = el.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;

                const diffX = centerX - curCenterX;
                const diffY = centerY - curCenterY;

                // Validate direction
                if (dx > 0 && diffX <= 5) continue;
                if (dx < 0 && diffX >= -5) continue;
                if (dy > 0 && diffY <= 5) continue;
                if (dy < 0 && diffY >= -5) continue;

                // Euclidean distance with penalty for off-axis deviation
                const dist = Math.hypot(diffX, diffY);
                if (dist < bestDistance) {
                    bestDistance = dist;
                    bestMatch = el;
                }
            }

            // Fallback to sequential index if no spatial match in that direction
            if (!bestMatch) {
                const idx = candidates.indexOf(current);
                const step = (dx !== 0 ? dx : dy) > 0 ? 1 : -1;
                const nextIdx = (idx + step + candidates.length) % candidates.length;
                bestMatch = candidates[nextIdx];
            }

            return bestMatch;
        }

        /**
         * Collects currently visible, interactive elements.
         */
        getFocusableElements() {
            if (typeof document === 'undefined') return [];

            // 1. If Question Modal is active, focus within it
            const qModal = document.getElementById('question-modal');
            if (qModal && qModal.style.display !== 'none' && qModal.classList.contains('active')) {
                return Array.from(qModal.querySelectorAll('button:not([disabled]), input:not([disabled])'))
                    .filter(el => el.offsetParent !== null);
            }

            // 2. If Turn Order or Cat / Auction modal active
            const activeModal = document.querySelector('.modal[style*="display: block"], .modal.active');
            if (activeModal) {
                return Array.from(activeModal.querySelectorAll('button:not([disabled]), input:not([disabled])'))
                    .filter(el => el.offsetParent !== null);
            }

            // 3. If Game Board is active
            const gameBoard = document.getElementById('game-board');
            if (gameBoard && gameBoard.offsetParent !== null && !gameBoard.classList.contains('hidden')) {
                // Focus available unplayed cells
                const activeCells = Array.from(gameBoard.querySelectorAll('.cell:not(.used)'));
                if (activeCells.length > 0) return activeCells;
            }

            // 4. If Online Lobby is active
            const onlineLobby = document.getElementById('sub-menu-online-lobby');
            if (onlineLobby && onlineLobby.style.display !== 'none') {
                return Array.from(onlineLobby.querySelectorAll('button:not([disabled]), input:not([disabled])'))
                    .filter(el => el.offsetParent !== null);
            }

            // 5. Default to visible buttons in active menu screen
            const activeScreen = document.querySelector('.screen.active') || document.body;
            return Array.from(activeScreen.querySelectorAll('button:not([disabled]), .cell:not(.used), input:not([disabled])'))
                .filter(el => el.offsetParent !== null);
        }

        /**
         * Sets focus on an element and applies .gamepad-focused visual ring
         */
        setFocus(element) {
            if (!element) return;

            this.clearFocus();
            this.focusedElement = element;
            element.classList.add('gamepad-focused');

            if (typeof element.focus === 'function') {
                element.focus();
            }

            if (typeof element.scrollIntoView === 'function') {
                element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            }
        }

        clearFocus() {
            if (this.focusedElement) {
                this.focusedElement.classList.remove('gamepad-focused');
                this.focusedElement = null;
            }
            if (typeof document !== 'undefined') {
                const prev = document.querySelectorAll('.gamepad-focused');
                prev.forEach(el => el.classList.remove('gamepad-focused'));
            }
        }

        ensureInitialFocus() {
            const elements = this.getFocusableElements();
            if (elements.length > 0 && (!this.focusedElement || !elements.includes(this.focusedElement))) {
                this.setFocus(elements[0]);
            }
        }

        /**
         * Displays on-screen HUD toast notification (e.g. for gamepad connected / fullscreen)
         */
        showToast(message, durationMs = 2800) {
            if (typeof document === 'undefined') return;

            let toast = document.getElementById('gamepad-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'gamepad-toast';
                toast.className = 'gamepad-toast';
                document.body.appendChild(toast);
            }

            toast.textContent = message;
            toast.style.display = 'block';
            toast.classList.add('show');

            if (this.toastTimer) clearTimeout(this.toastTimer);
            this.toastTimer = setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => {
                    if (!toast.classList.contains('show')) toast.style.display = 'none';
                }, 300);
            }, durationMs);
        }
    }

    return GamepadManager;
}));
