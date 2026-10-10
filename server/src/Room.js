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

        this.activeBuzzerPlayerId = null;
        this.buzzedPlayers = new Set();
        this.allowedBuzzerPlayerIds = null;
        this.catTargetPlayerId = null;
        this.auctionLeaderPlayerId = null;
        this.auctionBets = new Map(); // playerId -> { val, isPassed }
        this.auctionAnswers = new Map(); // playerId -> { answerText, timestamp }
        this.biddingPlayerIds = [];

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

            const isGameRunning = (this.stateMachine.state !== 'INIT' && this.stateMachine.state !== 'LOBBY');
            if (isGameRunning && !this.isPaused) {
                this.isPaused = true;
                this.broadcastToAll(MSG_TYPES.GAME_PAUSED, {
                    isPaused: true,
                    reason: 'disconnect',
                    disconnectedPlayerName: hostName
                });
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

                const isGameRunning = (this.stateMachine.state !== 'INIT' && this.stateMachine.state !== 'LOBBY');
                if (isGameRunning && !this.isPaused) {
                    this.isPaused = true;
                    this.broadcastToAll(MSG_TYPES.GAME_PAUSED, {
                        isPaused: true,
                        reason: 'disconnect',
                        disconnectedPlayerName: player.name
                    });
                }

                if (this.activeBuzzerPlayerId === id) {
                    if (this.answerTimer) {
                        clearTimeout(this.answerTimer);
                        this.answerTimer = null;
                    }
                    this.activeBuzzerPlayerId = null;
                    this.broadcastToAll(MSG_TYPES.BUZZ_RESET, {});

                    const remainingPlayers = Array.from(this.players.values()).filter(p => p.isConnected && !this.buzzedPlayers.has(p.id));
                    if (remainingPlayers.length > 0) {
                        this.stateMachine.state = 'BUZZ_ACTIVE';
                        this.activateBuzzer();
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

    getPenaltyAmount() {
        if (this.options.penaltyEnabled === false) return 0;
        if (this.options.penaltyMode === 'fixed') {
            return Math.max(0, Number(this.options.penaltyFixedAmount) || 100);
        }
        return this.currentCost;
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
        this.stateMachine.showBoard();
        this.broadcastRoomState();
        return { success: true };
    }

    selectQuestion(themeIdx, questionIdx, questionData) {
        this.touch();
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
        this.allowedBuzzerPlayerIds = null;
        this.catTargetPlayerId = null;
        this.auctionLeaderPlayerId = null;
        this.auctionBets.clear();
        this.auctionAnswers.clear();
        this.biddingPlayerIds = [];
        this.isPaused = false;

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
            cost: this.currentCost,
            readingTime: this.options.readingTime,
            thinkingTime: this.options.thinkingTime,
            question: sanitizedQuestion // Players get NO 'a' or 'a_img'
        });

        // Start reading timer
        if (this.readingTimer) clearTimeout(this.readingTimer);
        if (this.thinkingTimer) clearTimeout(this.thinkingTimer);
        this.thinkingTimer = null;
        this.remainingThinkingTime = (this.options.thinkingTime !== undefined) ? this.options.thinkingTime : 30;
        this.thinkingTimerStartedAt = null;
        const rTime = (this.options.readingTime !== undefined) ? this.options.readingTime : 7;
        this.readingTimerDuration = rTime;
        this.remainingReadingTime = rTime;
        this.readingTimerStartedAt = Date.now();

        if (rTime <= 0) {
            this.activateBuzzer();
        } else {
            this.readingTimer = setTimeout(() => {
                this.activateBuzzer();
            }, rTime * 1000);
            if (this.readingTimer.unref) this.readingTimer.unref();
        }

        return { success: true };
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
            this.allowedBuzzerPlayerIds = Array.from(this.players.keys()).filter(id => !this.buzzedPlayers.has(id));
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
        this.thinkingTimerStartedAt = Date.now();
        if (tTime > 0) {
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
        if (this.readingTimer) {
            clearTimeout(this.readingTimer);
            this.readingTimer = null;
        }
        this.remainingReadingTime = 0;

        this.stateMachine.state = 'AUCTION_ANSWERING';
        this.auctionAnswers = new Map();

        let allowed = biddingPlayerIds;
        if (!allowed || !Array.isArray(allowed) || allowed.length === 0) {
            if (this.auctionBets && this.auctionBets.size > 0) {
                allowed = Array.from(this.auctionBets.entries())
                    .filter(([id, b]) => {
                        const val = (typeof b === 'object' && b !== null) ? b.val : Number(b);
                        const passed = (typeof b === 'object' && b !== null) ? Boolean(b.isPassed) : false;
                        return val > 0 && !passed;
                    })
                    .map(([id]) => id);
            } else {
                allowed = Array.from(this.players.values())
                    .filter(p => p.isConnected && p.role !== 'host')
                    .map(p => p.id);
            }
        }

        this.biddingPlayerIds = allowed;

        const betsObj = {};
        for (const [id, b] of (this.auctionBets ? this.auctionBets.entries() : [])) {
            betsObj[id] = (typeof b === 'object' && b !== null) ? b.val : Number(b);
        }

        this.broadcastToAll(MSG_TYPES.AUCTION_ANSWER_START, {
            themeIdx: this.currentThemeIndex,
            questionIdx: this.currentQuestionIndex,
            cost: this.currentCost,
            thinkingTime: this.options.thinkingTime || 30,
            biddingPlayerIds: this.biddingPlayerIds,
            bets: betsObj
        });
    }

    setCatTarget(targetPlayerId) {
        this.touch();
        this.catTargetPlayerId = targetPlayerId;
        const targetPlayer = this.players.get(targetPlayerId);
        this.broadcastToAll(MSG_TYPES.CAT_TRANSFERRED, {
            toPlayerId: targetPlayerId,
            toPlayerName: targetPlayer ? targetPlayer.name : ''
        });
    }

    setAuctionLeader(leaderPlayerId, maxBet) {
        this.touch();
        this.auctionLeaderPlayerId = leaderPlayerId;
        if (maxBet !== undefined && !isNaN(Number(maxBet))) {
            this.currentCost = Number(maxBet);
        }
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

    handleAnswerSubmit(playerId, answerText) {
        this.touch();
        const isAuctionAnswering = (this.stateMachine.state === 'AUCTION_ANSWERING' ||
            (this.currentQuestion && (this.currentQuestion.type === 'auction' || this.currentQuestion.type === 'auction_all')));

        if (!isAuctionAnswering && (this.stateMachine.state !== 'ANSWERING' || this.activeBuzzerPlayerId !== playerId)) {
            return { success: false, error: ERROR_CODES.INVALID_ACTION, message: 'Сейчас не ваша очередь отвечать' };
        }

        if (isAuctionAnswering) {
            if (this.biddingPlayerIds && this.biddingPlayerIds.length > 0 && !this.biddingPlayerIds.includes(playerId)) {
                return { success: false, error: ERROR_CODES.INVALID_ACTION, message: 'Вы не делали ставку на этом аукционе' };
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

    handleAuctionBet(playerId, amount) {
        this.touch();
        const player = this.players.get(playerId);
        if (!player) return;

        const val = Number(amount) || 0;
        if (!this.auctionBets) this.auctionBets = new Map();
        this.auctionBets.set(playerId, { val, isPassed: val <= 0 });

        this.broadcastToAll(MSG_TYPES.AUCTION_BET_MADE, {
            playerId,
            playerName: player.name,
            amount: val
        });
    }

    handleCatTransfer(fromPlayerId, toPlayerId) {
        this.touch();
        const fromPlayer = this.players.get(fromPlayerId);
        const toPlayer = this.players.get(toPlayerId);
        if (!toPlayer) return;

        this.catTargetPlayerId = toPlayerId;

        this.broadcastToAll(MSG_TYPES.CAT_TRANSFERRED, {
            fromPlayerId,
            fromPlayerName: fromPlayer ? fromPlayer.name : '',
            toPlayerId,
            toPlayerName: toPlayer.name
        });
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
        let remainingPlayers = Array.from(this.players.keys()).filter(id => !this.buzzedPlayers.has(id));
        if (this.allowedBuzzerPlayerIds && this.allowedBuzzerPlayerIds.length > 0) {
            remainingPlayers = remainingPlayers.filter(id => this.allowedBuzzerPlayerIds.includes(id));
        }
        if (remainingPlayers.length > 0) {
            this.stateMachine.state = 'BUZZ_ACTIVE';
            this.activateBuzzer(remainingPlayers);
        } else {
            this.finishQuestion();
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
            const penalty = shouldPenalize ? (this.getPenaltyAmount() || this.currentCost) : 0;
            if (penalty > 0) {
                this.updatePlayerScore(answeringPlayerId, -penalty);
            }
            this.activeBuzzerPlayerId = null;

            // Check if others can buzz
            let remainingPlayers = Array.from(this.players.keys()).filter(id => !this.buzzedPlayers.has(id));
            if (this.allowedBuzzerPlayerIds && this.allowedBuzzerPlayerIds.length > 0) {
                remainingPlayers = remainingPlayers.filter(id => this.allowedBuzzerPlayerIds.includes(id));
            }
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
        if (typeof isPaused === 'boolean') {
            this.isPaused = isPaused;
        } else {
            this.isPaused = !this.isPaused;
        }

        if (this.isPaused) {
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
        } else {
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

        this.broadcastToAll(MSG_TYPES.GAME_PAUSED, {
            isPaused: this.isPaused
        });
    }

    skipRound() {
        this.touch();
        if (this.currentPack && this.currentRoundIndex < this.currentPack.length - 1) {
            this.currentRoundIndex++;
        }
        this.finishQuestion();
        this.broadcastToAll(MSG_TYPES.ROUND_SKIPPED, {
            roundIndex: this.currentRoundIndex
        });
        this.broadcastRoomState();
    }

    passTurn() {
        this.touch();
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

module.exports = Room;
