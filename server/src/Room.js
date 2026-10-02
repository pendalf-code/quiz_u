/**
 * Quiz U - Authoritative Network Room Instance
 */

const crypto = require('crypto');
const { MSG_TYPES, ERROR_CODES, createMessage } = require('./protocol');

// Import Core Engine Modules
const GameStateMachine = require('../../js/core/GameStateMachine');
const ScoreManager = require('../../js/core/ScoreManager');
const PackParser = require('../../js/core/PackParser');

class Room {
    constructor(code, hostWs, options = {}) {
        this.code = code.toUpperCase();
        this.hostWs = hostWs;
        this.hostToken = crypto.randomUUID();
        this.options = {
            maxPlayers: options.maxPlayers || 8,
            readingTime: options.readingTime || 7,
            thinkingTime: options.thinkingTime || 30,
            answerTime: options.answerTime || 5,
            ...options
        };

        this.players = new Map(); // playerId -> PlayerData
        this.stateMachine = new GameStateMachine();
        this.scoreManager = new ScoreManager();

        this.currentPack = null;
        this.currentRoundIndex = 0;
        this.currentThemeIndex = null;
        this.currentQuestionIndex = null;
        this.currentCost = 0;
        this.currentQuestion = null; // Full question with answer (HOST ONLY)

        this.activeBuzzerPlayerId = null;
        this.buzzedPlayers = new Set();
        this.answerTimer = null;
        this.readingTimer = null;

        this.createdAt = Date.now();
        this.lastActivityAt = Date.now();

        this.stateMachine.startLobby();
    }

    touch() {
        this.lastActivityAt = Date.now();
    }

    sendToHost(type, payload) {
        if (this.hostWs && this.hostWs.readyState === 1 /* OPEN */) {
            this.hostWs.send(createMessage(type, payload));
        }
    }

    sendToPlayer(playerId, type, payload) {
        const player = this.players.get(playerId);
        if (player && player.ws && player.ws.readyState === 1 /* OPEN */) {
            player.ws.send(createMessage(type, payload));
        }
    }

    broadcastToAll(type, payload) {
        const msg = createMessage(type, payload);
        if (this.hostWs && this.hostWs.readyState === 1) {
            this.hostWs.send(msg);
        }
        for (const player of this.players.values()) {
            if (player.ws && player.ws.readyState === 1) {
                player.ws.send(msg);
            }
        }
    }

    broadcastToPlayers(type, payload) {
        const msg = createMessage(type, payload);
        for (const player of this.players.values()) {
            if (player.ws && player.ws.readyState === 1) {
                player.ws.send(msg);
            }
        }
    }

    addPlayer(name, avatar, ws, sessionToken = null) {
        this.touch();
        const trimmedName = (name || '').trim();
        if (!trimmedName) {
            return { success: false, error: ERROR_CODES.INVALID_PAYLOAD, message: 'Имя игрока не может быть пустым' };
        }

        // Check if reconnecting by sessionToken
        if (sessionToken) {
            for (const [id, existing] of this.players.entries()) {
                if (existing.sessionToken === sessionToken) {
                    existing.ws = ws;
                    existing.isConnected = true;
                    existing.name = trimmedName;
                    existing.avatar = avatar || existing.avatar;
                    this.broadcastToAll(MSG_TYPES.PLAYER_JOINED, {
                        player: this.sanitizePlayer(existing),
                        isReconnect: true
                    });
                    this.syncScoreManagerTeams();
                    return { success: true, player: existing, isReconnect: true };
                }
            }
        }

        if (this.players.size >= this.options.maxPlayers) {
            return { success: false, error: ERROR_CODES.ROOM_FULL, message: 'Комната заполнена' };
        }

        // Check duplicate name
        for (const existing of this.players.values()) {
            if (existing.name.toLowerCase() === trimmedName.toLowerCase() && existing.isConnected) {
                return { success: false, error: ERROR_CODES.NAME_ALREADY_TAKEN, message: 'Имя уже занято в этой комнате' };
            }
        }

        const playerId = 'p_' + crypto.randomBytes(4).toString('hex');
        const token = crypto.randomUUID();
        const newPlayer = {
            id: playerId,
            name: trimmedName,
            avatar: avatar || '🐱',
            ws,
            sessionToken: token,
            score: 0,
            isConnected: true,
            joinedAt: Date.now()
        };

        this.players.set(playerId, newPlayer);
        this.syncScoreManagerTeams();

        this.broadcastToAll(MSG_TYPES.PLAYER_JOINED, {
            player: this.sanitizePlayer(newPlayer),
            isReconnect: false
        });

        return { success: true, player: newPlayer, isReconnect: false };
    }

    removePlayer(playerId) {
        this.touch();
        const player = this.players.get(playerId);
        if (player) {
            player.isConnected = false;
            player.ws = null;
            this.broadcastToAll(MSG_TYPES.PLAYER_LEFT, {
                playerId,
                name: player.name
            });
        }
    }

    syncScoreManagerTeams() {
        const teams = Array.from(this.players.values()).map(p => ({
            name: p.name,
            score: p.score,
            id: p.id
        }));
        this.scoreManager.setTeams(teams);
    }

    sanitizePlayer(player) {
        return {
            id: player.id,
            name: player.name,
            avatar: player.avatar,
            score: player.score,
            isConnected: player.isConnected
        };
    }

    getSanitizedPlayers() {
        return Array.from(this.players.values()).map(p => this.sanitizePlayer(p));
    }

    setPack(packData) {
        this.touch();
        this.currentPack = PackParser.normalizeGameData(packData);
        return this.currentPack;
    }

    startGame() {
        this.touch();
        if (this.players.size === 0) {
            return { success: false, message: 'В комнате нет игроков' };
        }
        this.stateMachine.showBoard();
        this.broadcastToAll(MSG_TYPES.ROOM_STATE, this.getStateSnapshot());
        return { success: true };
    }

    selectQuestion(themeIdx, questionIdx, questionData) {
        this.touch();
        this.currentThemeIndex = themeIdx;
        this.currentQuestionIndex = questionIdx;
        this.currentQuestion = questionData;
        this.currentCost = (questionData && (questionData.cost !== undefined ? questionData.cost : questionData.price)) ? Number(questionData.cost !== undefined ? questionData.cost : questionData.price) : 100;
        this.activeBuzzerPlayerId = null;
        this.buzzedPlayers.clear();

        const qType = (questionData && questionData.type) ? questionData.type : 'normal';
        this.stateMachine.startQuestion(this.currentCost, qType);

        // Send full question to host
        this.sendToHost(MSG_TYPES.QUESTION_ACTIVE, {
            themeIdx,
            questionIdx,
            cost: this.currentCost,
            question: this.currentQuestion // Host gets full question with 'a'
        });

        // Anti-Cheat: sanitize question before sending to players!
        const sanitizedQuestion = PackParser.sanitizeQuestionForPlayer(this.currentQuestion);
        this.broadcastToPlayers(MSG_TYPES.QUESTION_ACTIVE, {
            themeIdx,
            questionIdx,
            cost: this.currentCost,
            question: sanitizedQuestion // Players get NO 'a' or 'a_img'
        });

        // Start reading timer
        if (this.readingTimer) clearTimeout(this.readingTimer);
        this.readingTimer = setTimeout(() => {
            this.activateBuzzer();
        }, (this.options.readingTime || 7) * 1000);
        if (this.readingTimer.unref) this.readingTimer.unref();

        return { success: true };
    }

    activateBuzzer() {
        this.touch();
        if (this.readingTimer) {
            clearTimeout(this.readingTimer);
            this.readingTimer = null;
        }

        try {
            this.stateMachine.openBuzzer();
        } catch {
            return;
        }

        this.broadcastToAll(MSG_TYPES.BUZZER_READY, {
            cost: this.currentCost,
            allowedPlayerIds: Array.from(this.players.keys()).filter(id => !this.buzzedPlayers.has(id))
        });
    }

    handleBuzz(playerId) {
        this.touch();
        if (this.stateMachine.state !== 'BUZZ_ACTIVE') {
            return { success: false, error: ERROR_CODES.INVALID_ACTION, message: 'Кнопка ответа сейчас не активна' };
        }

        if (this.buzzedPlayers.has(playerId)) {
            return { success: false, error: ERROR_CODES.INVALID_ACTION, message: 'Вы уже нажимали кнопку на этот вопрос' };
        }

        const player = this.players.get(playerId);
        if (!player || !player.isConnected) {
            return { success: false, error: ERROR_CODES.NOT_AUTHORIZED, message: 'Игрок не найден' };
        }

        // Arbiter: Lock first buzzing player
        this.activeBuzzerPlayerId = playerId;
        this.buzzedPlayers.add(playerId);
        this.stateMachine.registerBuzz(playerId);

        this.broadcastToAll(MSG_TYPES.BUZZ_LOCKED, {
            playerId: player.id,
            playerName: player.name,
            answerTime: this.options.answerTime
        });

        // Start answer countdown
        if (this.answerTimer) clearTimeout(this.answerTimer);
        this.answerTimer = setTimeout(() => {
            this.handleAnswerTimeout();
        }, (this.options.answerTime || 5) * 1000);
        if (this.answerTimer.unref) this.answerTimer.unref();

        return { success: true, player: this.sanitizePlayer(player) };
    }

    submitAnswer(playerId, answerText) {
        this.touch();
        const player = this.players.get(playerId);
        if (!player) return { success: false, error: ERROR_CODES.NOT_AUTHORIZED };

        this.broadcastToAll(MSG_TYPES.ANSWER_SUBMITTED, {
            playerId,
            playerName: player.name,
            answerText: (answerText || '').trim()
        });
        return { success: true };
    }

    handleAuctionBet(playerId, amount) {
        this.touch();
        const player = this.players.get(playerId);
        if (!player) return { success: false, error: ERROR_CODES.NOT_AUTHORIZED };

        const betAmount = Math.max(0, parseInt(amount, 10) || 0);
        this.broadcastToAll(MSG_TYPES.AUCTION_BET_MADE, {
            playerId,
            playerName: player.name,
            amount: betAmount
        });
        return { success: true, amount: betAmount };
    }

    handleCatTransfer(playerId, targetPlayerId) {
        this.touch();
        const player = this.players.get(playerId);
        const targetPlayer = this.players.get(targetPlayerId);
        if (!player || !targetPlayer) return { success: false, error: ERROR_CODES.INVALID_ACTION };

        this.broadcastToAll(MSG_TYPES.CAT_TRANSFERRED, {
            fromPlayerId: playerId,
            fromPlayerName: player.name,
            toPlayerId: targetPlayerId,
            toPlayerName: targetPlayer.name
        });
        return { success: true };
    }

    handleAnswerTimeout() {
        this.touch();
        if (this.answerTimer) {
            clearTimeout(this.answerTimer);
            this.answerTimer = null;
        }

        const timedOutPlayerId = this.activeBuzzerPlayerId;
        this.activeBuzzerPlayerId = null;

        this.broadcastToAll(MSG_TYPES.ANSWER_TIMEOUT, {
            playerId: timedOutPlayerId,
            message: 'Время на ответ истекло!'
        });

        // Deduct points for timeout
        if (timedOutPlayerId) {
            this.updatePlayerScore(timedOutPlayerId, -this.currentCost);
        }

        // Check if there are other eligible players
        const remainingPlayers = Array.from(this.players.keys()).filter(id => !this.buzzedPlayers.has(id));
        if (remainingPlayers.length > 0) {
            this.stateMachine.state = 'BUZZ_ACTIVE';
            this.activateBuzzer();
        } else {
            this.finishQuestion();
        }
    }

    judgeAnswer(isCorrect) {
        this.touch();
        if (this.answerTimer) {
            clearTimeout(this.answerTimer);
            this.answerTimer = null;
        }

        const answeringPlayerId = this.activeBuzzerPlayerId;
        if (!answeringPlayerId) {
            return { success: false, message: 'Нет отвечающего игрока' };
        }

        if (isCorrect) {
            this.updatePlayerScore(answeringPlayerId, this.currentCost);
            this.finishQuestion();
            return { success: true, correct: true, playerId: answeringPlayerId };
        } else {
            this.updatePlayerScore(answeringPlayerId, -this.currentCost);
            this.activeBuzzerPlayerId = null;

            // Check if others can buzz
            const remainingPlayers = Array.from(this.players.keys()).filter(id => !this.buzzedPlayers.has(id));
            if (remainingPlayers.length > 0) {
                this.stateMachine.state = 'BUZZ_ACTIVE';
                this.activateBuzzer();
                return { success: true, correct: false, reopened: true };
            } else {
                this.finishQuestion();
                return { success: true, correct: false, reopened: false };
            }
        }
    }

    updatePlayerScore(playerId, delta) {
        const player = this.players.get(playerId);
        if (player) {
            player.score += delta;
            this.syncScoreManagerTeams();
            this.broadcastToAll(MSG_TYPES.SCORE_UPDATED, {
                playerId,
                playerName: player.name,
                newScore: player.score,
                delta,
                players: this.getSanitizedPlayers()
            });
        }
    }

    finishQuestion() {
        this.touch();
        if (this.answerTimer) clearTimeout(this.answerTimer);
        if (this.readingTimer) clearTimeout(this.readingTimer);
        this.answerTimer = null;
        this.readingTimer = null;
        this.activeBuzzerPlayerId = null;

        try {
            this.stateMachine.showBoard();
        } catch {
            this.stateMachine.state = 'BOARD';
        }

        this.broadcastToAll(MSG_TYPES.ROOM_STATE, this.getStateSnapshot());
    }

    getStateSnapshot(forPlayer = false) {
        let questionData = null;
        if (this.currentQuestion) {
            questionData = forPlayer 
                ? PackParser.sanitizeQuestionForPlayer(this.currentQuestion)
                : this.currentQuestion;
        }

        return {
            roomCode: this.code,
            state: this.stateMachine.state,
            players: this.getSanitizedPlayers(),
            currentRoundIndex: this.currentRoundIndex,
            currentCost: this.currentCost,
            activeBuzzerPlayerId: this.activeBuzzerPlayerId,
            currentQuestion: questionData,
            options: this.options
        };
    }

    destroy() {
        if (this.answerTimer) clearTimeout(this.answerTimer);
        if (this.readingTimer) clearTimeout(this.readingTimer);
        this.players.clear();
        this.hostWs = null;
    }
}

module.exports = Room;