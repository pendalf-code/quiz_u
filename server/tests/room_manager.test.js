const test = require('node:test');
const assert = require('node:assert/strict');
const RoomManager = require('../src/RoomManager');

test('Server: RoomManager Tests', async (t) => {
    let rm;

    t.beforeEach(() => {
        rm = new RoomManager();
    });

    t.afterEach(() => {
        if (rm) {
            rm.destroy();
        }
    });

    await t.test('generates valid 4-character uppercase alphanumeric codes without confusing letters', () => {
        const code = rm.generateUniqueRoomCode();
        assert.equal(typeof code, 'string');
        assert.equal(code.length, 4);
        assert.match(code, /^[A-Z0-9]{4}$/);
        // Ensure no 0, O, 1, I, L
        assert.equal(/[0O1IL]/.test(code), false, 'Room code must not contain 0, O, 1, I, L');
    });

    await t.test('creates, retrieves and deletes rooms correctly', () => {
        const mockHostWs = { send: () => {}, readyState: 1 };
        const room = rm.createRoom(mockHostWs, { maxPlayers: 6 });

        assert.ok(room);
        assert.equal(typeof room.code, 'string');
        assert.equal(room.options.maxPlayers, 6);

        // Case-insensitive retrieval
        const foundUpper = rm.getRoom(room.code);
        const foundLower = rm.getRoom(room.code.toLowerCase());
        assert.equal(foundUpper, room);
        assert.equal(foundLower, room);

        // Stats
        const statsBefore = rm.getStats();
        assert.equal(statsBefore.totalRooms, 1);

        // Deletion
        const deleted = rm.deleteRoom(room.code);
        assert.equal(deleted, true);
        assert.equal(rm.getRoom(room.code), null);
        assert.equal(rm.getStats().totalRooms, 0);
    });

    await t.test('cleans up inactive rooms based on timeout', () => {
        const mockWs = { send: () => {}, readyState: 1 };
        const room1 = rm.createRoom(mockWs);
        const room2 = rm.createRoom(mockWs);

        // Artificially age room1
        room1.lastActivityAt = Date.now() - (20 * 60 * 1000); // 20 mins ago
        room2.lastActivityAt = Date.now(); // active now

        const cleaned = rm.cleanupInactiveRooms(15 * 60 * 1000);
        assert.equal(cleaned, 1);
        assert.equal(rm.getRoom(room1.code), null);
        assert.equal(rm.getRoom(room2.code), room2);
    });
});
