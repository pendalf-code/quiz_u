const { describe, it } = require('node:test');
const assert = require('node:assert');
const GamepadManager = require('../js/desktop/GamepadManager.js');

describe('Gamepad & Steam Deck Navigation Tests (Stage 5.2)', () => {
    it('initializes GamepadManager with default state and enables polling', () => {
        const gm = new GamepadManager({ enabled: true });
        assert.strictEqual(gm.enabled, true);
        assert.strictEqual(gm.focusedElement, null);
        assert.strictEqual(gm.activeGamepadIndex, null);
    });

    it('filters analog stick values within deadzone (< 0.45)', () => {
        const gm = new GamepadManager();
        let navigated = false;
        gm.navigateDirection = () => { navigated = true; };

        // Test stick values within deadzone: 0.2 and -0.3
        const fakeGamepadSubDeadzone = {
            index: 0,
            axes: [0.25, -0.3],
            buttons: new Array(16).fill({ pressed: false, value: 0 })
        };

        gm.processGamepadInput(fakeGamepadSubDeadzone);
        assert.strictEqual(navigated, false, 'Stick values below 0.45 deadzone must not trigger navigation');
    });

    it('triggers navigation when analog stick exceeds deadzone (> 0.45)', () => {
        const gm = new GamepadManager();
        let capturedDir = null;
        gm.navigateDirection = (dx, dy) => { capturedDir = { dx, dy }; };

        const fakeGamepadX = {
            index: 0,
            axes: [0.85, 0],
            buttons: new Array(16).fill({ pressed: false, value: 0 })
        };

        gm.processGamepadInput(fakeGamepadX);
        assert.deepStrictEqual(capturedDir, { dx: 1, dy: 0 }, 'Right stick tilt must trigger dx: 1');

        // Allow debounce time
        gm.lastNavTime = 0;
        const fakeGamepadY = {
            index: 0,
            axes: [0, -0.9],
            buttons: new Array(16).fill({ pressed: false, value: 0 })
        };

        gm.processGamepadInput(fakeGamepadY);
        assert.deepStrictEqual(capturedDir, { dx: 0, dy: -1 }, 'Up stick tilt must trigger dy: -1');
    });

    it('processes D-Pad buttons (Up: 12, Down: 13, Left: 14, Right: 15)', () => {
        const gm = new GamepadManager();
        let capturedDir = null;
        gm.navigateDirection = (dx, dy) => { capturedDir = { dx, dy }; };

        function makeButtonsWith(pressedIdx) {
            const btns = new Array(16).fill(null).map(() => ({ pressed: false, value: 0 }));
            if (pressedIdx !== null) btns[pressedIdx] = { pressed: true, value: 1.0 };
            return btns;
        }

        // Test D-Pad Down (13)
        gm.lastNavTime = 0;
        gm.processGamepadInput({ index: 0, axes: [0, 0], buttons: makeButtonsWith(13) });
        assert.deepStrictEqual(capturedDir, { dx: 0, dy: 1 }, 'D-Pad Down must trigger dy: 1');

        // Test D-Pad Left (14)
        gm.lastNavTime = 0;
        gm.processGamepadInput({ index: 0, axes: [0, 0], buttons: makeButtonsWith(14) });
        assert.deepStrictEqual(capturedDir, { dx: -1, dy: 0 }, 'D-Pad Left must trigger dx: -1');
    });

    it('detects button rising edges and dispatches callbacks for A, B, X, Y', () => {
        const pressedButtons = [];
        const gm = new GamepadManager({
            onButtonPress: (name, idx) => pressedButtons.push({ name, idx })
        });

        // Mock action handlers
        let aCalled = false, bCalled = false, xCalled = false, yCalled = false;
        gm.handleButtonA = () => { aCalled = true; };
        gm.handleButtonB = () => { bCalled = true; };
        gm.handleButtonX = () => { xCalled = true; };
        gm.handleButtonY = () => { yCalled = true; };

        function makeButtons(activeIndices) {
            return new Array(16).fill(null).map((_, i) => ({
                pressed: activeIndices.includes(i),
                value: activeIndices.includes(i) ? 1.0 : 0
            }));
        }

        // Press A (0)
        gm.processGamepadInput({ index: 0, axes: [0, 0], buttons: makeButtons([0]) });
        assert.strictEqual(aCalled, true);
        assert.ok(pressedButtons.some(b => b.name === 'A' && b.idx === 0));

        // Holding A does not trigger a second rising edge
        aCalled = false;
        gm.processGamepadInput({ index: 0, axes: [0, 0], buttons: makeButtons([0]) });
        assert.strictEqual(aCalled, false, 'Holding button down must not re-trigger rising edge');

        // Release A, press B (1) and Y (3)
        gm.processGamepadInput({ index: 0, axes: [0, 0], buttons: makeButtons([1, 3]) });
        assert.strictEqual(bCalled, true);
        assert.strictEqual(yCalled, true);
        assert.ok(pressedButtons.some(b => b.name === 'B' && b.idx === 1));
        assert.ok(pressedButtons.some(b => b.name === 'Y' && b.idx === 3));
    });

    it('navigates 2D board grid correctly across rows and columns', () => {
        const gm = new GamepadManager();

        // Create a simulated 3x5 grid in fake DOM
        const rows = [];
        for (let r = 0; r < 3; r++) {
            const cells = [];
            const rowElem = {
                className: 'theme-row',
                querySelectorAll: (sel) => sel === '.cell' ? cells : []
            };
            for (let c = 0; c < 5; c++) {
                const cellElem = {
                    r, c,
                    className: 'cell',
                    closest: (sel) => sel === '.theme-row' ? rowElem : (sel === '.cell' ? cellElem : null)
                };
                cells.push(cellElem);
            }
            rows.push(rowElem);
        }

        const fakeBoard = {
            querySelectorAll: (sel) => sel === '.theme-row' ? rows : []
        };

        // Temporarily provide global document mock
        const origDoc = global.document;
        global.document = {
            getElementById: (id) => id === 'game-board' ? fakeBoard : null
        };

        try {
            const startCell = rows[1].querySelectorAll('.cell')[2]; // row 1, col 2

            // Move Right (dx: 1, dy: 0) -> row 1, col 3
            const rightCell = gm.navigateBoardGrid(startCell, 1, 0);
            assert.strictEqual(rightCell.r, 1);
            assert.strictEqual(rightCell.c, 3);

            // Move Down (dx: 0, dy: 1) -> row 2, col 2
            const downCell = gm.navigateBoardGrid(startCell, 0, 1);
            assert.strictEqual(downCell.r, 2);
            assert.strictEqual(downCell.c, 2);

            // Wrap Up from top row (r: 0 -> r: 2)
            const topCell = rows[0].querySelectorAll('.cell')[1];
            const wrapUpCell = gm.navigateBoardGrid(topCell, 0, -1);
            assert.strictEqual(wrapUpCell.r, 2);
            assert.strictEqual(wrapUpCell.c, 1);

            // Wrap Left from col 0 -> col 4
            const leftMostCell = rows[0].querySelectorAll('.cell')[0];
            const wrapLeftCell = gm.navigateBoardGrid(leftMostCell, -1, 0);
            assert.strictEqual(wrapLeftCell.r, 0);
            assert.strictEqual(wrapLeftCell.c, 4);
        } finally {
            global.document = origDoc;
        }
    });

    it('sets and clears focus with .gamepad-focused class', () => {
        const gm = new GamepadManager();
        const classes = new Set();
        const fakeElem = {
            classList: {
                add: (cls) => classes.add(cls),
                remove: (cls) => classes.delete(cls),
                contains: (cls) => classes.has(cls)
            },
            focus: () => {},
            scrollIntoView: () => {}
        };

        gm.setFocus(fakeElem);
        assert.strictEqual(gm.focusedElement, fakeElem);
        assert.strictEqual(classes.has('gamepad-focused'), true);

        gm.clearFocus();
        assert.strictEqual(gm.focusedElement, null);
        assert.strictEqual(classes.has('gamepad-focused'), false);
    });

    it('navigates board using .question-cost elements as created by game.js', () => {
        const gm = new GamepadManager();
        const rows = [];
        for (let r = 0; r < 2; r++) {
            const cells = [];
            const rowElem = {
                className: 'theme-row',
                querySelectorAll: (sel) => (sel.includes('.question-cost') || sel === '.question-cost') ? cells : []
            };
            for (let c = 0; c < 3; c++) {
                const cellElem = {
                    r, c,
                    className: 'question-cost cell',
                    closest: (sel) => sel === '.theme-row' ? rowElem : (sel.includes('.question-cost') || sel.includes('.cell') ? cellElem : null)
                };
                cells.push(cellElem);
            }
            rows.push(rowElem);
        }

        const fakeBoard = {
            querySelectorAll: (sel) => sel === '.theme-row' ? rows : []
        };

        const origDoc = global.document;
        global.document = {
            getElementById: (id) => id === 'game-board' ? fakeBoard : null
        };

        try {
            const startCell = rows[0].querySelectorAll('.question-cost')[1]; // row 0, col 1
            const movedRight = gm.navigateBoardGrid(startCell, 1, 0);
            assert.strictEqual(movedRight.r, 0);
            assert.strictEqual(movedRight.c, 2);

            const movedDown = gm.navigateBoardGrid(startCell, 0, 1);
            assert.strictEqual(movedDown.r, 1);
            assert.strictEqual(movedDown.c, 1);
        } finally {
            global.document = origDoc;
        }
    });

    it('handleButtonY prioritizes host judging incorrect button over timer pause', () => {
        const gm = new GamepadManager();
        let wrongClicked = false;
        let timerPaused = false;

        const fakeBtnWrong = {
            offsetParent: {},
            style: { display: 'inline-block' },
            click: () => { wrongClicked = true; }
        };

        const origDoc = global.document;
        const origWindow = global.window;
        global.document = {
            querySelector: (sel) => sel.includes('btn-judge-wrong') ? fakeBtnWrong : null
        };
        global.window = {
            toggleTimerPause: () => { timerPaused = true; }
        };

        try {
            gm.handleButtonY();
            assert.strictEqual(wrongClicked, true, 'Must click host judging button when present');
            assert.strictEqual(timerPaused, false, 'Must not toggle timer pause when judging button is active');

            // Now when judging button is absent, fallback to timer pause
            wrongClicked = false;
            global.document.querySelector = () => null;
            gm.handleButtonY();
            assert.strictEqual(wrongClicked, false);
            assert.strictEqual(timerPaused, true, 'Must fallback to timer pause when judging is not active');
        } finally {
            global.document = origDoc;
            global.window = origWindow;
        }
    });
});
