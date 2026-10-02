/**
 * Quiz U - Room Manager
 */

const Room = require('./Room');

// Alphabet without easily confused characters (no 0, O, 1, I, L)
const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const ROOM_CODE_LENGTH = 4;
const DEFAULT_INACTIVE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

class RoomManager {
    constructor() {
        this.rooms = new Map(); // roomCode (uppercase) -> Room instance
        this.cleanupInterval = setInterval(() => {
            this.cleanupInactiveRooms();
        }, 60 * 1000); // Check every minute
        if (this.cleanupInterval.unref) {
            this.cleanupInterval.unref();
        }
    }

    generateUniqueRoomCode() {
        const maxAttempts = 1000;
        for (let i = 0; i < maxAttempts; i++) {
            let code = '';
            for (let j = 0; j < ROOM_CODE_LENGTH; j++) {
                const randIdx = Math.floor(Math.random() * ROOM_CODE_CHARS.length);
                code += ROOM_CODE_CHARS[randIdx];
            }
            if (!this.rooms.has(code)) {
                return code;
            }
        }
        throw new Error('Failed to generate unique room code. Pool might be exhausted.');
    }

    createRoom(hostWs, options = {}) {
        const code = this.generateUniqueRoomCode();
        const room = new Room(code, hostWs, options);
        this.rooms.set(code, room);
        return room;
    }

    getRoom(code) {
        if (!code || typeof code !== 'string') return null;
        return this.rooms.get(code.toUpperCase().trim()) || null;
    }

    deleteRoom(code) {
        if (!code || typeof code !== 'string') return false;
        const normalized = code.toUpperCase().trim();
        const room = this.rooms.get(normalized);
        if (room) {
            room.destroy();
            this.rooms.delete(normalized);
            return true;
        }
        return false;
    }

    cleanupInactiveRooms(maxInactiveMs = DEFAULT_INACTIVE_TIMEOUT_MS) {
        const now = Date.now();
        let cleanedCount = 0;
        for (const [code, room] of this.rooms.entries()) {
            if (now - room.lastActivityAt > maxInactiveMs) {
                room.destroy();
                this.rooms.delete(code);
                cleanedCount++;
            }
        }
        return cleanedCount;
    }

    getStats() {
        let totalPlayers = 0;
        let activePlayers = 0;
        for (const room of this.rooms.values()) {
            totalPlayers += room.players.size;
            for (const p of room.players.values()) {
                if (p.isConnected) activePlayers++;
            }
        }
        return {
            totalRooms: this.rooms.size,
            totalPlayers,
            activePlayers
        };
    }

    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        for (const room of this.rooms.values()) {
            room.destroy();
        }
        this.rooms.clear();
    }
}

module.exports = RoomManager;
