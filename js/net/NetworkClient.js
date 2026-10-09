/**
 * Quiz U - NetworkClient
 * Manages host and client WebSocket communication with the room server.
 */

// Universal protocol resolution (Browser, Web Worker, globalThis, Node.js CommonJS)
const Protocol = (typeof QuizProtocol !== 'undefined' && QuizProtocol)
    ? QuizProtocol
    : (typeof window !== 'undefined' && (window.QuizProtocol || window.Protocol))
        ? (window.QuizProtocol || window.Protocol)
        : (typeof globalThis !== 'undefined' && (globalThis.QuizProtocol || globalThis.Protocol))
            ? (globalThis.QuizProtocol || globalThis.Protocol)
            : (typeof require !== 'undefined' ? require('./Protocol') : null);

// Fallback message types dictionary to guarantee type safety in case of loading order
const DEFAULT_MSG_TYPES = {
    HOST_CREATE_ROOM: 'HOST_CREATE_ROOM',
    HOST_SET_PACK: 'HOST_SET_PACK',
    HOST_START_GAME: 'HOST_START_GAME',
    HOST_SELECT_QUESTION: 'HOST_SELECT_QUESTION',
    HOST_ACTIVATE_BUZZER: 'HOST_ACTIVATE_BUZZER',
    HOST_JUDGE_ANSWER: 'HOST_JUDGE_ANSWER',
    HOST_SHOW_ANSWER: 'HOST_SHOW_ANSWER',
    HOST_TOGGLE_PAUSE: 'HOST_TOGGLE_PAUSE',
    HOST_CLOSE_QUESTION: 'HOST_CLOSE_QUESTION',
    HOST_PASS_QUESTION: 'HOST_PASS_QUESTION',
    HOST_UPDATE_SCORE: 'HOST_UPDATE_SCORE',
    HOST_KICK_PLAYER: 'HOST_KICK_PLAYER',
    HOST_NEXT_ROUND: 'HOST_NEXT_ROUND',
    HOST_SET_LOCAL_HOST: 'HOST_SET_LOCAL_HOST',
    HOST_UPDATE_ROOM_SETTINGS: 'HOST_UPDATE_ROOM_SETTINGS',
    HOST_SET_CAT_TARGET: 'HOST_SET_CAT_TARGET',
    HOST_SET_AUCTION_LEADER: 'HOST_SET_AUCTION_LEADER',
    HOST_SET_AUCTION_BETS: 'HOST_SET_AUCTION_BETS',
    HOST_START_AUCTION_ANSWER: 'HOST_START_AUCTION_ANSWER',
    PLAYER_JOIN: 'PLAYER_JOIN',
    PLAYER_BUZZ: 'PLAYER_BUZZ',
    PLAYER_SUBMIT_ANSWER: 'PLAYER_SUBMIT_ANSWER',
    PLAYER_AUCTION_BET: 'PLAYER_AUCTION_BET',
    PLAYER_CAT_TRANSFER: 'PLAYER_CAT_TRANSFER',
    ROOM_CREATED: 'ROOM_CREATED',
    PLAYER_JOINED: 'PLAYER_JOINED',
    PLAYER_LEFT: 'PLAYER_LEFT',
    PLAYER_KICKED: 'PLAYER_KICKED',
    ROOM_STATE: 'ROOM_STATE',
    ROOM_SETTINGS_UPDATED: 'ROOM_SETTINGS_UPDATED',
    QUESTION_ACTIVE: 'QUESTION_ACTIVE',
    BUZZER_READY: 'BUZZER_READY',
    BUZZ_LOCKED: 'BUZZ_LOCKED',
    BUZZ_RESET: 'BUZZ_RESET',
    ANSWER_SUBMITTED: 'ANSWER_SUBMITTED',
    AUCTION_BET_MADE: 'AUCTION_BET_MADE',
    AUCTION_ANSWER_START: 'AUCTION_ANSWER_START',
    CAT_TRANSFERRED: 'CAT_TRANSFERRED',
    ANSWER_TIMEOUT: 'ANSWER_TIMEOUT',
    ROUND_CHANGED: 'ROUND_CHANGED',
    GAME_FINISHED: 'GAME_FINISHED',
    SCORE_UPDATED: 'SCORE_UPDATED',
    JUDGE_RESULT: 'JUDGE_RESULT',
    GAME_PAUSED: 'GAME_PAUSED',
    SHOW_ANSWER: 'SHOW_ANSWER',
    QUESTION_CLOSED: 'QUESTION_CLOSED',
    ERROR: 'ERROR'
};

const MSG = (Protocol && Protocol.MSG_TYPES) ? Protocol.MSG_TYPES : (typeof MSG_TYPES !== 'undefined' ? MSG_TYPES : DEFAULT_MSG_TYPES);
const ERR = (Protocol && Protocol.ERROR_CODES) ? Protocol.ERROR_CODES : (typeof ERROR_CODES !== 'undefined' ? ERROR_CODES : {});

class NetworkClient {
    constructor(options = {}) {
        this.url = options.url || null;
        this.ws = null;
        this.WebSocketClass = options.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);
        this.connectionTimeoutMs = (typeof options.connectionTimeoutMs === 'number') ? options.connectionTimeoutMs : 4000;
        this.roomCode = null;
        this.hostToken = null;
        this.isHost = options.isHost !== false;
        this.role = options.role || (this.isHost ? 'host' : 'player');
        this.isConnected = false;
        this.selfPlayer = null;
        this.connectedHost = null;
        this.hasHost = false;
        this.isHostOnPC = false;
        this.canStartGame = false;
        this.sessionToken = options.sessionToken || null;
        this.listeners = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
        this.autoReconnect = options.autoReconnect !== false;
        this.reconnectTimer = null;
        this.lastState = null;
        this.connectedPlayers = new Map(); // id -> player
    }

    /**
     * Event subscription
     */
    on(event, handler) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(handler);
        return () => this.off(event, handler);
    }

    off(event, handler) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(handler);
        }
    }

    emit(event, data) {
        if (this.listeners.has(event)) {
            for (const handler of this.listeners.get(event)) {
                try {
                    handler(data);
                } catch (err) {
                    console.error(`Error in NetworkClient listener for "${event}":`, err);
                }
            }
        }
    }

    /**
     * Connection management
     */
    connect(url = null) {
        if (url) this.url = url;
        if (!this.url) {
            return Promise.reject(new Error('WebSocket URL is required'));
        }

        if (this.isConnected && this.ws && this.ws.readyState === 1) {
            return Promise.resolve(this);
        }

        return new Promise((resolve, reject) => {
            let settled = false;
            let connectTimer = null;

            const clearTimer = () => {
                if (connectTimer) {
                    clearTimeout(connectTimer);
                    connectTimer = null;
                }
            };

            if (this.connectionTimeoutMs > 0) {
                connectTimer = setTimeout(() => {
                    if (!settled) {
                        settled = true;
                        if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 2)) {
                            try {
                                this.ws.close();
                            } catch (_) {}
                        }
                        const timeoutErr = new Error(`Connection timeout (${this.url})`);
                        this.emit('error', timeoutErr);
                        reject(timeoutErr);
                    }
                }, this.connectionTimeoutMs);
            }

            try {
                this.ws = new this.WebSocketClass(this.url);
            } catch (err) {
                clearTimer();
                return reject(err);
            }

            this.ws.onopen = () => {
                clearTimer();
                this.isConnected = true;
                this.reconnectAttempts = 0;
                if (!settled) {
                    settled = true;
                    resolve(this);
                }
                this.emit('connected', { url: this.url });
            };

            this.ws.onmessage = (event) => {
                const message = (Protocol && Protocol.parseMessage)
                    ? Protocol.parseMessage(event.data)
                    : JSON.parse(event.data);
                if (message) {
                    this._handleMessage(message);
                }
            };

            this.ws.onerror = (err) => {
                clearTimer();
                this.emit('error', err);
                if (!settled) {
                    settled = true;
                    reject(err);
                }
            };

            this.ws.onclose = (event) => {
                clearTimer();
                this.isConnected = false;
                this.emit('disconnected', { code: event.code, reason: event.reason });
                if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this._scheduleReconnect();
                }
            };
        });
    }

    _scheduleReconnect() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
        this.reconnectTimer = setTimeout(() => {
            if (!this.isConnected && this.url) {
                this.connect(this.url).catch(() => {});
            }
        }, delay);
    }

    /**
     * Internal message dispatcher
     */
    _handleMessage(message) {
        const { type, payload } = message;

        switch (type) {
            case MSG.ROOM_CREATED:
                this.roomCode = payload.roomCode;
                this.hostToken = payload.hostToken;
                this.lastState = payload.state;
                this._syncPlayersFromState(payload.state);
                this.emit('room_created', payload);
                break;

            case MSG.PLAYER_JOINED:
                if (payload.player) {
                    if (payload.role === 'host' || payload.player.role === 'host') {
                        this.connectedHost = payload.player;
                        this.hasHost = true;
                    }
                    this.connectedPlayers.set(payload.player.id, payload.player);
                }
                this.emit('player_joined', payload);
                break;

            case MSG.PLAYER_LEFT:
                if (payload.playerId) {
                    const existing = this.connectedPlayers.get(payload.playerId);
                    if (existing) {
                        existing.isConnected = false;
                    }
                    if (this.connectedHost && this.connectedHost.id === payload.playerId) {
                        this.connectedHost.isConnected = false;
                        this.hasHost = Boolean(this.isHostOnPC);
                    }
                }
                this.emit('player_left', payload);
                break;

            case MSG.PLAYER_KICKED:
                if (payload && payload.playerId) {
                    const existing = this.connectedPlayers.get(payload.playerId);
                    if (existing) {
                        existing.isConnected = false;
                    }
                    if (this.connectedHost && this.connectedHost.id === payload.playerId) {
                        this.connectedHost.isConnected = false;
                        this.hasHost = Boolean(this.isHostOnPC);
                    }
                }
                this.emit('player_kicked', payload);
                break;

            case MSG.ROOM_SETTINGS_UPDATED:
                if (this.lastState && payload && payload.options) {
                    this.lastState.options = payload.options;
                }
                this.emit('room_settings_updated', payload);
                break;

            case MSG.ROOM_STATE:
                this.lastState = payload;
                this._syncPlayersFromState(payload);
                if (payload.isHostOnPC !== undefined) {
                    this.isHostOnPC = Boolean(payload.isHostOnPC);
                }
                if (payload.self) {
                    this.selfPlayer = payload.self;
                }
                if (payload.sessionToken) {
                    this.sessionToken = payload.sessionToken;
                }
                if (payload.role) {
                    this.role = payload.role;
                }
                this.emit('room_state', payload);
                break;

            case MSG.QUESTION_ACTIVE:
                this.emit('question_active', payload);
                break;

            case MSG.BUZZER_READY:
                this.emit('buzzer_ready', payload);
                break;

            case MSG.BUZZ_LOCKED:
                this.emit('buzz_locked', payload);
                break;

            case MSG.ANSWER_SUBMITTED:
                this.emit('answer_submitted', payload);
                break;

            case MSG.AUCTION_BET_MADE:
                this.emit('auction_bet_made', payload);
                break;

            case MSG.AUCTION_ANSWER_START:
                this.emit('auction_answer_start', payload);
                break;

            case MSG.CAT_TRANSFERRED:
                this.emit('cat_transferred', payload);
                break;

            case MSG.ANSWER_TIMEOUT:
                this.emit('answer_timeout', payload);
                break;

            case MSG.SCORE_UPDATED:
                if (payload.players && Array.isArray(payload.players)) {
                    this.connectedPlayers.clear();
                    for (const p of payload.players) {
                        this.connectedPlayers.set(p.id, p);
                    }
                } else if (payload.playerId && this.connectedPlayers.has(payload.playerId)) {
                    this.connectedPlayers.get(payload.playerId).score = payload.newScore;
                }
                if (this.selfPlayer && payload.playerId === this.selfPlayer.id) {
                    this.selfPlayer.score = payload.newScore;
                }
                this.emit('score_updated', payload);
                break;

            case MSG.JUDGE_RESULT:
                this.emit('judge_result', payload);
                break;

            case MSG.GAME_PAUSED:
                this.emit('game_paused', payload);
                break;

            case MSG.SHOW_ANSWER:
                this.emit('show_answer', payload);
                break;

            case MSG.QUESTION_CLOSED:
                this.emit('question_closed', payload);
                break;

            case MSG.ROUND_SKIPPED:
                this.emit('round_skipped', payload);
                break;

            case MSG.TURN_PASSED:
                this.emit('turn_passed', payload);
                break;

            case MSG.GAME_FINISHED:
                this.emit('game_finished', payload);
                break;

            case MSG.ERROR:
                this.emit('server_error', payload);
                break;

            default:
                this.emit('message', message);
                break;
        }
    }

    _syncPlayersFromState(state) {
        if (!state) return;
        if (state.isHostOnPC !== undefined) this.isHostOnPC = Boolean(state.isHostOnPC);
        if (state.hasHost !== undefined) this.hasHost = Boolean(state.hasHost);
        if (state.canStartGame !== undefined) this.canStartGame = Boolean(state.canStartGame);

        if (state.host) {
            this.connectedHost = state.host;
            if (state.host.isConnected && (state.host.id !== 'host_pc' || this.isHostOnPC)) {
                this.connectedPlayers.set(state.host.id, state.host);
                this.hasHost = true;
            } else {
                this.connectedPlayers.delete(state.host.id);
                if (state.host.id === 'host_pc') {
                    this.connectedHost = null;
                }
                this.hasHost = Boolean(this.isHostOnPC);
            }
        } else if (state.host === null) {
            this.connectedHost = null;
            this.connectedPlayers.delete('host_pc');
            if (!this.isHostOnPC) this.hasHost = false;
        }

        if (!this.isHostOnPC) {
            this.connectedPlayers.delete('host_pc');
            if (this.connectedHost && this.connectedHost.id === 'host_pc') {
                this.connectedHost = null;
            }
        }

        if (Array.isArray(state.players)) {
            for (const p of state.players) {
                this.connectedPlayers.set(p.id, p);
            }
        }
    }

    send(type, payload = {}) {
        if (!this.ws || this.ws.readyState !== 1) {
            console.warn(`Cannot send message "${type}": WebSocket is not OPEN`);
            return false;
        }
        const data = (Protocol && Protocol.createMessage)
            ? Protocol.createMessage(type, payload)
            : JSON.stringify({ type, payload, timestamp: Date.now() });
        this.ws.send(data);
        return true;
    }

    /**
     * Host Actions
     */
    createRoom(options = {}) {
        return this.send(MSG.HOST_CREATE_ROOM, { options });
    }

    setPack(pack) {
        return this.send(MSG.HOST_SET_PACK, { pack });
    }

    updateRoomSettings(settings) {
        if (this.lastState && settings) {
            this.lastState.options = { ...(this.lastState.options || {}), ...settings };
        }
        return this.send(MSG.HOST_UPDATE_ROOM_SETTINGS, { settings });
    }

    setLocalHost(isHostOnPC) {
        this.isHostOnPC = Boolean(isHostOnPC);
        if (this.isHostOnPC) {
            this.hasHost = true;
            const pcHost = { id: 'host_pc', name: 'Ведущий (ПК)', role: 'host', isConnected: true };
            this.connectedHost = pcHost;
            this.connectedPlayers.set('host_pc', pcHost);
        } else {
            this.connectedPlayers.delete('host_pc');
            if (this.connectedHost && this.connectedHost.id === 'host_pc') {
                this.connectedHost = null;
            }
            const activeMobileHost = Array.from(this.connectedPlayers.values()).find(p => p.role === 'host' && p.isConnected && p.id !== 'host_pc');
            this.hasHost = Boolean(activeMobileHost || (this.connectedHost && this.connectedHost.isConnected && this.connectedHost.id !== 'host_pc'));
        }
        return this.send(MSG.HOST_SET_LOCAL_HOST, { isHostOnPC: Boolean(isHostOnPC) });
    }

    kickPlayer(playerId) {
        if (!playerId) return false;
        if (playerId === 'host_pc') {
            return this.setLocalHost(false);
        }
        if (this.connectedHost && this.connectedHost.id === playerId) {
            this.connectedHost.isConnected = false;
            this.connectedPlayers.delete(playerId);
            this.hasHost = Boolean(this.isHostOnPC);
        }
        this.connectedPlayers.delete(playerId);
        return this.send(MSG.HOST_KICK_PLAYER, { playerId });
    }

    startGame() {
        return this.send(MSG.HOST_START_GAME, {});
    }

    selectQuestion(themeIdx, questionIdx, question) {
        return this.send(MSG.HOST_SELECT_QUESTION, {
            themeIdx,
            questionIdx,
            question
        });
    }

    activateBuzzer(allowedPlayerIds = null) {
        return this.send(MSG.HOST_ACTIVATE_BUZZER, { allowedPlayerIds });
    }

    startAuctionAnswer(biddingPlayerIds = null) {
        return this.send(MSG.HOST_START_AUCTION_ANSWER, { biddingPlayerIds });
    }

    setAuctionBets(bets) {
        return this.send(MSG.HOST_SET_AUCTION_BETS, { bets });
    }

    setCatTarget(targetPlayerId) {
        return this.send(MSG.HOST_SET_CAT_TARGET, { targetPlayerId });
    }

    setAuctionLeader(leaderPlayerId, maxBet) {
        return this.send(MSG.HOST_SET_AUCTION_LEADER, { leaderPlayerId, maxBet });
    }

    judgeAnswer(isCorrect, withPenalty = false) {
        return this.send(MSG.HOST_JUDGE_ANSWER, { isCorrect: Boolean(isCorrect), withPenalty: Boolean(withPenalty) });
    }

    nextRound() {
        return this.send(MSG.HOST_NEXT_ROUND, {});
    }

    showStats() {
        return this.send(MSG.HOST_SHOW_STATS, {});
    }

    skipRound() {
        return this.send(MSG.HOST_SKIP_ROUND, {});
    }

    passTurn() {
        return this.send(MSG.HOST_PASS_TURN, {});
    }

    updateAllScores(delta) {
        return this.send(MSG.HOST_UPDATE_ALL_SCORES, { delta: Number(delta) || 0 });
    }

    showAnswer() {
        return this.send(MSG.HOST_SHOW_ANSWER, {});
    }

    togglePause(isPaused = null) {
        return this.send(MSG.HOST_TOGGLE_PAUSE, { isPaused });
    }

    closeQuestion() {
        return this.send(MSG.HOST_CLOSE_QUESTION, {});
    }

    finishGame(data = {}) {
        return this.send(MSG.GAME_FINISHED, data);
    }

    updateScore(playerId, delta) {
        return this.send(MSG.HOST_UPDATE_SCORE, { playerId, delta: Number(delta) || 0 });
    }

    /**
     * Player Actions
     */
    joinRoom(roomCode, name, avatar, sessionToken, role = 'player') {
        this.roomCode = (roomCode || '').toUpperCase().trim();
        this.role = role || 'player';
        return this.send(MSG.PLAYER_JOIN, {
            roomCode: this.roomCode,
            name,
            avatar,
            sessionToken: sessionToken || this.sessionToken,
            role: this.role
        });
    }

    buzz() {
        return this.send(MSG.PLAYER_BUZZ, {});
    }

    submitAnswer(answerText) {
        return this.send(MSG.PLAYER_SUBMIT_ANSWER, { answerText });
    }

    auctionBet(amount) {
        return this.send(MSG.PLAYER_AUCTION_BET, { amount: Number(amount) || 0 });
    }

    catTransfer(targetPlayerId) {
        return this.send(MSG.PLAYER_CAT_TRANSFER, { targetPlayerId });
    }

    getPlayersList() {
        return Array.from(this.connectedPlayers.values()).filter(p => p.role !== 'host');
    }

    getHost() {
        if (this.connectedHost && this.connectedHost.isConnected) {
            if (this.connectedHost.id !== 'host_pc' || this.isHostOnPC) {
                return this.connectedHost;
            }
        }
        const roleHost = Array.from(this.connectedPlayers.values()).find(p => p.role === 'host' && p.isConnected && (p.id !== 'host_pc' || this.isHostOnPC));
        if (roleHost) return roleHost;
        if (this.isHostOnPC) return { id: 'host_pc', name: 'Ведущий (ПК)', role: 'host', isConnected: true };
        return null;
    }

    getActivePlayersCount() {
        return Array.from(this.connectedPlayers.values()).filter(p => p.isConnected && p.role !== 'host').length;
    }

    disconnect() {
        this.autoReconnect = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            try {
                this.ws.close();
            } catch {}
            this.ws = null;
        }
        this.isConnected = false;
        this.roomCode = null;
        this.hostToken = null;
        this.selfPlayer = null;
        this.connectedHost = null;
        this.hasHost = false;
        this.isHostOnPC = false;
        this.canStartGame = false;
        this.connectedPlayers.clear();
    }
}

if (typeof window !== 'undefined') {
    window.NetworkClient = NetworkClient;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NetworkClient;
}
