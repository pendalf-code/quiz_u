/**
 * Quiz U - Network Protocol Definitions & Message Types (Client & Server)
 */

const MSG_TYPES = {
    // Host -> Server
    HOST_CREATE_ROOM: 'HOST_CREATE_ROOM',
    HOST_SET_PACK: 'HOST_SET_PACK',
    HOST_START_GAME: 'HOST_START_GAME',
    HOST_SELECT_QUESTION: 'HOST_SELECT_QUESTION',
    HOST_ACTIVATE_BUZZER: 'HOST_ACTIVATE_BUZZER',
    HOST_JUDGE_ANSWER: 'HOST_JUDGE_ANSWER',
    HOST_PASS_QUESTION: 'HOST_PASS_QUESTION',
    HOST_UPDATE_SCORE: 'HOST_UPDATE_SCORE',
    HOST_KICK_PLAYER: 'HOST_KICK_PLAYER',
    HOST_NEXT_ROUND: 'HOST_NEXT_ROUND',

    // Player -> Server
    PLAYER_JOIN: 'PLAYER_JOIN',
    PLAYER_BUZZ: 'PLAYER_BUZZ',
    PLAYER_SUBMIT_ANSWER: 'PLAYER_SUBMIT_ANSWER',
    PLAYER_AUCTION_BET: 'PLAYER_AUCTION_BET',
    PLAYER_CAT_TRANSFER: 'PLAYER_CAT_TRANSFER',

    // Server -> Client(s)
    ROOM_CREATED: 'ROOM_CREATED',
    PLAYER_JOINED: 'PLAYER_JOINED',
    PLAYER_LEFT: 'PLAYER_LEFT',
    ROOM_STATE: 'ROOM_STATE',
    QUESTION_ACTIVE: 'QUESTION_ACTIVE',
    BUZZER_READY: 'BUZZER_READY',
    BUZZ_LOCKED: 'BUZZ_LOCKED',
    BUZZ_RESET: 'BUZZ_RESET',
    ANSWER_SUBMITTED: 'ANSWER_SUBMITTED',
    AUCTION_BET_MADE: 'AUCTION_BET_MADE',
    CAT_TRANSFERRED: 'CAT_TRANSFERRED',
    ANSWER_TIMEOUT: 'ANSWER_TIMEOUT',
    ROUND_CHANGED: 'ROUND_CHANGED',
    GAME_FINISHED: 'GAME_FINISHED',
    SCORE_UPDATED: 'SCORE_UPDATED',
    ERROR: 'ERROR',

    // System
    PING: 'PING',
    PONG: 'PONG'
};

const ERROR_CODES = {
    ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
    ROOM_FULL: 'ROOM_FULL',
    GAME_ALREADY_STARTED: 'GAME_ALREADY_STARTED',
    NAME_ALREADY_TAKEN: 'NAME_ALREADY_TAKEN',
    INVALID_ACTION: 'INVALID_ACTION',
    NOT_AUTHORIZED: 'NOT_AUTHORIZED',
    INVALID_PAYLOAD: 'INVALID_PAYLOAD'
};

function createMessage(type, payload = {}) {
    return JSON.stringify({
        type,
        payload,
        timestamp: Date.now()
    });
}

function parseMessage(rawMessage) {
    try {
        const parsed = JSON.parse(rawMessage);
        if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

const QuizProtocol = {
    MSG_TYPES,
    ERROR_CODES,
    createMessage,
    parseMessage
};

if (typeof window !== 'undefined') {
    window.QuizProtocol = QuizProtocol;
    window.MSG_TYPES = MSG_TYPES;
    window.ERROR_CODES = ERROR_CODES;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = QuizProtocol;
}
