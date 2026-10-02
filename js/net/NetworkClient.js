/**
 * Quiz U - NetworkClient
 * Manages host and client WebSocket communication with the room server.
 */

// If running in Node, resolve protocol; in browser, use window.QuizProtocol
const Protocol = (typeof QuizProtocol !== 'undefined')
    ? QuizProtocol
    : (typeof require !== 'undefined' ? require('./Protocol') : null);

const MSG = Protocol ? Protocol.MSG_TYPES : {};
const ERR = Protocol ? Protocol.ERROR_CODES : {};

class NetworkClient {
    constructor(options = {}) {
        this.url = options.url || null;
        this.ws = null;
        this.WebSocketClass = options.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);
        this.roomCode = null;
        this.hostToken = null;
        this.isHost = options.isHost !== false;
        this.isConnected = false;
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
     * Connect to the WebSocket server
     * @param {string} [serverUrl]
     * @returns {Promise<NetworkClient>}
     */
    connect(serverUrl) {
        if (serverUrl) {
            this.url = serverUrl;
        }

        if (!this.url) {
            return Promise.reject(new Error('WebSocket URL is required'));
        }

        if (!this.WebSocketClass) {
            return Promise.reject(new Error('WebSocket implementation is not available'));
        }

        if (this.isConnected && this.ws && this.ws.readyState === 1) {
            return Promise.resolve(this);
        }

        return new Promise((resolve, reject) => {
            let settled = false;

            try {
                this.ws = new this.WebSocketClass(this.url);
            } catch (err) {
                return reject(err);
            }

            this.ws.onopen = () => {
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
                this.emit('error', err);
                if (!settled) {
                    settled = true;
                    reject(err);
                }
            };

            this.ws.onclose = (event) => {
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
                }
                this.emit('player_left', payload);
                break;

            case MSG.ROOM_STATE:
                this.lastState = payload;
                this._syncPlayersFromState(payload);
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
                this.emit('score_updated', payload);
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
        if (state && Array.isArray(state.players)) {
            this.connectedPlayers.clear();
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

    activateBuzzer() {
        return this.send(MSG.HOST_ACTIVATE_BUZZER, {});
    }

    judgeAnswer(isCorrect) {
        return this.send(MSG.HOST_JUDGE_ANSWER, { isCorrect: Boolean(isCorrect) });
    }

    updateScore(playerId, delta) {
        return this.send(MSG.HOST_UPDATE_SCORE, { playerId, delta: Number(delta) || 0 });
    }

    getPlayersList() {
        return Array.from(this.connectedPlayers.values());
    }

    getActivePlayersCount() {
        return Array.from(this.connectedPlayers.values()).filter(p => p.isConnected).length;
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
        this.connectedPlayers.clear();
    }
}

if (typeof window !== 'undefined') {
    window.NetworkClient = NetworkClient;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NetworkClient;
}
