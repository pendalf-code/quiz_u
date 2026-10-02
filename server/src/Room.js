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
        this.hostWs = hostWs; // Big screen / PC socket
        this.hostToken = crypto.randomUUID();
        this.hostPlayer = null; // Mobile host: { id, name, avatar, ws, sessionToken, role: 'host', isConnected, joinedAt }
        this.options = {
            maxPlayers: options.maxPlayers || 8,
            readingTime: options.readingTime || 7,
            thinkingTime: options.thinkingTime || 30,
            answerTime: options.answerTime || 5,
            ...options
        };

        // Determine if local PC is treated as host
        this.isHostOnPC = options.isHostOnPC !== undefined
            ? Boolean(options.isHostOnPC)
            : (options.requireMobileHost ? false : true);

        this.players = new Map(); // playerId -> PlayerData
        this.stateMachine = new GameStateMachine();
        this.scoreManager = new ScoreManager();

        this.currentPack = null;
        this.currentRoundIndex = 0;
        this.currentThemeIndex = null;
        this.currentQuestionIndex = null;
        this.currentCost = 0;
        this.currentQuestion = null; // Full question with answer (HOST ONLY)
        this.isPaused = false;

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
        const msg = createMessage(type, payload);
        if (this.hostWs && this.hostWs.readyState === 1 /* OPEN */) {
            this.hostWs.send(msg);
        }
        if (this.hostPlayer && this.hostPlayer.ws && this.hostPlayer.ws.readyState === 1 /* OPEN */) {
            this.hostPlayer.ws.send(msg);
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
        if (this.hostPlayer && this.hostPlayer.ws && this.hostPlayer.ws.readyState === 1) {
            this.hostPlayer.ws.send(msg);
        }
        for (const player of this.players.values()) {
            if (player.ws && player.ws.readyState === 1) {
                player.ws.send(msg);
            }
        }
    }

    broadcastRoomState() {
        if (this.hostWs && this.hostWs.readyState === 1) {
            this.hostWs.send(createMessage(MSG_TYPES.ROOM_STATE, this.getStateSnapshot(false)));
        }
        if (this.hostPlayer && this.hostPlayer.ws && this.hostPlayer.ws.readyState === 1) {
            this.hostPlayer.ws.send(createMessage(MSG_TYPES.ROOM_STATE, this.getStateSnapshot(false)));
        }
        const playerSnapshot = this.getStateSnapshot(true);
        const playerMsg = createMessage(MSG_TYPES.ROOM_STATE, playerSnapshot);
        for (const player of this.players.values()) {
            if (player.ws && player.ws.readyState === 1) {
                player.ws.send(playerMsg);
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

    addPlayer(name, avatar, ws, sessionToken = null, role = 'player') {
        this.touch();
        const trimmedName = (name || '').trim();
        if (!trimmedName) {
            return { success: false, error: ERROR_CODES.INVALID_PAYLOAD, message: 'Имя игрока не может быть пустым' };
        }

        // --- HOST ROLE LOGIC ---
        if (role === 'host') {
            // Check if reconnecting by sessionToken
            if (this.hostPlayer) {
                if (sessionToken && this.hostPlayer.sessionToken === sessionToken) {
                    this.hostPlayer.ws = ws;
                    this.hostPlayer.isConnected = true;
                    this.hostPlayer.name = trimmedName;
                    if (avatar) this.hostPlayer.avatar = avatar;
                    this.broadcastToAll(MSG_TYPES.PLAYER_JOINED, {
                        player: this.sanitizeHost(this.hostPlayer),
                        role: 'host',
                        isReconnect: true
                    });
                    return { success: true, player: this.hostPlayer, role: 'host', isReconnect: true };
                }

                // Host already exists in room
                return {
                    success: false,
                    error: ERROR_CODES.HOST_ALREADY_EXISTS,
                    message: 'Роль ведущего в этой комнате уже занята. Пожалуйста, войдите как игрок.'
                };
            }

            const hostId = 'h_' + crypto.randomBytes(4).toString('hex');
            const token = crypto.randomUUID();
            this.hostPlayer = {
                id: hostId,
                name: trimmedName,
                avatar: avatar || '🎙️',
                ws,
                sessionToken: token,
                role: 'host',
                isConnected: true,
                joinedAt: Date.now()
            };

            this.broadcastToAll(MSG_TYPES.PLAYER_JOINED, {
                player: this.sanitizeHost(this.hostPlayer),
                role: 'host',
                isReconnect: false
            });

            return { success: true, player: this.hostPlayer, role: 'host', isReconnect: false };
        }

        // --- PLAYER ROLE LOGIC ---
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
                        role: 'player',
                        isReconnect: true
                    });
                    this.syncScoreManagerTeams();
                    return { success: true, player: existing, role: 'player', isReconnect: true };
                }
            }
        }

        if (this.players.size >= this.options.maxPlayers) {
            return { success: false, error: ERROR_CODES.ROOM_FULL, message: 'Комната заполнена' };
        }

        // Check duplicate name against host and active players
        if (this.hostPlayer && this.hostPlayer.name.toLowerCase() === trimmedName.toLowerCase() && this.hostPlayer.isConnected) {
            return { success: false, error: ERROR_CODES.NAME_ALREADY_TAKEN, message: 'Имя уже занято в этой комнате' };
        }
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
            role: 'player',
            score: 0,
            isConnected: true,
            joinedAt: Date.now()
        };

        this.players.set(playerId, newPlayer);
        this.syncScoreManagerTeams();

        this.broadcastToAll(MSG_TYPES.PLAYER_JOINED, {
            player: this.sanitizePlayer(newPlayer),
            role: 'player',
            isReconnect: false
        });

        return { success: true, player: newPlayer, role: 'player', isReconnect: false };
    }

    removePlayer(playerId) {
        this.touch();
        if (this.hostPlayer && this.hostPlayer.id === playerId) {
            this.hostPlayer.isConnected = false;
            this.hostPlayer.ws = null;
            this.broadcastToAll(MSG_TYPES.PLAYER_LEFT, {
                playerId,
                name: this.hostPlayer.name,
                role: 'host'
            });
            return;
        }

        const player = this.players.get(playerId);
        if (player) {
            player.isConnected = false;
            player.ws = null;
            this.broadcastToAll(MSG_TYPES.PLAYER_LEFT, {
                playerId,
                name: player.name,
                role: 'player'
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

    sanitizeHost(host) {
        if (!host) return null;
        return {
            id: host.id,
            name: host.name,
            avatar: host.avatar,
            role: 'host',
            isConnected: host.isConnected
        };
    }

    sanitizePlayer(player) {
        return {
            id: player.id,
            name: player.name,
            avatar: player.avatar,
            role: player.role || 'player',
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

    setHostOnPC(isHostOnPC) {
        this.touch();
        this.isHostOnPC = Boolean(isHostOnPC);
        this.broadcastRoomState();
        return this.isHostOnPC;
    }

    hasHost() {
        const hasMobileHost = Boolean(this.hostPlayer && this.hostPlayer.isConnected);
        const hasDesktopHost = Boolean(this.isHostOnPC && this.hostWs && (this.hostWs.readyState === undefined || this.hostWs.readyState === 1));
        return hasMobileHost || hasDesktopHost;
    }

    getActivePlayersCount() {
        return Array.from(this.players.values()).filter(p => p.isConnected && p.role !== 'host').length;
    }

    canStartGame() {
        if (!this.hasHost()) {
            return {
                canStart: false,
                errorCode: ERROR_CODES.HOST_REQUIRED,
                message: 'Для старта игры требуется ведущий'
            };
        }
        const activeCount = this.getActivePlayersCount();
        if (activeCount < 2) {
            return {
                canStart: false,
                errorCode: ERROR_CODES.NOT_ENOUGH_PLAYERS,
                message: 'Для старта игры требуется как минимум 2 игрока'
            };
        }
        return {
            canStart: true
        };
    }

    startGame() {
        this.touch();
        const check = this.canStartGame();
        if (!check.canStart) {
            return {
                success: false,
                errorCode: check.errorCode,
                message: check.message
            };
        }
        this.stateMachine.showBoard();
        this.broadcastRoomState();
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
        this.isPaused = false;

        const qType = (questionData && questionData.type) ? questionData.type : 'normal';
        this.stateMachine.startQuestion(this.currentCost, qType);

        // Send full question to host (both PC screen and mobile host)
        this.sendToHost(MSG_TYPES.QUESTION_ACTIVE, {
            themeIdx,
            questionIdx,
            cost: this.currentCost,
            question: this.currentQuestion // Host gets full question with 'a', 'comment', etc.
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
            return { success: false, error: ERROR_CODES.INVALID_ACTION, message: 'Вы уже отвечали на этот вопрос' };
        }

        const player = this.players.get(playerId);
        if (!player) {
            return { success: false, error: ERROR_CODES.INVALID_ACTION, message: 'Игрок не найден' };
        }

        // Lock first buzzer winner
        this.buzzedPlayers.add(playerId);
        this.activeBuzzerPlayerId = playerId;
        this.stateMachine.registerBuzz(playerId);

        this.broadcastToAll(MSG_TYPES.BUZZ_LOCKED, {
            playerId,
            playerName: player.name,
            cost: this.currentCost,
            answerTime: this.options.answerTime
        });

        // Start answer countdown timer
        if (this.answerTimer) clearTimeout(this.answerTimer);
        this.answerTimer = setTimeout(() => {
            this.handleAnswerTimeout();
        }, (this.options.answerTime || 5) * 1000);
        if (this.answerTimer.unref) this.answerTimer.unref();

        return { success: true, winner: player };
    }

    handleAnswerSubmit(playerId, answerText) {
        this.touch();
        if (this.stateMachine.state !== 'ANSWERING' || this.activeBuzzerPlayerId !== playerId) {
            return { success: false, error: ERROR_CODES.INVALID_ACTION, message: 'Сейчас не ваша очередь отвечать' };
        }

        const player = this.players.get(playerId);
        if (!player) return { success: false, error: ERROR_CODES.INVALID_ACTION };

        // Forward answer to host
        this.sendToHost(MSG_TYPES.ANSWER_SUBMITTED, {
            playerId,
            playerName: player.name,
            answerText
        });

        return { success: true };
    }

    handleAuctionBet(playerId, amount) {
        this.touch();
        const player = this.players.get(playerId);
        if (!player) return { success: false, error: ERROR_CODES.INVALID_ACTION };

        this.broadcastToAll(MSG_TYPES.AUCTION_BET_MADE, {
            playerId,
            playerName: player.name,
            amount: Number(amount) || 0
        });
        return { success: true };
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

        const answeringPlayer = this.players.get(answeringPlayerId);
        const answeringPlayerName = answeringPlayer ? answeringPlayer.name : 'Игрок';

        if (isCorrect) {
            this.updatePlayerScore(answeringPlayerId, this.currentCost);
            this.broadcastToAll(MSG_TYPES.JUDGE_RESULT, {
                isCorrect: true,
                playerId: answeringPlayerId,
                playerName: answeringPlayerName,
                cost: this.currentCost,
                reopened: false
            });
            this.finishQuestion();
            return { success: true, correct: true, playerId: answeringPlayerId };
        } else {
            this.updatePlayerScore(answeringPlayerId, -this.currentCost);
            this.activeBuzzerPlayerId = null;

            // Check if others can buzz
            const remainingPlayers = Array.from(this.players.keys()).filter(id => !this.buzzedPlayers.has(id));
            if (remainingPlayers.length > 0) {
                this.broadcastToAll(MSG_TYPES.JUDGE_RESULT, {
                    isCorrect: false,
                    playerId: answeringPlayerId,
                    playerName: answeringPlayerName,
                    cost: this.currentCost,
                    reopened: true
                });
                this.stateMachine.state = 'BUZZ_ACTIVE';
                this.activateBuzzer();
                return { success: true, correct: false, reopened: true };
            } else {
                this.broadcastToAll(MSG_TYPES.JUDGE_RESULT, {
                    isCorrect: false,
                    playerId: answeringPlayerId,
                    playerName: answeringPlayerName,
                    cost: this.currentCost,
                    reopened: false
                });
                this.finishQuestion();
                return { success: true, correct: false, reopened: false };
            }
        }
    }

    togglePause(isPaused = null) {
        this.touch();
        if (typeof isPaused === 'boolean') {
            this.isPaused = isPaused;
        } else {
            this.isPaused = !this.isPaused;
        }
        this.broadcastToAll(MSG_TYPES.GAME_PAUSED, { isPaused: this.isPaused });
        return { success: true, isPaused: this.isPaused };
    }

    showAnswer() {
        this.touch();
        this.broadcastToAll(MSG_TYPES.SHOW_ANSWER, {
            themeIdx: this.currentThemeIndex,
            questionIdx: this.currentQuestionIndex,
            cost: this.currentCost,
            question: this.currentQuestion
        });
        return { success: true };
    }

    closeQuestion() {
        this.touch();
        this.finishQuestion();
        this.broadcastToAll(MSG_TYPES.QUESTION_CLOSED, {
            themeIdx: this.currentThemeIndex,
            questionIdx: this.currentQuestionIndex
        });
        return { success: true };
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

        this.broadcastRoomState();
    }

    getStateSnapshot(forPlayer = false) {
        let questionData = null;
        if (this.currentQuestion) {
            questionData = forPlayer 
                ? PackParser.sanitizeQuestionForPlayer(this.currentQuestion)
                : this.currentQuestion;
        }

        const startCheck = this.canStartGame();
        const resolvedHost = this.hostPlayer
            ? this.sanitizeHost(this.hostPlayer)
            : (this.isHostOnPC ? { id: 'host_pc', name: 'Ведущий (ПК)', role: 'host', isConnected: true } : null);

        return {
            roomCode: this.code,
            state: this.stateMachine.state,
            players: this.getSanitizedPlayers(),
            host: resolvedHost,
            hasHost: this.hasHost(),
            isHostOnPC: this.isHostOnPC,
            activePlayersCount: this.getActivePlayersCount(),
            canStartGame: startCheck.canStart,
            currentRoundIndex: this.currentRoundIndex,
            currentCost: this.currentCost,
            activeBuzzerPlayerId: this.activeBuzzerPlayerId,
            currentQuestion: questionData,
            isPaused: this.isPaused,
            options: this.options
        };
    }

    destroy() {
        if (this.answerTimer) clearTimeout(this.answerTimer);
        if (this.readingTimer) clearTimeout(this.readingTimer);
        this.players.clear();
        this.hostPlayer = null;
        this.hostWs = null;
    }
}

module.exports = Room;
