/**
 * Quiz U - Authoritative Network Room Instance
 */

const crypto = require('crypto');
const { MSG_TYPES, ERROR_CODES, createMessage } = require('./protocol');

// Import Core Engine Modules
const GameStateMachine = require('../../js/core/GameStateMachine');
const ScoreManager = require('../../js/core/ScoreManager');
const PackParser = require('../../js/core/PackParser');

// Typed answers of an "auction for everyone" always get the same fixed window
const AUCTION_ANSWER_SECONDS = 30;

class Room {
    constructor(code, hostWs, options = {}) {
        this.code = code.toUpperCase();
        this.hostWs = hostWs; // Big screen / PC socket
        this.hostToken = crypto.randomUUID();
        this.hostPlayer = null; // Mobile host: { id, name, avatar, ws, sessionToken, role: 'host', isConnected, joinedAt }
        this.options = {
            maxPlayers: options.maxPlayers || 8,
            readingTime: options.readingTime !== undefined ? Math.max(0, parseInt(options.readingTime, 10)) : 7,
            thinkingTime: options.thinkingTime !== undefined ? Math.max(1, parseInt(options.thinkingTime, 10)) : 30,
            answerTime: options.answerTime !== undefined ? Math.max(1, parseInt(options.answerTime, 10)) : 5,
            penaltyEnabled: options.penaltyEnabled !== undefined ? Boolean(options.penaltyEnabled) : true,
            penaltyMode: options.penaltyMode === 'fixed' ? 'fixed' : 'nominal',
            penaltyFixedAmount: options.penaltyFixedAmount !== undefined ? Math.max(0, parseInt(options.penaltyFixedAmount, 10)) : 100,
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
        this.currentThemeName = '';
        this.currentCost = 0;
        this.currentQuestion = null; // Full question with answer (HOST ONLY)
        this.isPaused = false;
        this.pauseReason = null; // 'host' | 'disconnect'
        this.disconnectedPlayerIds = new Set(); // who caused a disconnect-pause

        this.activeBuzzerPlayerId = null;
        this.buzzedPlayers = new Set();
        this.passedPlayers = new Set(); // players who declined to answer the current question
        this.allowedBuzzerPlayerIds = null;
        this.catTargetPlayerId = null;
        this.auctionLeaderPlayerId = null;
        this.auctionBets = new Map(); // playerId -> { val, isPassed }
        this.auctionAnswers = new Map(); // playerId -> { answerText, timestamp }
        this.biddingPlayerIds = [];
        this.auctionAnswersLocked = false;

        this.answerTimer = null;
        this.thinkingTimer = null;
        this.readingTimer = null;
        this.readingTimerStartedAt = 0;
        this.readingTimerDuration = 0;
        this.remainingReadingTime = 0;
        this.answerTimerStartedAt = 0;
        this.answerTimerDuration = 0;
        this.remainingAnswerTime = 0;

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
            this.hostPlayer.ws.send(createMessage(MSG_TYPES.ROOM_STATE, {
                ...this.getStateSnapshot(false),
                self: this.sanitizeHost(this.hostPlayer),
                sessionToken: this.hostPlayer.sessionToken,
                role: 'host'
            }));
        }
        const playerSnapshot = this.getStateSnapshot(true);
        for (const player of this.players.values()) {
            if (player.ws && player.ws.readyState === 1) {
                player.ws.send(createMessage(MSG_TYPES.ROOM_STATE, {
                    ...playerSnapshot,
                    self: this.sanitizePlayer(player),
                    sessionToken: player.sessionToken,
                    role: player.role || 'player'
                }));
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
        const trimmedName = (typeof name === 'string' ? name : '').trim();
        if (!trimmedName) {
            return { success: false, error: ERROR_CODES.INVALID_PAYLOAD, message: 'Имя игрока не может быть пустым' };
        }

        // --- HOST ROLE LOGIC ---
        if (role === 'host') {
            if (this.hostPlayer) {
                if (sessionToken && this.hostPlayer.sessionToken === sessionToken) {
                    this.hostPlayer.ws = ws;
                    this.hostPlayer.isConnected = true;
                    this.hostPlayer.name = trimmedName;
                    if (avatar) this.hostPlayer.avatar = avatar;
                    this.broadcastToAll(MSG_TYPES.PLAYER_JOINED, {
                        player: this.sanitizeHost(this.hostPlayer),
                        role: 'host', isReconnect: true });
                    this.broadcastRoomState();
                    this.resumeAfterReconnect(this.hostPlayer.id);
                    return { success: true, player: this.hostPlayer, role: 'host', isReconnect: true };
                }

                if (this.hostPlayer.isConnected) {
                    return { success: false, error: ERROR_CODES.HOST_ALREADY_EXISTS, message: 'Роль ведущего в этой комнате уже занята' };
                }
            }

            for (const p of this.players.values()) {
                if (p.name.toLowerCase() === trimmedName.toLowerCase()) {
                    return { success: false, error: ERROR_CODES.NAME_ALREADY_TAKEN, message: 'Игрок с таким именем уже в игре' };
                }
            }

            const hostToken = sessionToken || crypto.randomUUID();
            this.hostPlayer = {
                id: 'host_' + crypto.randomUUID().slice(0, 8),
                name: trimmedName,
                avatar: avatar || '🎤',
                ws,
                sessionToken: hostToken,
                role: 'host',
                score: 0,
                isConnected: true,
                joinedAt: Date.now()
            };

            this.broadcastToAll(MSG_TYPES.PLAYER_JOINED, {
                player: this.sanitizeHost(this.hostPlayer),
                role: 'host'
            });

            this.broadcastRoomState();
            return { success: true, player: this.hostPlayer, role: 'host' };
        }

        // --- PLAYER ROLE LOGIC ---
        if (sessionToken) {
            for (const [id, p] of this.players.entries()) {
                if (p.sessionToken === sessionToken) {
                    p.ws = ws;
                    p.isConnected = true;
                    p.name = trimmedName;
                    if (avatar) p.avatar = avatar;
                    this.broadcastToAll(MSG_TYPES.PLAYER_JOINED, {
                        player: this.sanitizePlayer(p),
                        role: 'player', isReconnect: true });
                    this.broadcastRoomState();
                    this.resumeAfterReconnect(p.id);
                    return { success: true, player: p, role: 'player', isReconnect: true };
                }
            }
        }

        if (this.hostPlayer && this.hostPlayer.name.toLowerCase() === trimmedName.toLowerCase()) {
            return { success: false, error: ERROR_CODES.NAME_ALREADY_TAKEN, message: 'Это имя уже занято ведущим' };
        }

        for (const p of this.players.values()) {
            if (p.name.toLowerCase() === trimmedName.toLowerCase()) {
                if (p.isConnected) {
                    return { success: false, error: ERROR_CODES.NAME_ALREADY_TAKEN, message: 'Игрок с таким именем уже в игре' };
                }
                p.ws = ws;
                p.isConnected = true;
                if (avatar) p.avatar = avatar;
                this.broadcastToAll(MSG_TYPES.PLAYER_JOINED, {
                    player: this.sanitizePlayer(p),
                    role: 'player', isReconnect: true });
                this.broadcastRoomState();
                this.resumeAfterReconnect(p.id);
                return { success: true, player: p, role: 'player', isReconnect: true };
            }
        }

        const activeCount = Array.from(this.players.values()).filter(p => p.isConnected && p.role !== 'host').length;
        if (activeCount >= this.options.maxPlayers) {
            return { success: false, error: ERROR_CODES.ROOM_FULL, message: 'Комната переполнена' };
        }

        const playerId = crypto.randomUUID();
        const playerToken = crypto.randomUUID();
        const newPlayer = {
            id: playerId,
            name: trimmedName,
            avatar: avatar || '🐱',
            score: 0,
            ws,
            sessionToken: playerToken,
            role: 'player',
            isConnected: true,
            joinedAt: Date.now()
        };

        this.players.set(playerId, newPlayer);
        this.scoreManager.addTeam(trimmedName);

        this.broadcastToAll(MSG_TYPES.PLAYER_JOINED, {
            player: this.sanitizePlayer(newPlayer),
            role: 'player'
        });

        this.broadcastRoomState();

        return { success: true, player: newPlayer, role: 'player' };
    }

    removePlayer(target) {
        this.touch();
        if (this.hostPlayer && (this.hostPlayer.ws === target || this.hostPlayer.id === target)) {
            const hostWs = this.hostPlayer.ws;
            const hostId = this.hostPlayer.id;
            const hostName = this.hostPlayer.name;
            const wasKicked = (this.hostPlayer.id === target);

            this.hostPlayer.isConnected = false;
            this.hostPlayer.ws = null;
            if (wasKicked) {
                this.hostPlayer.sessionToken = null;
            }

            if (hostWs && hostWs.readyState === 1) {
                const kickPayload = {
                    playerId: hostId,
                    playerName: hostName,
                    role: 'host',
                    kicked: wasKicked,
                    reason: wasKicked ? 'kicked_by_host' : 'disconnect'
                };
                try {
                    hostWs.send(createMessage(MSG_TYPES.PLAYER_LEFT, kickPayload));
                    if (wasKicked) {
                        hostWs.send(createMessage(MSG_TYPES.PLAYER_KICKED, {
                            playerId: hostId,
                            role: 'host',
                            reason: 'kicked_by_host',
                            message: 'Ведущий был отключен'
                        }));
                    }
                } catch (_) {}
                if (wasKicked) {
                    setTimeout(() => {
                        try { hostWs.close(1000, 'Kicked'); } catch (_) {}
                    }, 50);
                }
            }

            this.broadcastToAll(MSG_TYPES.PLAYER_LEFT, {
                playerId: hostId,
                playerName: hostName,
                role: 'host',
                kicked: wasKicked
            });

            if (wasKicked) {
                this.disconnectedPlayerIds.delete(hostId);
            } else {
                this.pauseForDisconnect(hostId, hostName);
            }

            this.broadcastRoomState();
            return;
        }

        for (const [id, player] of this.players.entries()) {
            if (player.ws === target || id === target) {
                const playerWs = player.ws;
                const wasKicked = (id === target);

                player.isConnected = false;
                player.ws = null;
                if (wasKicked) {
                    player.sessionToken = null;
                }
                this.buzzedPlayers.delete(id);

                if (playerWs && playerWs.readyState === 1) {
                    const kickPayload = {
                        playerId: id,
                        playerName: player.name,
                        role: 'player',
                        kicked: wasKicked,
                        reason: wasKicked ? 'kicked_by_host' : 'disconnect'
                    };
                    try {
                        playerWs.send(createMessage(MSG_TYPES.PLAYER_LEFT, kickPayload));
                        if (wasKicked) {
                            playerWs.send(createMessage(MSG_TYPES.PLAYER_KICKED, {
                                playerId: id,
                                role: 'player',
                                reason: 'kicked_by_host',
                                message: 'Вы были отключены от комнаты'
                            }));
                        }
                    } catch (_) {}
                    if (wasKicked) {
                        setTimeout(() => {
                            try { playerWs.close(1000, 'Kicked'); } catch (_) {}
                        }, 50);
                    }
                }

                this.broadcastToAll(MSG_TYPES.PLAYER_LEFT, {
                    playerId: id,
                    playerName: player.name,
                    role: 'player',
                    kicked: wasKicked
                });

                if (wasKicked) {
                    this.disconnectedPlayerIds.delete(id);
                } else {
                    this.pauseForDisconnect(id, player.name);
                }

                if (this.activeBuzzerPlayerId === id) {
                    if (this.answerTimer) {
                        clearTimeout(this.answerTimer);
                        this.answerTimer = null;
                    }
                    this.activeBuzzerPlayerId = null;
                    this.broadcastToAll(MSG_TYPES.BUZZ_RESET, {});

                    const remainingPlayers = this.getEligibleBuzzerIds();
                    if (remainingPlayers.length > 0) {
                        this.stateMachine.state = 'BUZZ_ACTIVE';
                        this.activateBuzzer(remainingPlayers);
                    } else {
                        this.finishQuestion();
                    }
                }

                this.broadcastRoomState();
                break;
            }
        }
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
        this.broadcastRoomState();
        return this.currentPack;
    }

    setHostOnPC(isHostOnPC) {
        this.touch();
        this.isHostOnPC = Boolean(isHostOnPC);
        this.broadcastRoomState();
        return this.isHostOnPC;
    }

    getPenaltyAmount(base = this.currentCost) {
        if (this.options.penaltyEnabled === false) return 0;
        if (this.options.penaltyMode === 'fixed') {
            const fixed = Number(this.options.penaltyFixedAmount);
            return Number.isFinite(fixed) ? Math.max(0, fixed) : 100;
        }
        return base;
    }

    /**
     * Connected players who may still buzz in the current question.
     */
    getEligibleBuzzerIds() {
        let ids = Array.from(this.players.values())
            .filter(p => p.isConnected && !this.buzzedPlayers.has(p.id) && !this.passedPlayers.has(p.id))
            .map(p => p.id);
        if (this.allowedBuzzerPlayerIds && this.allowedBuzzerPlayerIds.length > 0) {
            ids = ids.filter(id => this.allowedBuzzerPlayerIds.includes(id));
        }
        return ids;
    }

    updateOptions(newOptions = {}) {
        this.touch();
        if (typeof newOptions !== 'object' || newOptions === null) return this.options;

        if (newOptions.readingTime !== undefined) {
            const val = parseInt(newOptions.readingTime, 10);
            if (!isNaN(val) && val >= 0) this.options.readingTime = val;
        }
        if (newOptions.thinkingTime !== undefined) {
            const val = parseInt(newOptions.thinkingTime, 10);
            if (!isNaN(val) && val >= 1) this.options.thinkingTime = val;
        }
        if (newOptions.answerTime !== undefined) {
            const val = parseInt(newOptions.answerTime, 10);
            if (!isNaN(val) && val >= 1) this.options.answerTime = val;
        }
        if (newOptions.penaltyEnabled !== undefined) {
            this.options.penaltyEnabled = Boolean(newOptions.penaltyEnabled);
        }
        if (newOptions.penaltyMode !== undefined) {
            this.options.penaltyMode = newOptions.penaltyMode === 'fixed' ? 'fixed' : 'nominal';
        }
        if (newOptions.penaltyFixedAmount !== undefined) {
            const val = parseInt(newOptions.penaltyFixedAmount, 10);
            if (!isNaN(val) && val >= 0) this.options.penaltyFixedAmount = val;
        }
        if (newOptions.maxPlayers !== undefined) {
            const val = parseInt(newOptions.maxPlayers, 10);
            if (!isNaN(val) && val >= 2) this.options.maxPlayers = val;
        }

        this.broadcastToAll(MSG_TYPES.ROOM_SETTINGS_UPDATED, { options: this.options });
        this.broadcastRoomState();

        return this.options;
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
        if (activeCount < 1) {
            return {
                canStart: false,
                errorCode: ERROR_CODES.NOT_ENOUGH_PLAYERS,
                message: 'Для старта игры требуется как минимум 1 игрок'
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
        if (this.stateMachine.state === 'GAME_OVER') {
            this.currentRoundIndex = 0;
            this.currentThemeIndex = null;
            this.currentQuestion = null;
            if (this.currentPack && Array.isArray(this.currentPack)) {
                this.currentPack.forEach(r => {
                    (r.themes || []).forEach(th => {
                        (th.questions || []).forEach(q => {
                            q.used = false;
                        });
                    });
                });
            }
        }
        this.stateMachine.showBoard();
        this.broadcastRoomState();
        return { success: true };
    }

    resetToLobby() {
        this.touch();
        if (this.thinkingTimer) clearTimeout(this.thinkingTimer);
        if (this.answerTimer) clearTimeout(this.answerTimer);
        if (this.readingTimer) clearTimeout(this.readingTimer);
        this.thinkingTimer = null;
        this.answerTimer = null;
        this.readingTimer = null;
        this.remainingReadingTime = 0;
        this.remainingThinkingTime = 0;
        this.remainingAnswerTime = 0;
        this.currentRoundIndex = 0;
        this.currentThemeIndex = null;
        this.currentQuestion = null;
        this.currentThemeName = '';
        this.activeBuzzerPlayerId = null;
        this.buzzedPlayers.clear();
        this.passedPlayers.clear();
        this.allowedBuzzerPlayerIds = null;
        this.catTargetPlayerId = null;
        this.auctionLeaderPlayerId = null;
        this.auctionBets.clear();
        this.auctionAnswers.clear();
        this.biddingPlayerIds = [];
        const wasPaused = this.isPaused;
        this.isPaused = false;
        this.pauseReason = null;
        this.disconnectedPlayerIds.clear();

        // Reset question used states in currentPack
        if (this.currentPack && Array.isArray(this.currentPack)) {
            this.currentPack.forEach(r => {
                (r.themes || []).forEach(th => {
                    (th.questions || []).forEach(q => {
                        q.used = false;
                    });
                });
            });
        }

        // Reset player scores for new game
        for (const p of this.players.values()) {
            p.score = 0;
        }

        this.stateMachine = new GameStateMachine();
        this.stateMachine.startLobby();
        if (wasPaused) this.broadcastToAll(MSG_TYPES.GAME_PAUSED, { isPaused: false });
        this.broadcastRoomState();
        return { success: true };
    }

    selectQuestion(themeIdx, questionIdx, questionData) {
        this.touch();
        if (this.isPaused) this.setPaused(false);
        if (this.answerTimer) {
            clearTimeout(this.answerTimer);
            this.answerTimer = null;
        }
        this.currentThemeIndex = themeIdx;
        this.currentQuestionIndex = questionIdx;

        let themeName = '';
        if (this.currentPack && this.currentPack[this.currentRoundIndex] && this.currentPack[this.currentRoundIndex].themes && this.currentPack[this.currentRoundIndex].themes[themeIdx]) {
            themeName = this.currentPack[this.currentRoundIndex].themes[themeIdx].name || '';
        }
        this.currentThemeName = themeName;

        let resolvedQuestion = questionData;
        if (!resolvedQuestion && this.currentPack && this.currentPack[this.currentRoundIndex]) {
            const th = this.currentPack[this.currentRoundIndex].themes && this.currentPack[this.currentRoundIndex].themes[themeIdx];
            resolvedQuestion = th && th.questions && th.questions[questionIdx];
        }
        if (this.currentPack && this.currentPack[this.currentRoundIndex] && this.currentPack[this.currentRoundIndex].themes && this.currentPack[this.currentRoundIndex].themes[themeIdx] && this.currentPack[this.currentRoundIndex].themes[themeIdx].questions && this.currentPack[this.currentRoundIndex].themes[themeIdx].questions[questionIdx]) {
            this.currentPack[this.currentRoundIndex].themes[themeIdx].questions[questionIdx].used = true;
        }
        if (resolvedQuestion) {
            resolvedQuestion.theme = themeName;
            resolvedQuestion.themeName = themeName;
        }
        this.currentQuestion = resolvedQuestion;
        this.currentCost = (resolvedQuestion && (resolvedQuestion.cost !== undefined ? resolvedQuestion.cost : resolvedQuestion.price)) ? Number(resolvedQuestion.cost !== undefined ? resolvedQuestion.cost : resolvedQuestion.price) : 100;
        this.activeBuzzerPlayerId = null;
        this.buzzedPlayers.clear();
        this.passedPlayers.clear();
        this.allowedBuzzerPlayerIds = null;
        this.catTargetPlayerId = null;
        this.auctionLeaderPlayerId = null;
        this.auctionBets.clear();
        this.auctionAnswers.clear();
        this.biddingPlayerIds = [];
        this.auctionAnswersLocked = false;

        const qType = (resolvedQuestion && resolvedQuestion.type) ? resolvedQuestion.type : 'normal';

        try {
            if (this.stateMachine.state !== 'BOARD') {
                this.stateMachine.showBoard();
            }
            this.stateMachine.startQuestion(questionData, { turnTeamId: null });
        } catch (err) {
            console.warn('[Room] stateMachine.startQuestion fallback:', err.message);
            this.stateMachine.state = (qType === 'cat' || qType === 'secret')
                ? 'CAT_CHOOSING'
                : ((qType === 'auction' || qType === 'auction_all' || qType === 'auction_leader')
                    ? 'AUCTION_BETTING'
                    : 'QUESTION_READING');
        }

        // Send full question to host (both PC screen and mobile host)
        this.sendToHost(MSG_TYPES.QUESTION_ACTIVE, {
            themeIdx,
            questionIdx,
            themeName,
            state: this.stateMachine.state,
            questionType: qType,
            cost: this.currentCost,
            readingTime: this.options.readingTime,
            thinkingTime: this.options.thinkingTime,
            question: this.currentQuestion // Host gets full question with 'a', 'comment', etc.
        });

        // Anti-Cheat: sanitize question before sending to players!
        const sanitizedQuestion = PackParser.sanitizeQuestionForPlayer(this.currentQuestion);
        this.broadcastToPlayers(MSG_TYPES.QUESTION_ACTIVE, {
            themeIdx,
            questionIdx,
            themeName,
            state: this.stateMachine.state,
            questionType: qType,
            cost: this.currentCost,
            readingTime: this.options.readingTime,
            thinkingTime: this.options.thinkingTime,
            question: sanitizedQuestion // Players get NO 'a' or 'a_img'
        });

        if (this.readingTimer) clearTimeout(this.readingTimer);
        if (this.thinkingTimer) clearTimeout(this.thinkingTimer);
        this.readingTimer = null;
        this.thinkingTimer = null;
        this.remainingThinkingTime = (this.options.thinkingTime !== undefined) ? this.options.thinkingTime : 30;
        this.thinkingTimerStartedAt = null;

        if (this.isSpecialType(qType)) {
            // Cat / auction: nothing runs until the host assigns the answering team / closes the bets
            this.remainingReadingTime = 0;
        } else {
            this.beginReading();
        }

        return { success: true };
    }

    isSpecialType(qType) {
        return ['cat', 'secret', 'auction', 'auction_all', 'auction_leader'].includes(qType);
    }

    /**
     * Starts the reading countdown; when it ends (or at once when reading time is 0) the buzzer opens.
     */
    beginReading() {
        if (this.readingTimer) clearTimeout(this.readingTimer);
        this.readingTimer = null;
        const rTime = (this.options.readingTime !== undefined) ? this.options.readingTime : 7;
        this.readingTimerDuration = rTime;
        this.remainingReadingTime = rTime;
        this.readingTimerStartedAt = Date.now();

        if (rTime <= 0) {
            this.activateBuzzer();
        } else if (!this.isPaused) {
            this.readingTimer = setTimeout(() => {
                this.activateBuzzer();
            }, rTime * 1000);
            if (this.readingTimer.unref) this.readingTimer.unref();
        }
    }

    activateBuzzer(allowedPlayerIds = null) {
        this.touch();
        if (this.readingTimer) {
            clearTimeout(this.readingTimer);
            this.readingTimer = null;
        }
        this.remainingReadingTime = 0;

        const qType = (this.currentQuestion && this.currentQuestion.type) ? this.currentQuestion.type : 'normal';

        // Requirement 3: If open auction, start auction typing mode instead of buzzer race!
        if (qType === 'auction' || qType === 'auction_all') {
            return this.startAuctionAnswer();
        }

        try {
            if (this.stateMachine.state !== 'QUESTION_READING') {
                this.stateMachine.state = 'QUESTION_READING';
            }
            this.stateMachine.openBuzzer();
        } catch (err) {
            console.warn('[Room] openBuzzer fallback:', err.message);
            this.stateMachine.state = 'BUZZ_ACTIVE';
        }

        // Requirement 2: Cat in bag -> only recipient team gets buzzer
        // Requirement 4: Auction for leader -> only leader team gets buzzer
        let allowed = allowedPlayerIds;
        if (!allowed || !Array.isArray(allowed)) {
            if ((qType === 'cat' || qType === 'secret') && this.catTargetPlayerId) {
                allowed = [this.catTargetPlayerId];
            } else if (qType === 'auction_leader' && this.auctionLeaderPlayerId) {
                allowed = [this.auctionLeaderPlayerId];
            }
        }

        if (allowed && Array.isArray(allowed) && allowed.length > 0) {
            this.allowedBuzzerPlayerIds = allowed;
        } else {
            this.allowedBuzzerPlayerIds = Array.from(this.players.keys()).filter(id => !this.buzzedPlayers.has(id) && !this.passedPlayers.has(id));
        }

        if (this.thinkingTimer) {
            clearTimeout(this.thinkingTimer);
            this.thinkingTimer = null;
            if (this.thinkingTimerStartedAt) {
                const elapsed = (Date.now() - this.thinkingTimerStartedAt) / 1000;
                this.remainingThinkingTime = Math.max(0, (this.remainingThinkingTime || this.options.thinkingTime || 30) - elapsed);
            }
        }
        const tTime = Math.max(1, (this.remainingThinkingTime !== undefined) ? Math.round(this.remainingThinkingTime) : ((this.options.thinkingTime !== undefined) ? this.options.thinkingTime : 30));
        if (this.isPaused) {
            // Frozen: timer restarts from the saved remainder on resume
            this.remainingThinkingTime = tTime;
            this.thinkingTimerStartedAt = null;
        } else {
            this.thinkingTimerStartedAt = Date.now();
        }
        if (tTime > 0 && !this.isPaused) {
            this.thinkingTimer = setTimeout(() => {
                this.handleThinkingTimeout();
            }, tTime * 1000);
            if (this.thinkingTimer.unref) this.thinkingTimer.unref();
        }

        this.broadcastToAll(MSG_TYPES.BUZZER_READY, {
            cost: this.currentCost,
            thinkingTime: tTime,
            remainingThinkingTime: tTime,
            allowedPlayerIds: this.allowedBuzzerPlayerIds
        });
    }

    startAuctionAnswer(biddingPlayerIds = null) {
        this.touch();
        if (this.stateMachine.state === 'AUCTION_ANSWERING') {
            return { success: true, already: true }; // duplicate start (e.g. from the PC screen)
        }
        if (this.readingTimer) {
            clearTimeout(this.readingTimer);
            this.readingTimer = null;
        }
        this.remainingReadingTime = 0;

        let allowed = Array.isArray(biddingPlayerIds) ? biddingPlayerIds.filter(id => this.players.has(id)) : null;
        if (!allowed || allowed.length === 0) {
            if (this.auctionBets && this.auctionBets.size > 0) {
                allowed = Array.from(this.auctionBets.entries())
                    .filter(([id, b]) => {
                        const val = (typeof b === 'object' && b !== null) ? b.val : Number(b);
                        const passed = (typeof b === 'object' && b !== null) ? Boolean(b.isPassed) : false;
                        return val > 0 && !passed && this.players.has(id);
                    })
                    .map(([id]) => id);
            } else {
                allowed = Array.from(this.players.values())
                    .filter(p => p.isConnected && p.role !== 'host')
                    .map(p => p.id);
            }
        }
        if (allowed.length === 0) {
            return { success: false, message: 'Никто не сделал ставку' };
        }

        this.stateMachine.state = 'AUCTION_ANSWERING';
        this.auctionAnswers = new Map();
        this.auctionAnswersLocked = false;
        this.biddingPlayerIds = allowed;

        const betsObj = {};
        for (const [id, b] of (this.auctionBets ? this.auctionBets.entries() : [])) {
            betsObj[id] = (typeof b === 'object' && b !== null) ? b.val : Number(b);
        }

        const answerTime = AUCTION_ANSWER_SECONDS;
        this.broadcastToAll(MSG_TYPES.AUCTION_ANSWER_START, {
            themeIdx: this.currentThemeIndex,
            questionIdx: this.currentQuestionIndex,
            cost: this.currentCost,
            thinkingTime: answerTime,
            answerTime,
            biddingPlayerIds: this.biddingPlayerIds,
            bets: betsObj
        });

        // Typing window: after it ends answers are locked, the host still judges what came in
        this.remainingThinkingTime = answerTime;
        if (this.thinkingTimer) clearTimeout(this.thinkingTimer);
        this.thinkingTimerStartedAt = null;
        if (!this.isPaused) {
            this.thinkingTimerStartedAt = Date.now();
            this.thinkingTimer = setTimeout(() => this.handleAuctionAnswerTimeout(), answerTime * 1000);
            if (this.thinkingTimer.unref) this.thinkingTimer.unref();
        }
        return { success: true };
    }

    handleAuctionAnswerTimeout() {
        this.touch();
        if (this.thinkingTimer) {
            clearTimeout(this.thinkingTimer);
            this.thinkingTimer = null;
        }
        this.remainingThinkingTime = 0;
        if (this.stateMachine.state !== 'AUCTION_ANSWERING') return;
        this.auctionAnswersLocked = true;
        this.broadcastToAll(MSG_TYPES.ANSWER_TIMEOUT, { message: 'Время на ответ истекло!', isAuction: true });
    }

    /**
     * Cat in the bag: the host (phone or PC) names the answering player; the question then starts.
     */
    setCatTarget(targetPlayerId, fromPlayerId = null) {
        this.touch();
        const targetPlayer = this.players.get(targetPlayerId);
        if (!targetPlayer) return { success: false, message: 'Игрок не найден' };
        if (this.catTargetPlayerId === targetPlayerId && this.stateMachine.state !== 'CAT_CHOOSING') {
            return { success: true, already: true }; // duplicate (e.g. echo from the PC screen)
        }
        this.catTargetPlayerId = targetPlayerId;
        const fromPlayer = fromPlayerId ? this.players.get(fromPlayerId) : null;
        this.broadcastToAll(MSG_TYPES.CAT_TRANSFERRED, {
            fromPlayerId: fromPlayerId || undefined,
            fromPlayerName: fromPlayer ? fromPlayer.name : undefined,
            toPlayerId: targetPlayerId,
            toPlayerName: targetPlayer.name
        });
        if (this.stateMachine.state === 'CAT_CHOOSING') {
            try {
                this.stateMachine.transferCat(targetPlayerId);
            } catch (err) {
                this.stateMachine.state = 'QUESTION_READING';
            }
            this.beginReading();
        }
        return { success: true };
    }

    /**
     * Auction for the right to answer: the host names the leader (highest bid); only the leader may buzz.
     */
    setAuctionLeader(leaderPlayerId, maxBet) {
        this.touch();
        const leader = this.players.get(leaderPlayerId);
        if (!leader) return { success: false, message: 'Игрок не найден' };
        if (this.auctionLeaderPlayerId === leaderPlayerId && this.stateMachine.state !== 'AUCTION_BETTING') {
            return { success: true, already: true };
        }
        this.auctionLeaderPlayerId = leaderPlayerId;
        let bet = Number(maxBet);
        if (!Number.isFinite(bet) || bet <= 0) bet = this.getAuctionBet(leaderPlayerId);
        this.currentCost = bet;
        this.broadcastToAll(MSG_TYPES.AUCTION_LEADER_SET, {
            leaderPlayerId,
            leaderPlayerName: leader.name,
            bet,
            cost: bet
        });
        if (this.stateMachine.state === 'AUCTION_BETTING') {
            try {
                this.stateMachine.startReading();
            } catch (err) {
                this.stateMachine.state = 'QUESTION_READING';
            }
            this.beginReading();
        }
        return { success: true };
    }

    setAuctionBets(bets) {
        this.touch();
        if (!this.auctionBets) this.auctionBets = new Map();
        if (bets && typeof bets === 'object') {
            const entries = (bets instanceof Map) ? bets.entries() : Object.entries(bets);
            for (const [id, b] of entries) {
                this.auctionBets.set(id, b);
            }
        }
        return this.auctionBets;
    }

    getAuctionBet(playerId) {
        if (!this.auctionBets || !this.auctionBets.has(playerId)) return this.currentCost;
        const b = this.auctionBets.get(playerId);
        return (typeof b === 'object' && b !== null) ? (b.val || this.currentCost) : Number(b) || this.currentCost;
    }

    handleBuzz(playerId) {
        this.touch();
        if (this.isPaused) {
            return { success: false, reason: 'PAUSED', error: ERROR_CODES.INVALID_ACTION, message: 'Игра на паузе' };
        }

        if (this.stateMachine.state !== 'BUZZ_ACTIVE') {
            return { success: false, error: ERROR_CODES.INVALID_ACTION, message: 'Кнопка ответа сейчас не активна' };
        }

        if (this.allowedBuzzerPlayerIds && (this.allowedBuzzerPlayerIds.length === 0 || !this.allowedBuzzerPlayerIds.includes(playerId))) {
            return { success: false, error: ERROR_CODES.INVALID_ACTION, message: 'Этот вопрос предназначен для другой команды' };
        }

        if (this.buzzedPlayers.has(playerId)) {
            return { success: false, error: ERROR_CODES.INVALID_ACTION, message: 'Вы уже отвечали на этот вопрос' };
        }
        if (this.passedPlayers.has(playerId)) {
            return { success: false, error: ERROR_CODES.INVALID_ACTION, message: 'Вы спасовали на этом вопросе' };
        }

        const player = this.players.get(playerId);
        if (!player) {
            return { success: false, error: ERROR_CODES.INVALID_ACTION, message: 'Игрок не найден' };
        }

        // Lock first buzzer winner
        if (this.thinkingTimer) {
            clearTimeout(this.thinkingTimer);
            this.thinkingTimer = null;
        }
        if (this.thinkingTimerStartedAt) {
            const elapsed = (Date.now() - this.thinkingTimerStartedAt) / 1000;
            this.remainingThinkingTime = Math.max(0, (this.remainingThinkingTime !== undefined ? this.remainingThinkingTime : (this.options.thinkingTime || 30)) - elapsed);
            this.thinkingTimerStartedAt = null;
        }
        this.buzzedPlayers.add(playerId);
        this.activeBuzzerPlayerId = playerId;
        this.stateMachine.registerBuzz(playerId);

        const ansTime = (this.options.answerTime !== undefined) ? this.options.answerTime : 5;
        this.answerTimerDuration = ansTime;
        this.remainingAnswerTime = ansTime;
        this.answerTimerStartedAt = Date.now();

        this.broadcastToAll(MSG_TYPES.BUZZ_LOCKED, {
            playerId,
            playerName: player.name,
            avatar: player.avatar || '👤',
            cost: this.currentCost,
            answerTime: ansTime
        });

        // Start answer countdown timer
        if (this.answerTimer) clearTimeout(this.answerTimer);
        this.answerTimer = setTimeout(() => {
            this.handleAnswerTimeout();
        }, ansTime * 1000);
        if (this.answerTimer.unref) this.answerTimer.unref();

        return { success: true, winner: player };
    }

    handleAnswerSubmit(playerId, rawAnswerText) {
        this.touch();
        const answerText = String(rawAnswerText ?? '').slice(0, 300);
        const isAuctionAnswering = (this.stateMachine.state === 'AUCTION_ANSWERING' ||
            (this.currentQuestion && (this.currentQuestion.type === 'auction' || this.currentQuestion.type === 'auction_all')));

        if (!isAuctionAnswering && (this.stateMachine.state !== 'ANSWERING' || this.activeBuzzerPlayerId !== playerId)) {
            return { success: false, error: ERROR_CODES.INVALID_ACTION, message: 'Сейчас не ваша очередь отвечать' };
        }

        if (isAuctionAnswering) {
            if (this.biddingPlayerIds && this.biddingPlayerIds.length > 0 && !this.biddingPlayerIds.includes(playerId)) {
                return { success: false, error: ERROR_CODES.INVALID_ACTION, message: 'Вы не делали ставку на этом аукционе' };
            }
            if (this.auctionAnswersLocked) {
                return { success: false, error: ERROR_CODES.INVALID_ACTION, message: 'Время на ответ истекло' };
            }
            if (!this.auctionAnswers) this.auctionAnswers = new Map();
            this.auctionAnswers.set(playerId, { answerText, timestamp: Date.now() });

            const player = this.players.get(playerId);
            const betVal = this.getAuctionBet(playerId);

            this.broadcastToAll(MSG_TYPES.ANSWER_SUBMITTED, {
                playerId,
                playerName: player ? player.name : '',
                avatar: player ? player.avatar : '👤',
                answerText,
                bet: betVal,
                isAuction: true
            });
            return { success: true, isAuction: true };
        }

        const player = this.players.get(playerId);
        this.broadcastToAll(MSG_TYPES.ANSWER_SUBMITTED, {
            playerId,
            playerName: player ? player.name : '',
            avatar: player ? player.avatar : '👤',
            answerText,
            isAuction: false
        });
        return { success: true };
    }

    /**
     * A player declines to answer the current question. Not allowed for players who are obliged to
     * answer (cat target, auction leader, auction bidders). Closes the question when nobody is left.
     */
    handlePass(playerId) {
        this.touch();
        const player = this.players.get(playerId);
        if (!player) return { success: false, error: ERROR_CODES.INVALID_ACTION, message: 'Игрок не найден' };
        if (this.isPaused) return { success: false, error: ERROR_CODES.INVALID_ACTION, message: 'Игра на паузе' };
        const state = this.stateMachine.state;
        if (state !== 'QUESTION_READING' && state !== 'BUZZ_ACTIVE') {
            return { success: false, error: ERROR_CODES.INVALID_ACTION, message: 'Сейчас нельзя спасовать' };
        }
        const mustAnswer = this.catTargetPlayerId === playerId
            || this.auctionLeaderPlayerId === playerId
            || (this.biddingPlayerIds || []).includes(playerId);
        if (mustAnswer) {
            return { success: false, error: ERROR_CODES.INVALID_ACTION, message: 'Вы обязаны ответить на этот вопрос' };
        }
        if (this.activeBuzzerPlayerId) {
            return { success: false, error: ERROR_CODES.INVALID_ACTION, message: 'Сейчас отвечает другой игрок' };
        }
        if (this.buzzedPlayers.has(playerId) || this.passedPlayers.has(playerId)) {
            return { success: false, error: ERROR_CODES.INVALID_ACTION, message: 'Вы уже вышли из этого вопроса' };
        }

        this.passedPlayers.add(playerId);
        this.broadcastToAll(MSG_TYPES.PLAYER_PASSED, { playerId, playerName: player.name });

        if (this.getEligibleBuzzerIds().length === 0) {
            // Nobody wants to answer: reveal the answer on the big screen; the host returns to the board
            this.revealAndFinishQuestion();
        }
        return { success: true };
    }

    /**
     * Finishes the question but keeps it on the big screen with the answer shown.
     * The board is shown only when the host presses "К табло" (HOST_CLOSE_QUESTION).
     */
    revealAndFinishQuestion() {
        const answer = (this.currentQuestion && this.currentQuestion.a) || '';
        const comment = (this.currentQuestion && this.currentQuestion.comment) || '';
        this.finishQuestion();
        this.broadcastToAll(MSG_TYPES.SHOW_ANSWER, { answer, comment });
    }

    handleAuctionBet(playerId, amount) {
        this.touch();
        const player = this.players.get(playerId);
        if (!player) return;
        const inBetting = this.stateMachine.state === 'AUCTION_BETTING';
        const qType = (this.currentQuestion && this.currentQuestion.type) || 'normal';
        if (!inBetting && ['auction', 'auction_all', 'auction_leader'].includes(qType)) return; // bets are closed

        let val = Math.round(Number(amount) || 0);
        if (inBetting && val > 0) {
            // Same limits the PC screen used to enforce: nominal .. max(nominal, own score)
            const minBet = this.currentCost;
            const maxBet = Math.max(this.currentCost, player.score || 0);
            val = Math.min(Math.max(val, minBet), maxBet);
        } else if (val < 0) {
            val = 0;
        }
        if (!this.auctionBets) this.auctionBets = new Map();
        this.auctionBets.set(playerId, { val, isPassed: val <= 0 });

        this.broadcastToAll(MSG_TYPES.AUCTION_BET_MADE, {
            playerId,
            playerName: player.name,
            amount: val
        });
    }

    handleCatTransfer(fromPlayerId, toPlayerId) {
        return this.setCatTarget(toPlayerId, fromPlayerId);
    }

        handleThinkingTimeout() {
        this.touch();
        if (this.thinkingTimer) {
            clearTimeout(this.thinkingTimer);
            this.thinkingTimer = null;
        }
        this.remainingThinkingTime = 0;
        if (this.stateMachine.state === 'BUZZ_ACTIVE' || this.stateMachine.state === 'QUESTION_READING') {
            this.activeBuzzerPlayerId = null;
            this.allowedBuzzerPlayerIds = [];
            this.stateMachine.state = 'QUESTION_CLOSED';
            this.broadcastToAll(MSG_TYPES.ANSWER_TIMEOUT, {
                message: 'Время на вопрос истекло!'
            });
            this.broadcastRoomState();
            this.showAnswer();
        }
    }

    nextRound() {
        this.touch();
        if (this.thinkingTimer) clearTimeout(this.thinkingTimer);
        this.thinkingTimer = null;

        if (this.currentPack && this.currentRoundIndex + 1 < this.currentPack.length) {
            this.currentRoundIndex++;
            this.stateMachine.currentRound = this.currentRoundIndex;
            try {
                this.stateMachine.showBoard(this.currentRoundIndex, this.currentPack.length);
            } catch {
                this.stateMachine.state = 'BOARD';
            }
            this.broadcastToAll(MSG_TYPES.ROUND_CHANGED, {
                roundIndex: this.currentRoundIndex,
                roundName: this.currentPack[this.currentRoundIndex]?.roundName || ('????? ' + (this.currentRoundIndex + 1))
            });
            this.broadcastRoomState();
        } else {
            this.stateMachine.state = 'GAME_OVER';
            this.broadcastRoomState();
        }
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

        // Points are NOT automatically deducted on answer timeout

        // Check if there are other eligible players
        const remainingPlayers = this.getEligibleBuzzerIds();
        if (remainingPlayers.length > 0) {
            this.stateMachine.state = 'BUZZ_ACTIVE';
            this.activateBuzzer(remainingPlayers);
        } else {
            // Nobody left to answer: show the answer on the big screen, the host returns to the board
            this.revealAndFinishQuestion();
        }
    }

    judgeAnswer(isCorrect, withPenalty = undefined) {
        this.touch();
        if (this.answerTimer) {
            clearTimeout(this.answerTimer);
            this.answerTimer = null;
        }

        let answeringPlayerId = this.activeBuzzerPlayerId;
        if (!answeringPlayerId && (this.stateMachine.state === 'AUCTION_ANSWERING' || (this.currentQuestion && (this.currentQuestion.type === 'auction' || this.currentQuestion.type === 'auction_all')))) {
            if (this.biddingPlayerIds && this.biddingPlayerIds.length > 0) {
                answeringPlayerId = this.biddingPlayerIds[0];
            } else if (this.auctionAnswers && this.auctionAnswers.size > 0) {
                answeringPlayerId = Array.from(this.auctionAnswers.keys())[0];
            }
        }
        if (!answeringPlayerId) {
            return { success: false, message: 'Нет отвечающего игрока' };
        }

        const answeringPlayer = this.players.get(answeringPlayerId);
        const answeringPlayerName = answeringPlayer ? answeringPlayer.name : 'Игрок';

        const isAuction = (this.stateMachine.state === 'AUCTION_ANSWERING' || (this.currentQuestion && (this.currentQuestion.type === 'auction' || this.currentQuestion.type === 'auction_all')));
        const costToApply = isAuction ? this.getAuctionBet(answeringPlayerId) : this.currentCost;

        if (isCorrect) {
            this.updatePlayerScore(answeringPlayerId, costToApply);
            this.broadcastToAll(MSG_TYPES.JUDGE_RESULT, {
                isCorrect: true,
                playerId: answeringPlayerId,
                playerName: answeringPlayerName,
                cost: costToApply,
                reopened: false
            });
            this.finishQuestion();
            return { success: true, correct: true, playerId: answeringPlayerId };
        } else {
            const shouldPenalize = withPenalty !== undefined ? Boolean(withPenalty) : (this.options.penaltyEnabled !== false);
            // Explicit "reject with penalty" from the host works even if penalties are off in settings
            const penalty = shouldPenalize
                ? (this.options.penaltyEnabled === false ? costToApply : this.getPenaltyAmount(costToApply))
                : 0;
            if (penalty > 0) {
                this.updatePlayerScore(answeringPlayerId, -penalty);
            }
            this.activeBuzzerPlayerId = null;

            // Check if others can buzz
            const remainingPlayers = isAuction ? [] : this.getEligibleBuzzerIds();
            if (remainingPlayers.length > 0) {
                this.broadcastToAll(MSG_TYPES.JUDGE_RESULT, {
                    isCorrect: false,
                    playerId: answeringPlayerId,
                    playerName: answeringPlayerName,
                    cost: penalty,
                    reopened: true
                });
                this.stateMachine.state = 'BUZZ_ACTIVE';
                this.activateBuzzer(remainingPlayers);
                return { success: true, correct: false, reopened: true };
            } else {
                this.broadcastToAll(MSG_TYPES.JUDGE_RESULT, {
                    isCorrect: false,
                    playerId: answeringPlayerId,
                    playerName: answeringPlayerName,
                    cost: penalty,
                    reopened: false
                });
                this.finishQuestion();
                return { success: true, correct: false, reopened: false };
            }
        }
    }

    togglePause(isPaused = null) {
        this.touch();
        const target = (typeof isPaused === 'boolean') ? isPaused : !this.isPaused;
        this.setPaused(target, 'host');
    }

    /**
     * Freezes / resumes all running question timers and notifies everyone.
     * Idempotent: repeated calls with the same value only re-broadcast the state.
     */
    setPaused(paused, reason = 'host', extraPayload = {}) {
        if (paused !== this.isPaused) {
            this.isPaused = paused;
            this.pauseReason = paused ? reason : null;
            if (paused) {
                this.freezeTimers();
            } else {
                this.disconnectedPlayerIds.clear();
                this.resumeTimers();
            }
        }
        this.broadcastToAll(MSG_TYPES.GAME_PAUSED, {
            isPaused: this.isPaused,
            ...(this.isPaused && this.pauseReason === 'disconnect' ? { reason: 'disconnect' } : {}),
            ...extraPayload
        });
    }

    freezeTimers() {
        if (this.readingTimer) {
            clearTimeout(this.readingTimer);
            this.readingTimer = null;
            const elapsed = (Date.now() - (this.readingTimerStartedAt || Date.now())) / 1000;
            this.remainingReadingTime = Math.max(0.5, (this.readingTimerDuration || 7) - elapsed);
        }
        if (this.thinkingTimer) {
            clearTimeout(this.thinkingTimer);
            this.thinkingTimer = null;
            const elapsed = (Date.now() - (this.thinkingTimerStartedAt || Date.now())) / 1000;
            this.remainingThinkingTime = Math.max(0.5, (this.remainingThinkingTime || this.options.thinkingTime || 30) - elapsed);
            this.thinkingTimerStartedAt = null;
        }
        if (this.answerTimer) {
            clearTimeout(this.answerTimer);
            this.answerTimer = null;
            const elapsed = (Date.now() - (this.answerTimerStartedAt || Date.now())) / 1000;
            this.remainingAnswerTime = Math.max(0.5, (this.answerTimerDuration || 5) - elapsed);
        }
    }

    resumeTimers() {
        if (this.stateMachine.state === 'QUESTION_READING' && this.remainingReadingTime > 0) {
            const rem = this.remainingReadingTime;
            this.readingTimerStartedAt = Date.now();
            this.readingTimerDuration = rem;
            this.readingTimer = setTimeout(() => {
                this.activateBuzzer();
            }, rem * 1000);
            if (this.readingTimer.unref) this.readingTimer.unref();
        } else if (this.stateMachine.state === 'BUZZ_ACTIVE' && this.remainingThinkingTime > 0) {
            const rem = this.remainingThinkingTime;
            this.thinkingTimerStartedAt = Date.now();
            this.thinkingTimer = setTimeout(() => {
                this.handleThinkingTimeout();
            }, rem * 1000);
            if (this.thinkingTimer.unref) this.thinkingTimer.unref();
        } else if (this.stateMachine.state === 'AUCTION_ANSWERING' && !this.auctionAnswersLocked && this.remainingThinkingTime > 0) {
            const rem = this.remainingThinkingTime;
            this.thinkingTimerStartedAt = Date.now();
            this.thinkingTimer = setTimeout(() => {
                this.handleAuctionAnswerTimeout();
            }, rem * 1000);
            if (this.thinkingTimer.unref) this.thinkingTimer.unref();
        } else if (this.stateMachine.state === 'ANSWERING' && this.activeBuzzerPlayerId && this.remainingAnswerTime > 0) {
            const rem = this.remainingAnswerTime;
            this.answerTimerStartedAt = Date.now();
            this.answerTimerDuration = rem;
            this.answerTimer = setTimeout(() => {
                this.handleAnswerTimeout();
            }, rem * 1000);
            if (this.answerTimer.unref) this.answerTimer.unref();
        }
    }

    /**
     * A participant dropped while the game is running: freeze the game until they are back.
     */
    pauseForDisconnect(participantId, participantName) {
        const state = this.stateMachine.state;
        if (state === 'INIT' || state === 'LOBBY' || state === 'GAME_OVER') return;
        if (this.isPaused && this.pauseReason !== 'disconnect') return; // host pause wins
        this.disconnectedPlayerIds.add(participantId);
        this.setPaused(true, 'disconnect', { disconnectedPlayerName: participantName });
    }

    /**
     * Called when a participant is back: unfreezes the game once nobody is missing.
     */
    resumeAfterReconnect(participantId) {
        if (!this.isPaused || this.pauseReason !== 'disconnect') return;
        this.disconnectedPlayerIds.delete(participantId);
        if (this.disconnectedPlayerIds.size === 0) {
            this.setPaused(false);
        }
    }

    isGameRunning() {
        return !['INIT', 'LOBBY', 'GAME_OVER'].includes(this.stateMachine.state);
    }

    skipRound() {
        this.touch();
        if (!this.isGameRunning()) return;
        const isLastRound = Boolean(this.currentPack) && this.currentRoundIndex >= this.currentPack.length - 1;
        if (this.currentPack && !isLastRound) {
            this.currentRoundIndex++;
            this.stateMachine.currentRound = this.currentRoundIndex;
        }
        this.finishQuestion();
        if (isLastRound) {
            this.stateMachine.state = 'GAME_OVER';
        }
        this.broadcastToAll(MSG_TYPES.ROUND_SKIPPED, {
            roundIndex: this.currentRoundIndex,
            isGameOver: isLastRound
        });
        this.broadcastRoomState();
    }

    passTurn() {
        this.touch();
        if (!this.isGameRunning()) return;
        this.broadcastToAll(MSG_TYPES.TURN_PASSED, {});
    }

    updateAllScores(delta) {
        this.touch();
        const numDelta = Number(delta) || 0;
        if (numDelta === 0) return;
        for (const player of this.players.values()) {
            player.score += numDelta;
        }
        this.broadcastToAll(MSG_TYPES.SCORE_UPDATED, {
            delta: numDelta,
            isAll: true,
            players: this.getSanitizedPlayers()
        });
        this.broadcastRoomState();
    }

    showAnswer() {
        this.touch();
        this.broadcastToAll(MSG_TYPES.SHOW_ANSWER, {
            answer: (this.currentQuestion && this.currentQuestion.a) || '',
            comment: (this.currentQuestion && this.currentQuestion.comment) || ''
        });
    }

    closeQuestion() {
        this.touch();
        this.finishQuestion();
        this.broadcastToAll(MSG_TYPES.QUESTION_CLOSED, {});
    }

    finishGame(payload = {}) {
        this.touch();
        if (this.stateMachine && typeof this.stateMachine.finishGame === 'function') {
            try {
                this.stateMachine.finishGame();
            } catch (e) {
                this.stateMachine.state = 'GAME_OVER';
            }
        } else if (this.stateMachine) {
            this.stateMachine.state = 'GAME_OVER';
        }
        this.broadcastToAll(MSG_TYPES.GAME_FINISHED, payload);
        this.broadcastRoomState();
    }

    updatePlayerScore(playerId, delta) {
        this.touch();
        const player = this.players.get(playerId);
        if (player) {
            const numDelta = Number(delta) || 0;
            player.score += numDelta;
            this.broadcastToAll(MSG_TYPES.SCORE_UPDATED, {
                playerId,
                playerName: player.name,
                newScore: player.score,
                delta: numDelta,
                players: this.getSanitizedPlayers()
            });
        }
    }

    finishQuestion() {
        this.touch();
        if (this.answerTimer) clearTimeout(this.answerTimer);
        if (this.readingTimer) clearTimeout(this.readingTimer);
        if (this.thinkingTimer) clearTimeout(this.thinkingTimer);
        this.answerTimer = null;
        this.readingTimer = null;
        this.thinkingTimer = null;
        this.remainingReadingTime = 0;
        this.remainingAnswerTime = 0;
        this.currentThemeName = '';
        this.activeBuzzerPlayerId = null;
        this.allowedBuzzerPlayerIds = null;
        this.catTargetPlayerId = null;
        this.auctionLeaderPlayerId = null;
        this.auctionBets.clear();
        this.auctionAnswers.clear();
        this.biddingPlayerIds = [];
        this.auctionAnswersLocked = false;
        this.passedPlayers.clear();
        this.currentQuestion = null;

        let allUsed = false;
        if (this.currentPack && this.currentPack[this.currentRoundIndex]) {
            const currentRound = this.currentPack[this.currentRoundIndex];
            allUsed = (currentRound.themes || []).every(th => (th.questions || []).every(q => q.used));
        }

        if (allUsed) {
            if (this.currentRoundIndex + 1 >= (this.currentPack ? this.currentPack.length : 1)) {
                this.stateMachine.state = 'GAME_OVER';
            } else {
                this.stateMachine.state = 'ROUND_END';
            }
        } else {
            try {
                this.stateMachine.showBoard();
            } catch {
                this.stateMachine.state = 'BOARD';
            }
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

        let boardData = null;
        if (!forPlayer && this.currentPack && this.currentPack[this.currentRoundIndex]) {
            const currentRound = this.currentPack[this.currentRoundIndex];
            boardData = {
                roundIndex: this.currentRoundIndex,
                roundName: currentRound.roundName || ('Раунд ' + (this.currentRoundIndex + 1)),
                themes: (currentRound.themes || []).map((th, tIdx) => ({
                    themeIdx: tIdx,
                    name: th.name,
                    questions: (th.questions || []).map((q, qIdx) => ({
                        questionIdx: qIdx,
                        cost: (q.cost !== undefined ? q.cost : q.price) || 100,
                        used: Boolean(q.used),
                        type: q.type || 'normal'
                    }))
                }))
            };
        }

        const startCheck = this.canStartGame();
        const resolvedHost = (this.hostPlayer && this.hostPlayer.isConnected)
            ? this.sanitizeHost(this.hostPlayer)
            : (this.isHostOnPC ? { id: 'host_pc', name: 'Ведущий (ПК)', role: 'host', isConnected: true } : (this.hostPlayer ? this.sanitizeHost(this.hostPlayer) : null));

        let currentThemeName = this.currentThemeName || '';
        if (!currentThemeName && this.currentThemeIndex !== null && this.currentPack && this.currentPack[this.currentRoundIndex]?.themes?.[this.currentThemeIndex]) {
            currentThemeName = this.currentPack[this.currentRoundIndex].themes[this.currentThemeIndex].name || '';
        }

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
            currentThemeIndex: this.currentThemeIndex,
            themeName: currentThemeName,
            currentCost: this.currentCost,
            activeBuzzerPlayerId: this.activeBuzzerPlayerId,
            currentQuestion: questionData,
            isPaused: this.isPaused,
            pauseReason: this.pauseReason,
            passedPlayerIds: Array.from(this.passedPlayers),
            catTargetPlayerId: this.catTargetPlayerId,
            auctionLeaderPlayerId: this.auctionLeaderPlayerId,
            auctionBets: Object.fromEntries(Array.from(this.auctionBets.entries()).map(([id, b]) => [id, (b && typeof b === 'object') ? (b.isPassed ? 0 : b.val) : Number(b) || 0])),
            buzzerOpenFor: (this.stateMachine.state === 'BUZZ_ACTIVE' && Array.isArray(this.allowedBuzzerPlayerIds))
                ? this.allowedBuzzerPlayerIds.filter(id => !this.buzzedPlayers.has(id) && !this.passedPlayers.has(id))
                : null,
            options: this.options,
            board: boardData
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

Room.AUCTION_ANSWER_SECONDS = AUCTION_ANSWER_SECONDS;

module.exports = Room;
