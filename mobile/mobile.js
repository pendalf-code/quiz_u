/**
 * Quiz U — Mobile Client Controller
 * Manages WebSocket connection, screens, buzzer tactile feedback, roles (Host/Player), and room interaction.
 */

(function () {
    'use strict';

    // DOM Elements
    const elements = {
        app: document.querySelector('.mobile-app'),
        // Header
        connIndicator: document.getElementById('conn-indicator'),
        statusDot: document.getElementById('status-dot'),
        statusText: document.getElementById('status-text'),
        headerRoomBadge: document.getElementById('header-room-badge'),
        headerRoomCode: document.getElementById('header-room-code'),
        headerPlayerBadge: document.getElementById('header-player-badge'),
        headerAvatar: document.getElementById('header-avatar'),
        headerName: document.getElementById('header-name'),
        headerScore: document.getElementById('header-score'),
        themeToggleBtn: document.getElementById('theme-toggle-btn'),
        themeIcon: document.getElementById('theme-icon'),
        exitMenuBtn: document.getElementById('exit-menu-btn'),
        modalExitConfirm: document.getElementById('modal-exit-confirm'),
        btnCancelExit: document.getElementById('btn-cancel-exit'),
        btnConfirmExit: document.getElementById('btn-confirm-exit'),
        mobilePauseBanner: document.getElementById('mobile-pause-banner'),
        mobilePauseText: document.getElementById('mobile-pause-text'),

        // Screens
        screens: {
            join: document.getElementById('screen-join'),
            waiting: document.getElementById('screen-waiting'),
            buzzer: document.getElementById('screen-buzzer'),
            answer: document.getElementById('screen-answer'),
            auction: document.getElementById('screen-auction'),
            cat: document.getElementById('screen-cat'),
            host: document.getElementById('screen-host')
        },

        // Join Screen
        joinForm: document.getElementById('join-form'),
        roomCodeInput: document.getElementById('room-code-input'),
        playerNameInput: document.getElementById('player-name-input'),
        roleSelector: document.getElementById('role-selector'),
        btnRolePlayer: document.getElementById('btn-role-player'),
        btnRoleHost: document.getElementById('btn-role-host'),
        avatarGrid: document.getElementById('avatar-grid'),
        joinError: document.getElementById('join-error'),
        reconnectBanner: document.getElementById('reconnect-banner'),
        reconnectAvatar: document.getElementById('reconnect-avatar'),
        reconnectName: document.getElementById('reconnect-name'),
        reconnectRoom: document.getElementById('reconnect-room'),
        btnReconnectQuick: document.getElementById('btn-reconnect-quick'),

        // Waiting Screen
        waitingTitle: document.getElementById('waiting-title'),
        waitingIcon: document.querySelector('#screen-waiting .waiting-icon'),
        waitingDesc: document.getElementById('waiting-desc'),
        waitingScore: document.getElementById('waiting-score'),
        waitingPlayersList: document.getElementById('waiting-players-list'),

        // Buzzer Screen
        buzzerBtn: document.getElementById('buzzer-btn'),
        buzzerIcon: document.getElementById('buzzer-icon'),
        buzzerText: document.getElementById('buzzer-text'),
        buzzerSubtext: document.getElementById('buzzer-subtext'),
        buzzerCostBadge: document.getElementById('buzzer-cost-badge'),
        buzzerStatusBadge: document.getElementById('buzzer-status-badge'),
        buzzerFooterInfo: document.getElementById('buzzer-footer-info'),

        // Answer Screen
        answerForm: document.getElementById('answer-form'),
        answerInput: document.getElementById('answer-input'),
        answerTimerNum: document.getElementById('answer-timer-num'),
        answerTimerBar: document.getElementById('answer-timer-bar'),
        answerCostHint: document.getElementById('answer-cost-hint'),

        // Auction Screen
        auctionNominal: document.getElementById('auction-nominal'),
        auctionRange: document.getElementById('auction-range'),
        auctionRule: document.getElementById('auction-rule'),
        btnPassQuestion: document.getElementById('btn-pass-question'),
        buzzerObligation: document.getElementById('buzzer-obligation'),
        hostSpecialPanel: document.getElementById('host-special-panel'),
        hostSpecialTitle: document.getElementById('host-special-title'),
        hostSpecialDesc: document.getElementById('host-special-desc'),
        hostSpecialList: document.getElementById('host-special-list'),
        btnHostSpecialAction: document.getElementById('btn-host-special-action'),
        auctionBalance: document.getElementById('auction-balance'),
        auctionForm: document.getElementById('auction-form'),
        betInput: document.getElementById('bet-input'),
        btnBetMinus: document.getElementById('btn-bet-minus'),
        btnBetPlus: document.getElementById('btn-bet-plus'),
        btnVaBank: document.getElementById('btn-va-bank'),
        btnPassBet: document.getElementById('btn-pass-bet'),

        // Cat Screen
        catPlayersList: document.getElementById('cat-players-list'),
        btnConfirmCat: document.getElementById('btn-confirm-cat'),

        // Host Screen Elements (TASK-04)
        hostStateBadge: document.getElementById('host-state-badge'),
        hostThemeBadge: document.getElementById('host-theme-badge'),
        hostCostBadge: document.getElementById('host-cost-badge'),
        hostBoardPanel: document.getElementById('host-board-panel'),
        hostBoardGrid: document.getElementById('host-board-grid'),
        hostBoardRound: document.getElementById('host-board-round'),
        hostQuestionCard: document.getElementById('host-question-card'),
        hostQuestionText: document.getElementById('host-question-text'),
        hostSecretBox: document.getElementById('host-secret-box'),
        hostSecretAnswer: document.getElementById('host-secret-answer'),
        hostSecretComment: document.getElementById('host-secret-comment'),
        hostAnsweringBanner: document.getElementById('host-answering-banner'),
        hostAnsweringName: document.getElementById('host-answering-name'),
        hostAnsweringSubtext: document.getElementById('host-answering-subtext'),
        btnHostJudgeCorrect: document.getElementById('btn-host-judge-correct'),
        btnHostJudgeCorrectText: document.getElementById('btn-host-judge-correct-text'),
        btnHostJudgeWrong: document.getElementById('btn-host-judge-wrong'),
        btnHostJudgeWrongText: document.getElementById('btn-host-judge-wrong-text'),
        btnHostJudgeWrongPenalty: document.getElementById('btn-host-judge-wrong-penalty'),
        btnHostJudgeWrongPenaltyText: document.getElementById('btn-host-judge-wrong-penalty-text'),
        btnHostPause: document.getElementById('btn-host-pause'),
        hostPauseIcon: document.getElementById('host-pause-icon'),
        hostPauseText: document.getElementById('host-pause-text'),
        btnHostPassTurn: document.getElementById('btn-host-pass-turn'),
        btnHostSkipRound: document.getElementById('btn-host-skip-round'),
        btnHostAddAllScores: document.getElementById('btn-host-add-all-scores'),
        modalHostAllScores: document.getElementById('modal-host-all-scores'),
        modalAllScoresBackdrop: document.getElementById('modal-all-scores-backdrop'),
        btnCloseAllScoresModal: document.getElementById('btn-close-all-scores-modal'),
        hostAllScoresInput: document.getElementById('host-all-scores-input'),
        btnCancelAllScores: document.getElementById('btn-cancel-all-scores'),
        btnConfirmAllScores: document.getElementById('btn-confirm-all-scores'),
        hostAuctionPanel: document.getElementById('host-auction-panel'),
        hostAuctionCount: document.getElementById('host-auction-count'),
        hostAuctionSecretAnswer: document.getElementById('host-auction-secret-answer'),
        hostAuctionList: document.getElementById('host-auction-list'),

        // Host Screen Missing Controls & Panels
        hostLobbyAction: document.getElementById('host-lobby-action'),
        btnHostStartGame: document.getElementById('btn-host-start-game'),
        hostAnsweringScore: document.getElementById('host-answering-score'),
        hostAnsweringSecretAnswer: document.getElementById('host-answering-secret-answer'),
        hostPlayerSubmittedBox: document.getElementById('host-player-submitted-box'),
        hostPlayerSubmittedVal: document.getElementById('host-player-submitted-val'),
        hostPlayersList: document.getElementById('host-players-list'),
        hostPlayersCount: document.getElementById('host-players-count'),
        btnHostShowAnswer: document.getElementById('btn-host-show-answer'),
        btnHostCloseQuestion: document.getElementById('btn-host-close-question'),
        hostRoundEndAction: document.getElementById('host-round-end-action'),
        btnHostNextRound: document.getElementById('btn-host-next-round'),
        hostGameOverAction: document.getElementById('host-game-over-action'),
        btnHostShowStats: document.getElementById('btn-host-show-stats'),
        btnHostRestartLobby: document.getElementById('btn-host-restart-lobby'),

        // Toast
        toast: document.getElementById('mobile-toast'),
        toastIcon: document.getElementById('toast-icon'),
        toastMessage: document.getElementById('toast-message')
    };

    // State
    const state = {
        selectedRole: 'player', // 'player' | 'host' (TASK-03)
        boardData: null,
        lastAnsweringPlayer: null,
        selectedAvatar: '🐱',
        currentScreen: 'join',
        selfPlayer: null,
        roomCode: null,
        sessionToken: null,
        currentCost: 100,
        buzzerState: 'locked', // 'locked' | 'ready' | 'self' | 'other' | 'locked-out'
        isEligibleForBuzzer: true,
        answerTimerInterval: null,
        answerTimeLeft: 5,
        totalAnswerTime: 5,
        selectedCatTargetId: null,
        toastTimeout: null,
        activeQuestion: null,
        activeAnsweringPlayer: null,
        isPaused: false,
        roomState: 'LOBBY',
        auctionBiddingPlayers: [],
        auctionBets: {},
        auctionSubmittedAnswers: {}
    };

    // Network Client Instance
    let netClient = null;

    // Storage Keys
    const STORAGE_KEYS = {
        ROOM: 'quiz_u_room_code',
        NAME: 'quiz_u_player_name',
        ROLE: 'quiz_u_role',
        AVATAR: 'quiz_u_avatar',
        TOKEN: 'quiz_u_session_token',
        THEME: 'quiz_u_theme'
    };

    // =========================================================================
    // Haptic Feedback (Vibration API)
    // =========================================================================
    function haptic(type) {
        if (!('vibrate' in navigator)) return;
        try {
            switch (type) {
                case 'buzz_press':
                    navigator.vibrate(40);
                    break;
                case 'buzz_won':
                    navigator.vibrate([80, 50, 100]);
                    break;
                case 'buzz_lost':
                    navigator.vibrate(50);
                    break;
                case 'error':
                    navigator.vibrate([120, 60, 120]);
                    break;
                case 'success':
                    navigator.vibrate([60, 40, 60]);
                    break;
            }
        } catch {}
    }

    // =========================================================================
    // Screen Management
    // =========================================================================
    function showScreen(screenName) {
        if (!elements.screens[screenName]) return;
        state.currentScreen = screenName;

        Object.keys(elements.screens).forEach((name) => {
            const screen = elements.screens[name];
            if (screen) {
                if (name === screenName) {
                    screen.classList.add('active');
                } else {
                    screen.classList.remove('active');
                }
            }
        });

        if (elements.exitMenuBtn) {
            if (screenName === 'join') {
                elements.exitMenuBtn.classList.add('hidden');
            } else {
                elements.exitMenuBtn.classList.remove('hidden');
            }
        }
    }

    // =========================================================================
    // Toast Messages
    // =========================================================================
    function showToast(message, type = 'info', duration = 3000) {
        if (state.toastTimeout) {
            clearTimeout(state.toastTimeout);
        }

        elements.toastMessage.textContent = message;
        elements.toast.className = 'mobile-toast';

        if (type === 'error') {
            elements.toast.classList.add('toast-error');
            elements.toastIcon.textContent = '⚠️';
        } else if (type === 'success') {
            elements.toast.classList.add('toast-success');
            elements.toastIcon.textContent = '✅';
        } else {
            elements.toastIcon.textContent = 'ℹ️';
        }

        elements.toast.classList.remove('hidden');

        state.toastTimeout = setTimeout(() => {
            elements.toast.classList.add('hidden');
        }, duration);
    }

    // =========================================================================
    // Theme Management
    // =========================================================================
    function initTheme() {
        const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
        if (savedTheme === 'light') {
            document.body.classList.add('light-theme');
            elements.themeIcon.textContent = '🌙';
        } else {
            document.body.classList.remove('light-theme');
            elements.themeIcon.textContent = '☀️';
        }

        elements.themeToggleBtn.addEventListener('click', () => {
            document.body.classList.toggle('light-theme');
            const isLight = document.body.classList.contains('light-theme');
            localStorage.setItem(STORAGE_KEYS.THEME, isLight ? 'light' : 'dark');
            elements.themeIcon.textContent = isLight ? '🌙' : '☀️';
        });
    }

    // =========================================================================
    // Connection Status Indicators
    // =========================================================================
    function setConnectionStatus(status) {
        elements.statusDot.className = 'status-dot';
        if (status === 'connected') {
            elements.statusDot.classList.add('connected');
            elements.statusText.textContent = 'В сети';
        } else if (status === 'connecting') {
            elements.statusDot.classList.add('connecting');
            elements.statusText.textContent = 'Подключение...';
        } else {
            elements.statusDot.classList.add('disconnected');
            elements.statusText.textContent = 'Оффлайн';
        }
    }

    // =========================================================================
    // Header & Player State Update
    // =========================================================================
    function updatePlayerBadge(player) {
        if (!player) {
            elements.headerPlayerBadge.classList.add('hidden');
            return;
        }

        state.selfPlayer = player;
        const isHost = (player.role === 'host' || state.selectedRole === 'host');
        elements.headerAvatar.textContent = player.avatar || (isHost ? '🎙️' : '🐱');

        const roleSuffix = isHost ? ' (Ведущий)' : '';
        elements.headerName.textContent = (player.name || 'Игрок') + roleSuffix;
        elements.headerScore.textContent = isHost ? '🎙️ Пульт' : `${player.score || 0} очков`;
        elements.headerPlayerBadge.classList.remove('hidden');

        if (elements.waitingScore) {
            elements.waitingScore.textContent = isHost ? '🎙️ Пульт' : (player.score || 0);
        }
        if (elements.auctionBalance) {
            elements.auctionBalance.textContent = player.score || 0;
        }
    }

    function updateRoomBadge(code) {
        if (!code) {
            elements.headerRoomBadge.classList.add('hidden');
            return;
        }
        state.roomCode = code.toUpperCase();
        elements.headerRoomCode.textContent = state.roomCode;
        elements.headerRoomBadge.classList.remove('hidden');
    }

    // =========================================================================
    // Buzzer Button State Machine
    // =========================================================================
    function setBuzzerState(newState, meta = {}) {
        state.buzzerState = newState;
        const btn = elements.buzzerBtn;
        btn.className = 'giant-buzzer-btn';
        btn.style.display = '';

        switch (newState) {
            case 'locked':
                btn.classList.add('state-locked');
                btn.disabled = true;
                elements.buzzerIcon.textContent = '🔒';
                elements.buzzerText.textContent = 'ВНИМАНИЕ НА ЭКРАН';
                elements.buzzerSubtext.textContent = 'Вопрос зачитывается...';
                elements.buzzerStatusBadge.textContent = 'Зачитывание';
                break;

            case 'ready':
                btn.classList.add('state-ready');
                btn.disabled = false;
                elements.buzzerIcon.textContent = '⚡';
                elements.buzzerText.textContent = 'ОТВЕТИТЬ!';
                elements.buzzerSubtext.textContent = 'ЖМИТЕ БЫСТРЕЕ!';
                elements.buzzerStatusBadge.textContent = 'Кнопка открыта!';
                if (state.isPaused) {
                    btn.disabled = true;
                    btn.classList.add('state-paused');
                    elements.buzzerText.textContent = '⏸️ ПАУЗА В ИГРЕ';
                    elements.buzzerSubtext.textContent = 'Ожидайте снятия паузы ведущим';
                }
                break;

            case 'self':
                btn.classList.add('state-self-buzzed');
                btn.disabled = true;
                elements.buzzerIcon.textContent = '🎯';
                elements.buzzerText.textContent = 'ВЫ ОТВЕЧАЕТЕ!';
                elements.buzzerSubtext.textContent = 'Время пошло!';
                elements.buzzerStatusBadge.textContent = 'Ваш ход';
                break;

            case 'other':
                btn.classList.add('state-other-buzzed');
                btn.disabled = true;
                elements.buzzerIcon.textContent = '⏱️';
                elements.buzzerText.textContent = meta.playerName ? `${meta.playerName}` : 'ОТВЕЧАЕТ СОПЕРНИК';
                elements.buzzerSubtext.textContent = 'Слушайте ответ...';
                elements.buzzerStatusBadge.textContent = 'Отвечает соперник';
                break;

            case 'locked-out':
                btn.classList.add('state-locked-out');
                btn.disabled = true;
                elements.buzzerIcon.textContent = '❌';
                elements.buzzerText.textContent = 'ВЫ УЖЕ ОТВЕЧАЛИ';
                elements.buzzerSubtext.textContent = 'Ждите следующего вопроса';
                elements.buzzerStatusBadge.textContent = 'Штраф';
                break;
        }
        updatePassControls();
    }

    // Pass button (only while the buzzer is waiting / open) and the "you must answer" notice
    function updatePassControls() {
        const canPass = !state.mustAnswer && !state.isPassed && state.isEligibleForBuzzer !== false
            && (state.buzzerState === 'locked' || state.buzzerState === 'ready');
        if (elements.btnPassQuestion) {
            elements.btnPassQuestion.classList.toggle('hidden', !canPass);
            if (!canPass) resetPassConfirm();
        }
        if (elements.buzzerObligation) {
            const show = Boolean(state.mustAnswer) && (state.buzzerState === 'locked' || state.buzzerState === 'ready');
            elements.buzzerObligation.classList.toggle('hidden', !show);
            elements.buzzerObligation.textContent = state.mustAnswer ? state.mustAnswerText || 'Вы обязаны ответить на этот вопрос' : '';
        }
    }

    function resetPassConfirm() {
        if (state.passConfirmTimer) {
            clearTimeout(state.passConfirmTimer);
            state.passConfirmTimer = null;
        }
        if (elements.btnPassQuestion) {
            elements.btnPassQuestion.classList.remove('confirm');
            elements.btnPassQuestion.textContent = 'Пас — не отвечаю';
        }
    }

    // A leading emoji of the title becomes the big icon of the waiting screen
    function setWaitingTexts(title, desc) {
        let icon = '⌛';
        let text = title;
        const match = /^(\p{Extended_Pictographic}️?)\s*(.*)$/u.exec(title || '');
        if (match) {
            icon = match[1];
            text = match[2];
        }
        if (elements.waitingIcon) elements.waitingIcon.textContent = icon;
        if (elements.waitingTitle) elements.waitingTitle.textContent = text;
        if (elements.waitingDesc) elements.waitingDesc.textContent = desc;
    }

    // Auction bet screen: limits, rule text, default bet
    function openAuctionScreen(cost) {
        const nominal = Number(cost) || state.currentCost || 100;
        const balance = (state.selfPlayer && Number(state.selfPlayer.score)) || 0;
        const maxBet = Math.max(nominal, balance);
        state.betMin = nominal;
        state.betMax = maxBet;
        state.betSubmitted = false;
        state.currentCost = nominal;
        if (elements.auctionNominal) elements.auctionNominal.textContent = nominal;
        if (elements.auctionBalance) elements.auctionBalance.textContent = balance;
        if (elements.auctionRange) elements.auctionRange.textContent = nominal === maxBet ? `${nominal}` : `${nominal} – ${maxBet}`;
        if (elements.auctionRule) {
            elements.auctionRule.textContent = state.questionType === 'auction_leader'
                ? 'Побеждает самая высокая ставка — только победитель отвечает на вопрос.'
                : 'Сделавший ставку обязан ответить текстом — на ответ 30 секунд. Ошибка стоит вам ставки. Не уверены — пас.';
        }
        if (elements.betInput) {
            elements.betInput.min = nominal;
            elements.betInput.max = maxBet;
            elements.betInput.value = nominal;
        }
        showScreen('auction');
    }

    function clampBet(value) {
        const v = parseInt(value, 10);
        const min = state.betMin || state.currentCost || 100;
        const max = state.betMax || min;
        if (isNaN(v)) return min;
        return Math.min(Math.max(v, min), max);
    }

    // =========================================================================
    // Answer Countdown Timer
    // =========================================================================
    function startAnswerTimer(seconds = 5) {
        if (state.answerTimerInterval) {
            clearInterval(state.answerTimerInterval);
        }

        state.totalAnswerTime = seconds;
        state.answerTimeLeft = seconds;
        elements.answerTimerNum.textContent = seconds;
        elements.answerTimerBar.style.width = '100%';
        elements.answerTimerBar.style.backgroundColor = 'var(--accent-green)';

        const ringProgress = document.getElementById('mobile-answer-ring-progress');
        const circumference = 2 * Math.PI * 42;
        if (ringProgress) {
            ringProgress.style.strokeDasharray = `${circumference}`;
            ringProgress.style.strokeDashoffset = '0';
            ringProgress.style.stroke = 'var(--accent-green)';
        }

        const stepMs = 100;
        const totalSteps = (seconds * 1000) / stepMs;
        let currentStep = totalSteps;

        state.answerTimerInterval = setInterval(() => {
            if (state.isAnswerTimerPaused) return;
            currentStep--;
            const progress = Math.max(0, currentStep / totalSteps);
            elements.answerTimerBar.style.width = `${progress * 100}%`;

            const secsLeft = Math.ceil(progress * seconds);
            elements.answerTimerNum.textContent = secsLeft;

            if (progress <= 0.3) {
                elements.answerTimerBar.style.backgroundColor = 'var(--accent-red)';
                if (ringProgress) ringProgress.style.stroke = 'var(--accent-red)';
            } else if (progress <= 0.6) {
                elements.answerTimerBar.style.backgroundColor = 'var(--accent-gold)';
                if (ringProgress) ringProgress.style.stroke = 'var(--accent-gold)';
            } else {
                if (ringProgress) ringProgress.style.stroke = 'var(--accent-green)';
            }
            if (ringProgress) {
                ringProgress.style.strokeDashoffset = `${circumference * (1 - progress)}`;
            }

            if (currentStep <= 0) {
                clearInterval(state.answerTimerInterval);
                state.answerTimerInterval = null;
                if (state.selectedRole !== 'host') {
                    if (elements.buzzerBtn) elements.buzzerBtn.style.display = 'none';
                    if (elements.waitingTitle) elements.waitingTitle.textContent = '⏰ Время вышло!';
                    if (elements.waitingDesc) elements.waitingDesc.textContent = 'Время на ответ истекло';
                    showScreen('waiting');
                }
            }
        }, stepMs);
    }

    function stopAnswerTimer() {
        if (state.answerTimerInterval) {
            clearInterval(state.answerTimerInterval);
            state.answerTimerInterval = null;
        }
    }

    // =========================================================================
    // Host Screen Management & Rendering (TASK-04)
    // =========================================================================
    function updateHostScreen(roomState, meta = {}) {
        if (roomState) state.roomState = roomState;
        const currentRoomState = state.roomState || 'LOBBY';

        // State Badge
        if (elements.hostStateBadge) {
            const stateLabels = {
                'INIT': 'Инициализация',
                'LOBBY': 'Ожидание игроков',
                'BOARD': 'Выбор вопроса',
                'QUESTION_READING': 'Зачитывание вопроса',
                'BUZZ_ACTIVE': 'Кнопка открыта!',
                'ANSWERING': 'Игрок отвечает',
                'AUCTION_BETTING': 'Аукцион',
                'CAT_CHOOSING': 'Кот в мешке',
                'ROUND_END': 'Конец раунда',
                'AUCTION_ANSWERING': 'Ответы аукциона',
                'QUESTION_CLOSED': 'Время вышло',
                'GAME_OVER': 'Игра завершена'
            };
            elements.hostStateBadge.textContent = stateLabels[currentRoomState] || currentRoomState;
        }

        // Meta (Theme & Cost)
        if (elements.hostThemeBadge) {
            const theme = meta.themeName || state.activeThemeName || (state.activeQuestion && (state.activeQuestion.theme || state.activeQuestion.themeName)) || '—';
            elements.hostThemeBadge.textContent = `Тема: ${theme}`;
        }
        if (elements.hostCostBadge) {
            elements.hostCostBadge.textContent = `${state.currentCost} очков`;
        }

        // Lobby action button (Start Game) (TASK-05 validation)
        const playersList = (netClient ? netClient.getPlayersList() : []) || [];
        const activePlayers = playersList.filter(p => p.isConnected && p.role !== 'host');
        const canStart = activePlayers.length >= 1;

        if (elements.hostLobbyAction) {
            if (currentRoomState === 'LOBBY' || currentRoomState === 'INIT') {
                elements.hostLobbyAction.style.display = 'block';
                if (elements.btnHostStartGame) {
                    elements.btnHostStartGame.disabled = !canStart;
                    if (!canStart) {
                        elements.btnHostStartGame.textContent = `🚀 Начать игру (Игроков: ${activePlayers.length}/1)`;
                    } else {
                        elements.btnHostStartGame.textContent = `🚀 Начать игру (${activePlayers.length} игроков)`;
                    }
                }
            } else {
                elements.hostLobbyAction.style.display = 'none';
            }
        }

        if (elements.hostRoundEndAction) {
            if (currentRoomState === 'ROUND_END') {
                elements.hostRoundEndAction.classList.remove('hidden');
            } else {
                elements.hostRoundEndAction.classList.add('hidden');
            }
        }

        if (elements.hostGameOverAction) {
            if (currentRoomState === 'GAME_OVER') {
                elements.hostGameOverAction.classList.remove('hidden');
            } else {
                elements.hostGameOverAction.classList.add('hidden');
            }
        }

        // Toggle Question card vs Board panel
        const isQuestionActive = Boolean(state.activeQuestion && (state.activeQuestion.q || state.activeQuestion.text));
        const isBoardState = (currentRoomState === 'BOARD') && !isQuestionActive;

        if (elements.hostBoardPanel) {
            if (isBoardState && state.boardData) {
                elements.hostBoardPanel.classList.remove('hidden');
                renderHostBoardGrid(state.boardData);
            } else {
                elements.hostBoardPanel.classList.add('hidden');
            }
        }
        if (elements.hostQuestionCard) {
            if (isBoardState && state.boardData) {
                elements.hostQuestionCard.classList.add('hidden');
            } else {
                elements.hostQuestionCard.classList.remove('hidden');
            }
        }

        // Screen phase drives which controls the dock shows (see `#screen-host[data-phase]` in mobile.css)
        let hostPhase = 'board';
        if (currentRoomState === 'LOBBY' || currentRoomState === 'INIT') hostPhase = 'lobby';
        else if ((currentRoomState === 'CAT_CHOOSING' || currentRoomState === 'AUCTION_BETTING') && isQuestionActive) hostPhase = 'special';
        else if (currentRoomState === 'GAME_OVER') hostPhase = 'game_over';
        else if (currentRoomState === 'ROUND_END') hostPhase = 'round_end';
        else if (isQuestionActive) {
            if (state.activeAnsweringPlayer) hostPhase = 'answering';
            else if (currentRoomState === 'BOARD') hostPhase = 'finished';
            else hostPhase = 'question';
        }
        if (elements.screens.host) elements.screens.host.dataset.phase = hostPhase;
        renderHostSpecialPanel();

        // Game-flow controls make no sense in the lobby or after the game is over
        const isGameRunning = !['INIT', 'LOBBY', 'GAME_OVER'].includes(currentRoomState);
        [elements.btnHostPassTurn, elements.btnHostSkipRound, elements.btnHostAddAllScores, elements.btnHostPause].forEach((btn) => {
            if (btn) btn.disabled = !isGameRunning;
        });
        if (elements.hostStateBadge && currentRoomState === 'BOARD' && isQuestionActive) {
            elements.hostStateBadge.textContent = 'Вопрос завершён';
        }
        if (elements.btnHostCloseQuestion) {
            elements.btnHostCloseQuestion.classList.toggle('attention', currentRoomState === 'BOARD' && isQuestionActive);
        }

        if (elements.btnHostShowAnswer) elements.btnHostShowAnswer.disabled = !isQuestionActive;
        if (elements.btnHostCloseQuestion) elements.btnHostCloseQuestion.disabled = !isQuestionActive;

        // Question text and secret answer card
        if (elements.hostQuestionText) {
            if (state.activeQuestion && (state.activeQuestion.q || state.activeQuestion.text)) {
                elements.hostQuestionText.textContent = state.activeQuestion.q || state.activeQuestion.text;
            } else if (currentRoomState === 'LOBBY' || currentRoomState === 'INIT') {
                elements.hostQuestionText.textContent = 'Ожидание игроков. Нажмите «Начать игру», когда все будут готовы.';
            } else {
                elements.hostQuestionText.textContent = 'Вопрос не выбран. Выберите вопрос из сетки выше.';
            }
        }

        if (elements.hostSecretAnswer) {
            if (state.activeQuestion && (state.activeQuestion.a || state.activeQuestion.answer)) {
                elements.hostSecretAnswer.textContent = state.activeQuestion.a || state.activeQuestion.answer;
            } else {
                elements.hostSecretAnswer.textContent = '—';
            }
        }

        if (elements.hostSecretComment) {
            if (state.activeQuestion && state.activeQuestion.comment) {
                elements.hostSecretComment.textContent = `💡 Примечание: ${state.activeQuestion.comment}`;
                elements.hostSecretComment.classList.remove('hidden');
            } else {
                elements.hostSecretComment.classList.add('hidden');
            }
        }

        // Active Answering Player & Judging Buttons (Requirement 1)
        if (state.activeAnsweringPlayer) {
            state.lastAnsweringPlayer = state.activeAnsweringPlayer;
            if (elements.hostAnsweringBanner) elements.hostAnsweringBanner.classList.remove('hidden');
            if (elements.hostAnsweringName) elements.hostAnsweringName.textContent = `Отвечает: ${state.activeAnsweringPlayer.playerName || 'Игрок'}`;
            
            const answeringP = (netClient ? netClient.getPlayersList() : []).find(p => p.id === state.activeAnsweringPlayer.playerId);
            if (elements.hostAnsweringScore) {
                elements.hostAnsweringScore.textContent = `${(answeringP && answeringP.score != null) ? answeringP.score : 0} очков`;
            }

            if (elements.hostAnsweringSecretAnswer) {
                elements.hostAnsweringSecretAnswer.textContent = (state.activeQuestion && (state.activeQuestion.a || state.activeQuestion.answer)) || '—';
            }

            if (elements.hostPlayerSubmittedBox && elements.hostPlayerSubmittedVal) {
                if (meta.answerText) {
                    elements.hostPlayerSubmittedVal.textContent = meta.answerText;
                    elements.hostPlayerSubmittedBox.classList.remove('hidden');
                } else {
                    elements.hostPlayerSubmittedBox.classList.add('hidden');
                }
            }

            if (elements.hostAnsweringSubtext) {
                elements.hostAnsweringSubtext.textContent = meta.answerText
                    ? `Ответ игрока: «${meta.answerText}»`
                    : 'Слушайте ответ вслух или ждите ввода...';
            }
            if (elements.btnHostJudgeCorrect) elements.btnHostJudgeCorrect.disabled = false;
            if (elements.btnHostJudgeWrong) elements.btnHostJudgeWrong.disabled = false;
            if (elements.btnHostJudgeWrongPenalty) elements.btnHostJudgeWrongPenalty.disabled = false;
            if (elements.btnHostJudgeCorrectText) elements.btnHostJudgeCorrectText.textContent = `Зачесть (+${state.currentCost})`;
            if (elements.btnHostJudgeWrongText) elements.btnHostJudgeWrongText.textContent = 'Не засчитать';
            if (elements.btnHostJudgeWrongPenaltyText) elements.btnHostJudgeWrongPenaltyText.textContent = `Штраф (-${state.currentCost})`;
        } else {
            if (elements.hostAnsweringBanner) elements.hostAnsweringBanner.classList.add('hidden');
            if (elements.hostPlayerSubmittedBox) elements.hostPlayerSubmittedBox.classList.add('hidden');
            if (elements.btnHostJudgeCorrect) elements.btnHostJudgeCorrect.disabled = true;
            if (elements.btnHostJudgeWrong) elements.btnHostJudgeWrong.disabled = true;
            if (elements.btnHostJudgeWrongPenalty) elements.btnHostJudgeWrongPenalty.disabled = true;
        }

        // Pause button
        if (elements.btnHostPause) {
            if (state.isPaused) {
                if (elements.hostPauseIcon) elements.hostPauseIcon.textContent = '▶️';
                if (elements.hostPauseText) elements.hostPauseText.textContent = 'Продолжить';
                elements.btnHostPause.classList.add('paused');
            } else {
                if (elements.hostPauseIcon) elements.hostPauseIcon.textContent = '⏸️';
                if (elements.hostPauseText) elements.hostPauseText.textContent = 'Пауза';
                elements.btnHostPause.classList.remove('paused');
            }
        }
    }

    // Host: special questions (cat in the bag / auctions) need a decision from the host
    function renderHostSpecialPanel() {
        const panel = elements.hostSpecialPanel;
        if (!panel) return;
        const roomState = state.roomState;
        const isSpecial = (roomState === 'CAT_CHOOSING' || roomState === 'AUCTION_BETTING') && Boolean(state.activeQuestion);
        panel.classList.toggle('hidden', !isSpecial);
        if (!isSpecial) return;

        const type = state.questionType || (state.activeQuestion && state.activeQuestion.type) || 'normal';
        const players = ((netClient ? netClient.getPlayersList() : []) || []).filter(p => p.role !== 'host');
        const bets = state.liveBets || {};
        const placed = state.betPlaced || {};
        const cost = state.currentCost || 100;
        const list = elements.hostSpecialList;
        const action = elements.btnHostSpecialAction;
        if (list) list.innerHTML = '';
        if (action) action.classList.add('hidden');

        const isCat = (type === 'cat' || type === 'secret');
        if (elements.hostSpecialTitle) {
            elements.hostSpecialTitle.textContent = isCat ? '🐱 Кот в мешке' : (type === 'auction_leader' ? '🔨 Аукцион за право ответа' : '💰 Вопрос со ставками');
        }
        if (elements.hostSpecialDesc) {
            elements.hostSpecialDesc.textContent = isCat
                ? `Назначьте команду, которая обязана ответить (${cost} очков).`
                : (type === 'auction_leader'
                    ? 'Игроки ставят с телефонов. Назначьте лидера — отвечает только он, цена вопроса = его ставка.'
                    : 'Игроки ставят с телефонов. Все, кто поставил, обязаны ответить текстом — вы увидите ответы и оцените каждый.');
        }
        if (!list) return;

        const maxBet = Math.max(0, ...players.map(p => bets[p.id] || 0));
        players.forEach((p) => {
            const row = document.createElement('div');
            row.className = 'host-special-item' + (p.isConnected === false ? ' offline' : '');
            const bet = bets[p.id] || 0;
            let betLabel = '';
            if (!isCat) betLabel = placed[p.id] ? (bet > 0 ? `${bet}` : 'ПАС') : 'думает…';
            const isTop = !isCat && bet > 0 && bet === maxBet;
            row.innerHTML = `
                <span class="host-special-avatar">${p.avatar || '🐱'}</span>
                <span class="host-special-name">${escapeHtml(p.name)}</span>
                <span class="host-special-score">${p.score || 0}</span>
                ${isCat ? '' : `<span class="host-special-bet${isTop ? ' top' : ''}${placed[p.id] && bet === 0 ? ' pass' : ''}">${betLabel}</span>`}
            `;
            if (isCat || type === 'auction_leader') {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'host-special-pick';
                btn.textContent = isCat ? 'Отвечает' : 'Лидер';
                btn.disabled = (p.isConnected === false) || (!isCat && bet <= 0);
                btn.addEventListener('click', () => {
                    if (!netClient) return;
                    haptic('buzz_press');
                    if (isCat) {
                        netClient.setCatTarget(p.id);
                    } else {
                        netClient.setAuctionLeader(p.id, bet);
                    }
                });
                row.appendChild(btn);
            }
            list.appendChild(row);
        });

        if (action && type !== 'auction_leader' && !isCat) {
            const bidders = players.filter(p => (bets[p.id] || 0) > 0).map(p => p.id);
            action.classList.remove('hidden');
            action.disabled = bidders.length === 0;
            action.textContent = bidders.length === 0 ? 'Ждём ставки…' : `Принять ставки (${bidders.length}) и открыть вопрос`;
            action.onclick = () => {
                if (!netClient) return;
                haptic('success');
                netClient.startAuctionAnswer(bidders);
            };
        }
    }

    function renderHostBoardGrid(boardData) {
        if (!elements.hostBoardGrid || !boardData) return;
        if (elements.hostBoardRound) {
            elements.hostBoardRound.textContent = boardData.roundName || `Раунд ${(boardData.roundIndex || 0) + 1}`;
        }
        elements.hostBoardGrid.innerHTML = '';
        const themes = boardData.themes || [];
        if (themes.length === 0) {
            elements.hostBoardGrid.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:12px;">Ожидание загрузки пакета вопросов...</div>';
            return;
        }

        themes.forEach((th) => {
            const themeDiv = document.createElement('div');
            themeDiv.className = 'host-board-theme';

            const titleDiv = document.createElement('div');
            titleDiv.className = 'host-theme-title';
            titleDiv.textContent = `📁 ${th.name}`;
            themeDiv.appendChild(titleDiv);

            const costsDiv = document.createElement('div');
            costsDiv.className = 'host-theme-costs';

            (th.questions || []).forEach((q) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `host-cost-btn ${q.used ? 'used' : ''}`;
                btn.textContent = q.cost;
                btn.disabled = Boolean(q.used);

                if (!q.used) {
                    btn.addEventListener('click', () => {
                        if (!netClient) return;
                        haptic('buzz_press');
                        showToast(`Выбор вопроса: ${th.name} (${q.cost})`, 'info');
                        netClient.selectQuestion(th.themeIdx, q.questionIdx);
                    });
                }
                costsDiv.appendChild(btn);
            });

            themeDiv.appendChild(costsDiv);
            elements.hostBoardGrid.appendChild(themeDiv);
        });
    }

    function renderHostPlayersList(players) {
        if (!elements.hostPlayersList) return;
        elements.hostPlayersList.innerHTML = '';

        const playerList = (players || (netClient ? netClient.getPlayersList() : []) || []).filter(p => p.role !== 'host');
        if (elements.hostPlayersCount) {
            elements.hostPlayersCount.textContent = `${playerList.length} игроков`;
        }

        if (playerList.length === 0) {
            elements.hostPlayersList.innerHTML = '<div style="color:var(--text-muted); padding:10px; text-align:center;">Ожидание подключения игроков...</div>';
            return;
        }

        const initialN = state.hostCustomN || state.currentCost || 100;
        playerList.forEach((p) => {
            const qCost = state.currentCost || 100;
            const row = document.createElement('div');
            row.className = 'host-player-row' + (p.isConnected === false ? ' offline' : '');
            row.innerHTML = `
                <div class="host-player-info">
                    <span class="host-player-avatar">${p.avatar || '🐱'}</span>
                    <span class="host-player-name">${escapeHtml(p.name)}</span>
                    <span class="host-player-score">${p.score || 0}</span>
                </div>
                <div class="host-player-actions">
                    <button type="button" class="score-step-btn minus-cost" data-id="${p.id}" title="Снять ${qCost}">-${qCost}</button>
                    <button type="button" class="score-step-btn plus-cost" data-id="${p.id}" title="Начислить ${qCost}">+${qCost}</button>
                    <div class="host-score-n-wrap">
                        <input type="number" class="score-n-input" value="${initialN}" min="1" step="50" inputmode="numeric" />
                        <button type="button" class="score-step-btn minus btn-score-sub" data-id="${p.id}" title="Вычесть N очков">-N</button>
                        <button type="button" class="score-step-btn plus btn-score-add" data-id="${p.id}" title="Прибавить N очков">+N</button>
                    </div>
                </div>
            `;

            const btnMinusCost = row.querySelector('.minus-cost');
            if (btnMinusCost) {
                btnMinusCost.addEventListener('click', () => {
                    if (!netClient) return;
                    netClient.updateScore(p.id, -qCost);
                    haptic('buzz_press');
                    showToast(`-${qCost} очков (${p.name})`, 'info');
                });
            }

            const btnPlusCost = row.querySelector('.plus-cost');
            if (btnPlusCost) {
                btnPlusCost.addEventListener('click', () => {
                    if (!netClient) return;
                    netClient.updateScore(p.id, qCost);
                    haptic('buzz_press');
                    showToast(`+${qCost} очков (${p.name})`, 'success');
                });
            }

            const input = row.querySelector('.score-n-input');
            input.addEventListener('change', () => {
                const val = Math.abs(parseInt(input.value, 10)) || 100;
                state.hostCustomN = val;
                input.value = val;
            });

            row.querySelector('.btn-score-add').addEventListener('click', () => {
                if (!netClient) return;
                const delta = Math.abs(parseInt(input.value, 10)) || 100;
                state.hostCustomN = delta;
                netClient.updateScore(p.id, delta);
                haptic('buzz_press');
                showToast(`+${delta} очков (${p.name})`, 'success');
            });

            row.querySelector('.btn-score-sub').addEventListener('click', () => {
                if (!netClient) return;
                const delta = Math.abs(parseInt(input.value, 10)) || 100;
                state.hostCustomN = delta;
                netClient.updateScore(p.id, -delta);
                haptic('buzz_press');
                showToast(`-${delta} очков (${p.name})`, 'info');
            });

            elements.hostPlayersList.appendChild(row);
        });
    }

    function renderHostAuctionList() {
        if (!elements.hostAuctionList) return;
        elements.hostAuctionList.innerHTML = '';
        const players = (netClient ? netClient.getPlayersList() : []) || [];
        const biddingIds = state.auctionBiddingPlayers || [];
        const bets = state.auctionBets || {};
        const answers = state.auctionSubmittedAnswers || {};

        let answeredCount = 0;
        biddingIds.forEach(pid => {
            if (answers[pid]) answeredCount++;
            const p = players.find(x => x.id === pid) || { id: pid, name: 'Команда', avatar: '⭐' };
            const bet = bets[pid] || state.currentCost;
            const ans = answers[pid];

            const card = document.createElement('div');
            card.className = `host-auction-card${ans ? ' answered' : ''}`;
            card.id = `host-auction-card-${pid}`;
            card.innerHTML = `
                <div class="host-auction-card-head">
                    <span class="host-auction-card-team">${p.avatar || '⭐'} ${escapeHtml(p.name)}</span>
                    <span class="host-auction-card-bet">Ставка: ${bet} очков</span>
                </div>
                <div class="host-auction-card-ans" id="host-auction-ans-${pid}">
                    ${ans ? `✍️ ${escapeHtml(ans)}` : '⏳ Ожидание ввода ответа...'}
                </div>
                <div class="host-auction-card-actions">
                    <button type="button" class="host-auction-btn-plus" data-id="${pid}" data-bet="${bet}">+${bet} очков</button>
                    <button type="button" class="host-auction-btn-minus" data-id="${pid}" data-bet="${bet}">-${bet} очков</button>
                </div>
            `;

            card.querySelector('.host-auction-btn-plus').addEventListener('click', () => {
                if (netClient) {
                    netClient.updateScore(pid, bet);
                    haptic('buzz_press');
                    showToast(`+${bet} очков для ${p.name}`, 'success');
                }
            });

            card.querySelector('.host-auction-btn-minus').addEventListener('click', () => {
                if (netClient) {
                    netClient.updateScore(pid, -bet);
                    haptic('buzz_press');
                    showToast(`-${bet} очков для ${p.name}`, 'error');
                }
            });

            elements.hostAuctionList.appendChild(card);
        });

        if (elements.hostAuctionCount) {
            elements.hostAuctionCount.textContent = `${answeredCount} / ${biddingIds.length} ответов`;
        }
    }

    // =========================================================================
    // Standings & Players Lists
    // =========================================================================
    function renderPlayersList(players) {
        if (!elements.waitingPlayersList) return;
        elements.waitingPlayersList.innerHTML = '';

        if (!players || players.length === 0) {
            elements.waitingPlayersList.innerHTML = '<div class="player-row"><span style="color:var(--text-muted)">Ожидание игроков...</span></div>';
            return;
        }

        // Sort descending by score
        const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));

        sorted.forEach((p, idx) => {
            const isMe = state.selfPlayer && p.id === state.selfPlayer.id;
            const isHost = (p.role === 'host');
            const row = document.createElement('div');
            row.className = `player-row${isMe ? ' is-me' : ''}`;
            row.innerHTML = `
                <div class="player-row-left">
                    <span>${idx + 1}.</span>
                    <span>${p.avatar || (isHost ? '🎙️' : '🐱')}</span>
                    <span>${escapeHtml(p.name)}${isHost ? ' (Ведущий)' : ''}</span>
                </div>
                <div class="player-row-score">${isHost ? '🎙️' : (p.score || 0)}</div>
            `;
            elements.waitingPlayersList.appendChild(row);
        });
    }

    function renderCatPlayersList(players) {
        if (!elements.catPlayersList) return;
        elements.catPlayersList.innerHTML = '';
        state.selectedCatTargetId = null;
        elements.btnConfirmCat.disabled = true;

        const otherPlayers = (players || []).filter(p => (!state.selfPlayer || p.id !== state.selfPlayer.id) && p.role !== 'host');

        if (otherPlayers.length === 0) {
            elements.catPlayersList.innerHTML = '<div style="color:var(--text-muted); padding:10px;">Нет других игроков</div>';
            return;
        }

        otherPlayers.forEach((p) => {
            const item = document.createElement('div');
            item.className = 'cat-player-item';
            item.dataset.id = p.id;
            item.innerHTML = `
                <div class="cat-player-left">
                    <span class="cat-player-avatar">${p.avatar || '🐱'}</span>
                    <span class="cat-player-name">${escapeHtml(p.name)}</span>
                </div>
                <span class="cat-player-score">${p.score || 0}</span>
            `;

            item.addEventListener('click', () => {
                document.querySelectorAll('.cat-player-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                state.selectedCatTargetId = p.id;
                elements.btnConfirmCat.disabled = false;
            });

            elements.catPlayersList.appendChild(item);
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // =========================================================================
    // Network Client Setup & Event Handlers
    // =========================================================================
    function getWebSocketUrl() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${location.host}`;
    }

    function initNetworkClient() {
        if (netClient) {
            netClient.disconnect();
        }

        const wsUrl = getWebSocketUrl();
        setConnectionStatus('connecting');

        netClient = new NetworkClient({
            url: wsUrl,
            isHost: state.selectedRole === 'host',
            role: state.selectedRole,
            autoReconnect: true,
            maxReconnectAttempts: 10
        });

        netClient.on('connected', () => {
            setConnectionStatus('connected');
            elements.joinError.classList.add('hidden');

            // If we have saved room and token, attempt rejoin
            if (state.roomCode && state.selfPlayer && state.selfPlayer.name) {
                netClient.joinRoom(
                    state.roomCode,
                    state.selfPlayer.name,
                    state.selectedAvatar,
                    state.sessionToken,
                    state.selectedRole
                );
            }
        });

        netClient.on('disconnected', () => {
            setConnectionStatus('disconnected');
            stopAnswerTimer();
        });

        netClient.on('server_error', (payload) => {
            haptic('error');
            showToast(payload.message || 'Ошибка', 'error');

            // In-game errors ("button not active", "already answered"...) must not throw the player out of the game
            const isJoining = !state.selfPlayer || state.currentScreen === 'join';
            if (!isJoining) return;

            elements.joinError.textContent = payload.message || 'Ошибка сервера';
            elements.joinError.classList.remove('hidden');

            // If host role was taken, automatically switch role selector to player
            if (payload.code === 'HOST_ALREADY_EXISTS') {
                if (typeof selectRole === 'function') {
                    selectRole('player');
                }
            }
            showScreen('join');
        });

        netClient.on('room_state', (payload) => {
            updateRoomBadge(payload.roomCode);

            if (payload.self) {
                state.selfPlayer = Object.assign({}, state.selfPlayer || {}, payload.self);
                updatePlayerBadge(payload.self);
                localStorage.setItem(STORAGE_KEYS.NAME, payload.self.name);
                localStorage.setItem(STORAGE_KEYS.AVATAR, payload.self.avatar);
                if (payload.self.role) {
                    state.selectedRole = payload.self.role;
                    localStorage.setItem(STORAGE_KEYS.ROLE, payload.self.role);
                }
            }

            if (payload.role) {
                state.selectedRole = payload.role;
                localStorage.setItem(STORAGE_KEYS.ROLE, payload.role);
            }

            if (payload.sessionToken) {
                state.sessionToken = payload.sessionToken;
                localStorage.setItem(STORAGE_KEYS.TOKEN, payload.sessionToken);
            }

            const roomCost = payload.cost || payload.currentCost;
            if (roomCost) {
                state.currentCost = roomCost;
                elements.buzzerCostBadge.textContent = `${roomCost} очков`;
            }
            if (payload.currentQuestion && payload.currentQuestion.type) {
                state.questionType = payload.currentQuestion.type;
            }

            if (payload.board) {
                state.boardData = payload.board;
            }

            renderPlayersList(payload.players);

            if (payload.isPaused !== undefined) {
                state.isPaused = Boolean(payload.isPaused);
                if (elements.mobilePauseBanner && !state.isPaused) {
                    elements.mobilePauseBanner.classList.add('hidden');
                }
            }

            // Handle Host Role Screen View
            if (state.selectedRole === 'host') {
                if (payload.auctionBets) {
                    state.liveBets = Object.assign({}, payload.auctionBets);
                    state.betPlaced = {};
                    Object.keys(payload.auctionBets).forEach((id) => { state.betPlaced[id] = true; });
                }
                if (payload.currentQuestion) {
                    state.questionType = payload.currentQuestion.type || state.questionType;
                }
                if (payload.currentQuestion && !state.activeQuestion) {
                    // Page reload / reconnect in the middle of a question
                    state.activeQuestion = payload.currentQuestion;
                    state.activeThemeName = payload.themeName || state.activeThemeName;
                    state.currentCost = payload.currentCost || state.currentCost;
                }
                showScreen('host');
                updateHostScreen(payload.state, payload);
                renderHostPlayersList(payload.players);
                return;
            }

            // Update texts based on state (stale "wrong answer" / "time is up" texts must not stick)

            // Handle Room States for Players
            switch (payload.state) {
                case 'INIT':
                case 'LOBBY':
                    stopAnswerTimer();
                    setWaitingTexts('Ожидание игры', 'Ведущий скоро начнёт игру...');
                    showScreen('waiting');
                    break;

                case 'BOARD':
                    stopAnswerTimer();
                    setWaitingTexts('Внимание на экран!', 'Ведущий выбирает вопрос на табло...');
                    showScreen('waiting');
                    break;

                case 'ROUND_END':
                    stopAnswerTimer();
                    setWaitingTexts('🏁 Раунд завершён', 'Ожидайте начала следующего раунда...');
                    showScreen('waiting');
                    break;

                case 'GAME_OVER':
                    stopAnswerTimer();
                    setWaitingTexts('🏆 Игра окончена', 'Итоги на главном экране. Ожидайте решения ведущего...');
                    showScreen('waiting');
                    break;

                case 'QUESTION_READING':
                    stopAnswerTimer();
                    setBuzzerState('locked');
                    showScreen('buzzer');
                    break;

                case 'BUZZ_ACTIVE': {
                    const openFor = Array.isArray(payload.buzzerOpenFor) ? payload.buzzerOpenFor : null;
                    const selfId = state.selfPlayer && state.selfPlayer.id;
                    state.isEligibleForBuzzer = !openFor || !selfId || openFor.includes(selfId);
                    if (Array.isArray(payload.passedPlayerIds)) {
                        state.isPassed = Boolean(selfId && payload.passedPlayerIds.includes(selfId));
                    }
                    // Reconnect in the middle of a cat / leader question: the obligation must survive it
                    if (selfId && payload.catTargetPlayerId === selfId) {
                        state.mustAnswer = true;
                        state.mustAnswerText = 'Вам назначен «Кот в мешке» — отвечать обязательно';
                    } else if (selfId && payload.auctionLeaderPlayerId === selfId) {
                        state.mustAnswer = true;
                        state.mustAnswerText = 'Вы выиграли торги — отвечать обязательно';
                    }
                    if (state.isEligibleForBuzzer) {
                        showScreen('buzzer');
                        setBuzzerState('ready');
                    } else if (state.currentScreen !== 'waiting') {
                        showScreen('waiting');
                    }
                    break;
                }

                case 'AUCTION_BETTING':
                    state.questionType = (payload.currentQuestion && payload.currentQuestion.type) || state.questionType;
                    if (!state.betSubmitted && state.currentScreen !== 'auction') {
                        state.currentCost = payload.currentCost || state.currentCost;
                        openAuctionScreen(payload.currentCost);
                    }
                    break;

                case 'CAT_CHOOSING':
                    setWaitingTexts('🐱 Кот в мешке', 'Ведущий выбирает, кто будет отвечать на этот вопрос...');
                    showScreen('waiting');
                    break;
            }
        });

        netClient.on('question_active', (payload) => {
            stopAnswerTimer();
            state.currentCost = payload.cost || 100;
            state.isEligibleForBuzzer = true;
            state.activeQuestion = payload.question || null;
            state.activeThemeName = payload.themeName || (payload.question && (payload.question.theme || payload.question.themeName)) || null;
            state.activeAnsweringPlayer = null;
            state.auctionBiddingPlayers = [];
            state.auctionBets = {};
            state.auctionSubmittedAnswers = {};
            state.liveBets = {};
            state.questionType = payload.questionType || (payload.question && payload.question.type) || 'normal';

            if (elements.hostAuctionPanel) elements.hostAuctionPanel.classList.add('hidden');
            if (elements.buzzerBtn) elements.buzzerBtn.style.display = '';

            if (state.selectedRole === 'host') {
                showScreen('host');
                updateHostScreen(payload.state || 'QUESTION_READING', payload);
                return;
            }

            state.questionType = payload.questionType || (payload.question && payload.question.type) || 'normal';
            state.mustAnswer = false;
            state.mustAnswerText = '';
            state.isPassed = false;
            state.betSubmitted = false;
            resetPassConfirm();

            elements.buzzerCostBadge.textContent = `${state.currentCost} очков`;
            elements.answerCostHint.textContent = `Ставка: ${state.currentCost} очков`;

            if (payload.state === 'CAT_CHOOSING') {
                setWaitingTexts('🐱 Кот в мешке', 'Ведущий выбирает, кто будет отвечать на этот вопрос...');
                showScreen('waiting');
                return;
            }
            if (payload.state === 'AUCTION_BETTING') {
                openAuctionScreen(payload.cost);
                return;
            }

            setBuzzerState('locked');
            showScreen('buzzer');
        });

        netClient.on('buzzer_ready', (payload) => {
            if (payload.cost) {
                state.currentCost = payload.cost;
                elements.buzzerCostBadge.textContent = `${state.currentCost} очков`;
            }

            if (state.selectedRole === 'host') {
                updateHostScreen('BUZZ_ACTIVE');
                return;
            }

            // Check if player is allowed to buzz (Requirement 2: Cat in Bag, Requirement 4: Auction for Leader)
            if (payload.allowedPlayerIds && Array.isArray(payload.allowedPlayerIds) && state.selfPlayer) {
                state.isEligibleForBuzzer = payload.allowedPlayerIds.includes(state.selfPlayer.id);
            } else {
                state.isEligibleForBuzzer = true;
            }

            const selfIdForBuzz = state.selfPlayer && state.selfPlayer.id;
            const restrictedQuestion = ['cat', 'secret', 'auction_leader'].includes(state.questionType);
            state.mustAnswer = Boolean(state.isEligibleForBuzzer && restrictedQuestion && selfIdForBuzz
                && Array.isArray(payload.allowedPlayerIds) && payload.allowedPlayerIds.length === 1);
            state.mustAnswerText = state.questionType === 'auction_leader'
                ? 'Вы выиграли торги — отвечать обязательно'
                : 'Вам назначен «Кот в мешке» — отвечать обязательно';

            if (state.isEligibleForBuzzer) {
                if (elements.buzzerBtn) elements.buzzerBtn.style.display = '';
                setBuzzerState('ready');
                showScreen('buzzer');
            } else {
                // Team is not allowed: button must NOT be present!
                if (elements.buzzerBtn) elements.buzzerBtn.style.display = 'none';
                if (elements.waitingTitle) {
                    elements.waitingTitle.textContent = (state.activeQuestion && state.activeQuestion.type === 'cat')
                        ? '🐱 Кот в мешке'
                        : '🔨 Аукцион за лидера';
                }
                if (elements.waitingDesc) {
                    elements.waitingDesc.textContent = (state.activeQuestion && state.activeQuestion.type === 'cat')
                        ? 'Вопрос передан другой команде. Ожидайте ответа...'
                        : (state.activeQuestion && state.activeQuestion.type === 'auction_leader')
                            ? 'Отвечает команда лидера аукциона. Ожидайте ответа...'
                            : 'Вы уже отвечали на этот вопрос. Ожидайте других игроков...';
                }
                showScreen('waiting');
            }
        });

        // Requirement 3: General auction answering
        netClient.on('auction_answer_start', (payload) => {
            stopAnswerTimer();
            state.auctionBiddingPlayers = payload.biddingPlayerIds || [];
            state.auctionBets = payload.bets || {};
            state.auctionSubmittedAnswers = {};
            if (payload.cost) state.currentCost = payload.cost;
            if (payload.question) state.activeQuestion = payload.question;

            if (state.selectedRole === 'host') {
                showScreen('host');
                if (elements.hostAuctionPanel) elements.hostAuctionPanel.classList.remove('hidden');
                if (elements.hostAuctionSecretAnswer) {
                    elements.hostAuctionSecretAnswer.textContent = (state.activeQuestion && (state.activeQuestion.a || state.activeQuestion.answer)) || '—';
                }
                renderHostAuctionList();
                updateHostScreen('AUCTION_ANSWERING');
                return;
            }

            const isBidding = state.selfPlayer && state.auctionBiddingPlayers.includes(state.selfPlayer.id);
            if (isBidding) {
                // Bidding team must type answer instead of buzzer!
                const myBet = (state.auctionBets && state.auctionBets[state.selfPlayer.id]) || state.currentCost;
                if (elements.answerCostHint) {
                    elements.answerCostHint.textContent = `Аукцион: ваша ставка ${myBet}. Отвечать обязательно`;
                }
                if (elements.answerInput) {
                    elements.answerInput.value = '';
                    elements.answerInput.focus();
                }
                showScreen('answer');
                startAnswerTimer(payload.answerTime || 15);
                haptic('buzz_press');
            } else {
                // Passed team does not answer
                if (elements.waitingTitle) elements.waitingTitle.textContent = '🔥 Общий аукцион';
                if (elements.waitingDesc) elements.waitingDesc.textContent = 'Вы спасовали на аукционе. Ожидание ответов соперников...';
                showScreen('waiting');
            }
        });

        netClient.on('buzz_locked', (payload) => {
            if (state.selectedRole === 'host') {
                state.activeAnsweringPlayer = { playerId: payload.playerId, playerName: payload.playerName };
                updateHostScreen('ANSWERING');
                haptic('buzz_press');
                return;
            }

            const isMe = state.selfPlayer && payload.playerId === state.selfPlayer.id;

            if (isMe) {
                haptic('buzz_won');
                setBuzzerState('self');
                showScreen('answer');
                elements.answerInput.value = '';
                elements.answerInput.focus();
                startAnswerTimer(payload.answerTime || 5);
            } else {
                haptic('buzz_lost');
                setBuzzerState('other', { playerName: payload.playerName });
                showScreen('buzzer');
            }
        });

        netClient.on('answer_submitted', (payload) => {
            if (state.selectedRole === 'host') {
                if (payload.isAuction) {
                    if (!state.auctionSubmittedAnswers) state.auctionSubmittedAnswers = {};
                    state.auctionSubmittedAnswers[payload.playerId] = payload.answerText;
                    renderHostAuctionList();
                    haptic('buzz_press');
                    showToast(`Команда ${payload.playerName || ''} ответила на аукционе!`, 'info');
                } else {
                    updateHostScreen('ANSWERING', { answerText: payload.answerText });
                    haptic('buzz_press');
                }
            }
        });

        netClient.on('buzz_reset', () => {
            if (state.selectedRole === 'host') {
                state.activeAnsweringPlayer = null;
                updateHostScreen('BUZZ_ACTIVE');
                return;
            }

            if (state.isEligibleForBuzzer) {
                setBuzzerState('ready');
            }
            showScreen('buzzer');
        });

        netClient.on('answer_timeout', () => {
            stopAnswerTimer();
            haptic('error');

            if (state.selectedRole === 'host') {
                state.activeAnsweringPlayer = null;
                updateHostScreen(state.roomState || 'BUZZ_ACTIVE');
                showToast('Время на ответ вышло!', 'error');
                return;
            }

            showToast('⏰ Время вышло!', 'error');
            if (elements.buzzerBtn) elements.buzzerBtn.style.display = 'none';
            if (elements.waitingTitle) elements.waitingTitle.textContent = '⏰ Время вышло!';
            if (elements.waitingDesc) elements.waitingDesc.textContent = 'Время на ответ истекло';
            showScreen('waiting');
        });

        netClient.on('judge_result', (payload) => {
            stopAnswerTimer();

            if (state.selectedRole === 'host') {
                state.activeAnsweringPlayer = null;
                if (payload.reopened) {
                    updateHostScreen('BUZZ_ACTIVE');
                    showToast(`Неверно (${payload.playerName}). Баззер открыт для остальных!`, 'warning');
                } else {
                    updateHostScreen('BOARD');
                    showToast(payload.isCorrect ? `Верно! (+${payload.cost})` : 'Неверно! Попытки исчерпаны.', payload.isCorrect ? 'success' : 'error');
                }
                return;
            }

            const isMe = state.selfPlayer && payload.playerId === state.selfPlayer.id;

            if (isMe) {
                if (payload.isCorrect) {
                    haptic('success');
                    showToast(`🎉 Верно! +${payload.cost} очков!`, 'success');
                    showScreen('waiting');
                } else {
                    haptic('error');
                    state.isEligibleForBuzzer = false;
                    if (elements.buzzerBtn) elements.buzzerBtn.style.display = 'none';
                    if (elements.waitingTitle) elements.waitingTitle.textContent = '❌ Неверный ответ';
                    if (elements.waitingDesc) {
                        elements.waitingDesc.textContent = payload.reopened
                            ? 'Вы уже отвечали. Ожидайте других игроков...'
                            : 'Вопрос завершён. Ожидайте ведущего...';
                    }
                    showToast('❌ Ответ не зачтён', 'error');
                    showScreen('waiting');
                }
            } else {
                if (payload.isCorrect) {
                    showToast(`Игрок ${payload.playerName} ответил верно!`, 'info');
                    showScreen('waiting');
                } else {
                    if (payload.reopened) {
                        showToast(`Неверно (${payload.playerName})! Баззер снова активен!`, 'warning');
                        if (state.isEligibleForBuzzer) {
                            if (elements.buzzerBtn) elements.buzzerBtn.style.display = '';
                            setBuzzerState('ready');
                            showScreen('buzzer');
                        } else {
                            showScreen('waiting');
                        }
                    } else {
                        showToast(`Неверно (${payload.playerName}). Попытки исчерпаны.`, 'info');
                        showScreen('waiting');
                    }
                }
            }
        });

        netClient.on('game_paused', (payload) => {
            state.isPaused = Boolean(payload.isPaused);
            state.isAnswerTimerPaused = state.isPaused;

            const pauseBanner = elements.mobilePauseBanner;
            if (pauseBanner) {
                if (payload.isPaused) {
                    pauseBanner.classList.remove('hidden');
                    if (elements.mobilePauseText) {
                        elements.mobilePauseText.textContent = payload.reason === 'disconnect'
                            ? `⏸️ Игра на паузе: игрок ${payload.disconnectedPlayerName || ''} отключился`
                            : '⏸️ Игра на паузе';
                    }
                } else {
                    pauseBanner.classList.add('hidden');
                }
            }

            if (state.selectedRole === 'host') {
                updateHostScreen(state.roomState);
            } else {
                if (state.isPaused) {
                    if (elements.buzzerBtn) {
                        elements.buzzerBtn.disabled = true;
                        elements.buzzerBtn.classList.add('state-paused');
                    }
                    if (elements.buzzerText) {
                        state.prePauseBuzzerText = elements.buzzerText.textContent;
                        elements.buzzerText.textContent = '⏸️ ПАУЗА В ИГРЕ';
                    }
                    if (elements.buzzerSubtext) {
                        state.prePauseBuzzerSubtext = elements.buzzerSubtext.textContent;
                        elements.buzzerSubtext.textContent = 'Ожидайте снятия паузы ведущим';
                    }
                    showToast('⏸️ Игра поставлена на паузу', 'warning');
                } else {
                    if (elements.buzzerBtn) {
                        elements.buzzerBtn.classList.remove('state-paused');
                    }
                    if (state.buzzerState === 'ready') {
                        setBuzzerState('ready');
                    } else if (state.buzzerState === 'locked') {
                        setBuzzerState('locked');
                    }
                    showToast('▶️ Игра возобновлена', 'info');
                }
            }
        });

        netClient.on('score_updated', (payload) => {
            if (payload.players) {
                renderPlayersList(payload.players);
                if (state.selectedRole === 'host') {
                    renderHostPlayersList(payload.players);
                }
            }
            if (state.selfPlayer && payload.playerId === state.selfPlayer.id) {
                state.selfPlayer.score = payload.newScore;
                updatePlayerBadge(state.selfPlayer);
            }
        });

        netClient.on('player_joined', (payload) => {
            if (payload.player) {
                showToast(`Вошёл: ${payload.player.name}${payload.role === 'host' ? ' (Ведущий)' : ''}`, 'info', 2000);
                if (state.selfPlayer && (!state.selfPlayer.id || state.selfPlayer.name === payload.player.name)) {
                    state.selfPlayer = Object.assign({}, state.selfPlayer, payload.player);
                }
            }
            const players = netClient.getPlayersList();
            renderPlayersList(players);
            if (state.selectedRole === 'host') {
                renderHostPlayersList(players);
                updateHostScreen(state.roomState);
            }
        });

        netClient.on('player_left', (payload) => {
            if (payload) {
                const isMe = state.selfPlayer && payload.playerId === state.selfPlayer.id;
                const isHostKicked = (payload.role === 'host' || (state.selfPlayer && payload.playerId === state.selfPlayer.id)) && state.selectedRole === 'host';
                if (isMe || (payload.kicked && isHostKicked)) {
                    leaveToMainMenu(payload.kicked ? 'Ведущий был отключен' : 'Вы покинули комнату', 'warning');
                    return;
                }
            }
            const players = netClient.getPlayersList();
            renderPlayersList(players);
            if (state.selectedRole === 'host') {
                renderHostPlayersList(players);
                updateHostScreen(state.roomState);
            }
        });

        netClient.on('player_kicked', (payload) => {
            const isMe = !payload || !payload.playerId || (state.selfPlayer && payload.playerId === state.selfPlayer.id);
            const isHostKicked = payload && (payload.role === 'host' || payload.playerId === 'host_pc') && state.selectedRole === 'host';
            if (isMe || isHostKicked) {
                leaveToMainMenu(payload && payload.message ? payload.message : 'Ведущий был отключен от игры', 'warning');
            }
        });

        netClient.on('round_changed', (payload) => {
            stopAnswerTimer();
            state.activeQuestion = null;
            state.activeAnsweringPlayer = null;
            showToast(`🏁 ${payload.roundName || ('Раунд ' + ((payload.roundIndex || 0) + 1))}`, 'info', 3000);
            if (state.selectedRole === 'host') {
                updateHostScreen('BOARD');
            } else {
                showScreen('waiting');
            }
        });

        netClient.on('show_stats', () => {
            showToast('📊 Статистика отображена на общем экране!', 'info', 3000);
        });

        netClient.on('turn_passed', () => {
            showToast('🔄 Ход передан следующей команде', 'info');
        });

        netClient.on('round_skipped', (payload) => {
            showToast(`⏩ Раунд пропущен ведущим! Переход к раунду ${(payload.roundIndex || 0) + 1}`, 'warning');
        });

        netClient.on('cat_transferred', (payload) => {
            if (state.selectedRole === 'host') return;
            const isTarget = state.selfPlayer && payload.toPlayerId === state.selfPlayer.id;
            if (isTarget) {
                state.mustAnswer = true;
                state.mustAnswerText = 'Вам назначен «Кот в мешке» — отвечать обязательно';
                haptic('buzz_won');
                setWaitingTexts('🐱 Кот достался вам!', 'Вы обязаны ответить на этот вопрос. Приготовьтесь — кнопка скоро откроется.');
                showScreen('waiting');
            } else {
                const targetName = payload.toPlayerName || 'игроку';
                setWaitingTexts('🐱 Кот в мешке', `Отвечает ${targetName}. Вы ждёте.`);
                showScreen('waiting');
            }
        });

        netClient.on('auction_leader_set', (payload) => {
            state.currentCost = payload.bet || state.currentCost;
            if (state.selectedRole === 'host') {
                state.liveBets = state.liveBets || {};
                state.hostLeaderId = payload.leaderPlayerId;
                renderHostSpecialPanel();
                showToast(`Лидер торгов: ${payload.leaderPlayerName} (${payload.bet})`, 'info');
                return;
            }
            const isLeader = state.selfPlayer && payload.leaderPlayerId === state.selfPlayer.id;
            state.betSubmitted = true;
            if (isLeader) {
                state.mustAnswer = true;
                state.mustAnswerText = 'Вы выиграли торги — отвечать обязательно';
                haptic('buzz_won');
                setWaitingTexts('🏆 Вы выиграли торги!', `Ваша ставка: ${payload.bet}. Вы обязаны ответить — приготовьтесь.`);
            } else {
                setWaitingTexts('Торги завершены', `Отвечает ${payload.leaderPlayerName} (ставка ${payload.bet}). Вы ждёте.`);
            }
            showScreen('waiting');
        });

        netClient.on('auction_bet_made', (payload) => {
            if (state.selectedRole !== 'host') return;
            state.liveBets = state.liveBets || {};
            state.liveBets[payload.playerId] = Number(payload.amount) || 0;
            state.betPlaced = state.betPlaced || {};
            state.betPlaced[payload.playerId] = true;
            renderHostSpecialPanel();
        });

        netClient.on('player_passed', (payload) => {
            const isMe = state.selfPlayer && payload.playerId === state.selfPlayer.id;
            if (state.selectedRole === 'host') {
                showToast(`${payload.playerName} — пас`, 'info');
                return;
            }
            if (isMe) {
                state.isPassed = true;
                updatePassControls();
                setWaitingTexts('Вы спасовали', 'Вы не отвечаете на этот вопрос. Ждите следующего.');
                showScreen('waiting');
            }
        });

        netClient.on('question_closed', () => {
            stopAnswerTimer();
            state.mustAnswer = false;
            state.isPassed = false;
            state.betSubmitted = false;
            state.activeQuestion = null;
            state.activeThemeName = null;
            state.activeAnsweringPlayer = null;
            if (state.selectedRole === 'host') {
                // keep ROUND_END / GAME_OVER: they carry the "next round" / "stats" buttons
                const keep = (state.roomState === 'ROUND_END' || state.roomState === 'GAME_OVER');
                updateHostScreen(keep ? state.roomState : 'BOARD');
            } else {
                showScreen('waiting');
            }
        });

        netClient.on('game_finished', (payload) => {
            haptic('success');
            showToast('🎉 Игра завершена! Возврат в главное меню...', 'info', 3000);
            setTimeout(() => {
                leaveToMainMenu();
            }, 2000);
        });

        netClient.connect().catch((err) => {
            console.warn('Initial WebSocket connection error:', err.message);
            setConnectionStatus('disconnected');
        });
    }

    // Role Selection Helper (available in outer scope)
    function selectRole(role) {
        state.selectedRole = role === 'host' ? 'host' : 'player';
        localStorage.setItem(STORAGE_KEYS.ROLE, state.selectedRole);

        if (elements.btnRolePlayer && elements.btnRoleHost) {
            if (state.selectedRole === 'host') {
                elements.btnRoleHost.classList.add('selected');
                elements.btnRoleHost.setAttribute('aria-checked', 'true');
                elements.btnRolePlayer.classList.remove('selected');
                elements.btnRolePlayer.setAttribute('aria-checked', 'false');

                // Host default avatar if still cat
                if (state.selectedAvatar === '🐱') {
                    state.selectedAvatar = '🎙️';
                    document.querySelectorAll('.avatar-btn').forEach(b => {
                        b.classList.toggle('selected', b.dataset.avatar === '🎙️');
                    });
                }
            } else {
                elements.btnRolePlayer.classList.add('selected');
                elements.btnRolePlayer.setAttribute('aria-checked', 'true');
                elements.btnRoleHost.classList.remove('selected');
                elements.btnRoleHost.setAttribute('aria-checked', 'false');

                if (state.selectedAvatar === '🎙️') {
                    state.selectedAvatar = '🐱';
                    document.querySelectorAll('.avatar-btn').forEach(b => {
                        b.classList.toggle('selected', b.dataset.avatar === '🐱');
                    });
                }
            }
        }
    }

    // =========================================================================
    // =========================================================================
    // Leave to Main Menu
    // =========================================================================
    function leaveToMainMenu(customMessage = null, toastType = 'info') {
        if (elements.modalExitConfirm) {
            elements.modalExitConfirm.classList.add('hidden');
        }
        stopAnswerTimer();
        if (netClient) {
            try {
                netClient.disconnect();
            } catch (e) {}
        }
        state.roomCode = null;
        state.sessionToken = null;
        state.selfPlayer = null;
        state.activeQuestion = null;
        state.activeAnsweringPlayer = null;
        state.isPaused = false;
        state.roomState = 'LOBBY';
        state.boardData = null;
        state.hostCustomN = 100;
        state.auctionBiddingPlayers = [];
        state.auctionBets = {};
        state.auctionSubmittedAnswers = {};
        if (elements.hostPlayersList) elements.hostPlayersList.innerHTML = '';
        if (elements.hostBoardGrid) elements.hostBoardGrid.innerHTML = '';
        localStorage.removeItem(STORAGE_KEYS.TOKEN);
        localStorage.removeItem(STORAGE_KEYS.ROOM);

        if (elements.headerRoomBadge) elements.headerRoomBadge.classList.add('hidden');
        if (elements.headerPlayerBadge) elements.headerPlayerBadge.classList.add('hidden');
        if (elements.reconnectBanner) elements.reconnectBanner.classList.add('hidden');
        if (elements.exitMenuBtn) elements.exitMenuBtn.classList.add('hidden');

        if (elements.mobilePauseBanner) elements.mobilePauseBanner.classList.add('hidden');

        // When host is kicked or leaves, reset selected role to player
        if (state.selectedRole === 'host') {
            selectRole('player');
        }

        // Keep room code in input field if present in URL
        const urlRoom = getRoomCodeFromUrl();
        if (urlRoom && elements.roomCodeInput) {
            elements.roomCodeInput.value = urlRoom;
        }

        showScreen('join');
        showToast(customMessage || 'Вы вышли в главное меню', toastType);

        // Reconnect network client so user can enter new room immediately
        initNetworkClient();
    }

    // UI Event Handlers
    // =========================================================================
    function setupEventHandlers() {
        // Exit to Menu Handlers
        if (elements.exitMenuBtn) {
            elements.exitMenuBtn.addEventListener('click', () => {
                if (elements.modalExitConfirm) {
                    elements.modalExitConfirm.classList.remove('hidden');
                }
            });
        }

        if (elements.btnCancelExit) {
            elements.btnCancelExit.addEventListener('click', () => {
                if (elements.modalExitConfirm) {
                    elements.modalExitConfirm.classList.add('hidden');
                }
            });
        }

        if (elements.btnConfirmExit) {
            elements.btnConfirmExit.addEventListener('click', () => {
                if (state.selectedRole === 'host' && netClient && netClient.isConnected) {
                    try {
                        netClient.finishGame({
                            reason: 'early_exit',
                            message: 'Ведущий покинул игру'
                        });
                    } catch (e) {}
                }
                leaveToMainMenu();
            });
        }

        // Host Phone Remote Controls (TASK-04)
        if (elements.btnHostJudgeCorrect) {
            elements.btnHostJudgeCorrect.addEventListener('click', () => {
                if (!netClient) return;
                netClient.judgeAnswer(true, false);
                haptic('buzz_won');
                showToast('Ответ засчитан!', 'success');
            });
        }

        if (elements.btnHostJudgeWrong) {
            elements.btnHostJudgeWrong.addEventListener('click', () => {
                if (!netClient) return;
                netClient.judgeAnswer(false, false);
                haptic('buzz_lost');
                showToast('Ответ отклонён без вычета', 'info');
            });
        }

        if (elements.btnHostJudgeWrongPenalty) {
            elements.btnHostJudgeWrongPenalty.addEventListener('click', () => {
                if (!netClient) return;
                netClient.judgeAnswer(false, true);
                haptic('buzz_lost');
                showToast('Ответ отклонён со штрафом!', 'error');
            });
        }

        if (elements.btnHostPassTurn) {
            elements.btnHostPassTurn.addEventListener('click', () => {
                if (!netClient) return;
                netClient.passTurn();
                haptic('buzz_press');
                showToast('Ход передан', 'info');
            });
        }

        if (elements.btnHostSkipRound) {
            elements.btnHostSkipRound.addEventListener('click', () => {
                if (!netClient) return;
                if (confirm('Пропустить текущий раунд и перейти к следующему?')) {
                    netClient.skipRound();
                    haptic('buzz_press');
                    showToast('Раунд пропущен', 'info');
                }
            });
        }

        if (elements.btnHostAddAllScores && elements.modalHostAllScores) {
            elements.btnHostAddAllScores.addEventListener('click', () => {
                elements.modalHostAllScores.classList.remove('hidden');
                if (elements.hostAllScoresInput) {
                    elements.hostAllScoresInput.value = state.currentCost || 100;
                    elements.hostAllScoresInput.focus();
                }
            });
        }

        const closeAllScoresModal = () => {
            if (elements.modalHostAllScores) {
                elements.modalHostAllScores.classList.add('hidden');
            }
        };

        if (elements.btnCloseAllScoresModal) elements.btnCloseAllScoresModal.addEventListener('click', closeAllScoresModal);
        if (elements.btnCancelAllScores) elements.btnCancelAllScores.addEventListener('click', closeAllScoresModal);
        if (elements.modalAllScoresBackdrop) elements.modalAllScoresBackdrop.addEventListener('click', closeAllScoresModal);

        document.querySelectorAll('.preset-score-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (elements.hostAllScoresInput) {
                    elements.hostAllScoresInput.value = btn.dataset.val || '100';
                }
            });
        });

        if (elements.btnConfirmAllScores) {
            elements.btnConfirmAllScores.addEventListener('click', () => {
                if (!netClient) return;
                const delta = Math.abs(parseInt(elements.hostAllScoresInput ? elements.hostAllScoresInput.value : 100, 10)) || 100;
                netClient.updateAllScores(delta);
                closeAllScoresModal();
                haptic('buzz_press');
                showToast(`Всем командам начислено +${delta} очков!`, 'success');
            });
        }

        if (elements.btnHostPause) {
            elements.btnHostPause.addEventListener('click', () => {
                if (!netClient) return;
                state.isPaused = !state.isPaused;
                netClient.togglePause(state.isPaused);
                updateHostScreen(state.roomState);
                haptic('buzz_press');
                showToast(state.isPaused ? 'Игра на паузе' : 'Игра продолжена', 'info');
            });
        }

        if (elements.btnHostShowAnswer) {
            elements.btnHostShowAnswer.addEventListener('click', () => {
                if (!netClient) return;
                netClient.showAnswer();
                haptic('buzz_press');
                showToast('Ответ отображён на ТВ', 'success');
            });
        }

        if (elements.btnHostCloseQuestion) {
            elements.btnHostCloseQuestion.addEventListener('click', () => {
                if (!netClient) return;
                netClient.closeQuestion();
                state.activeQuestion = null;
                state.activeAnsweringPlayer = null;
                updateHostScreen('BOARD');
                haptic('buzz_press');
                showToast('Вопрос закрыт, переход к табло', 'info');
            });
        }

        if (elements.btnHostStartGame) {
            elements.btnHostStartGame.addEventListener('click', () => {
                if (!netClient) return;
                const playersList = netClient.getPlayersList() || [];
                const activePlayers = playersList.filter(p => p.isConnected && p.role !== 'host');
                if (activePlayers.length < 1) {
                    haptic('buzz_lost');
                    showToast(`⚠️ Требуется минимум 1 игрок (сейчас: ${activePlayers.length})`, 'warning');
                    return;
                }
                netClient.startGame();
                haptic('success');
                showToast('Запуск игры...', 'success');
            });
        }
        if (elements.btnHostNextRound) {
            elements.btnHostNextRound.addEventListener('click', () => {
                if (!netClient) return;
                netClient.nextRound();
                haptic('success');
                showToast('🚀 Переход к следующему раунду...', 'info');
            });
        }

        if (elements.btnHostShowStats) {
            elements.btnHostShowStats.addEventListener('click', () => {
                if (!netClient) return;
                netClient.showStats();
                haptic('success');
                showToast('🏆 Показ статистики на ТВ...', 'info');
            });
        }

        // Role Selector buttons (TASK-03)
                if (elements.btnHostRestartLobby) {
            elements.btnHostRestartLobby.addEventListener('click', () => {
                if (!netClient) return;
                netClient.resetToLobby();
                haptic('success');
                showToast('🔄 Возврат в лобби...', 'info');
            });
        }

        if (elements.btnRolePlayer) {
            elements.btnRolePlayer.addEventListener('click', () => selectRole('player'));
        }
        if (elements.btnRoleHost) {
            elements.btnRoleHost.addEventListener('click', () => selectRole('host'));
        }

        // Avatar selection
        elements.avatarGrid.addEventListener('click', (e) => {
            const btn = e.target.closest('.avatar-btn');
            if (!btn) return;
            document.querySelectorAll('.avatar-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            state.selectedAvatar = btn.dataset.avatar;
            localStorage.setItem(STORAGE_KEYS.AVATAR, state.selectedAvatar);
        });

        // Join Form Submit
        elements.joinForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const roomCode = (elements.roomCodeInput.value || '').toUpperCase().trim();
            const playerName = (elements.playerNameInput.value || '').trim();

            if (!roomCode || roomCode.length < 4) {
                elements.joinError.textContent = 'Введите корректный 4-значный код комнаты';
                elements.joinError.classList.remove('hidden');
                return;
            }

            if (!playerName) {
                elements.joinError.textContent = 'Введите ваше имя или никнейм';
                elements.joinError.classList.remove('hidden');
                return;
            }

            state.roomCode = roomCode;
            state.selfPlayer = {
                name: playerName,
                avatar: state.selectedAvatar,
                role: state.selectedRole,
                score: 0
            };

            localStorage.setItem(STORAGE_KEYS.ROOM, roomCode);
            localStorage.setItem(STORAGE_KEYS.NAME, playerName);
            localStorage.setItem(STORAGE_KEYS.ROLE, state.selectedRole);
            localStorage.setItem(STORAGE_KEYS.AVATAR, state.selectedAvatar);

            elements.joinError.classList.add('hidden');
            updateRoomBadge(roomCode);
            updatePlayerBadge(state.selfPlayer);

            if (!netClient || !netClient.isConnected) {
                initNetworkClient();
            } else {
                netClient.joinRoom(roomCode, playerName, state.selectedAvatar, state.sessionToken, state.selectedRole);
            }

            if (state.selectedRole === 'host') {
                showScreen('host');
                updateHostScreen('LOBBY');
            } else {
                showScreen('waiting');
            }
            showToast('Подключение к комнате...', 'info');
        });

        // Quick Reconnect Button
        elements.btnReconnectQuick.addEventListener('click', () => {
            const savedRoom = localStorage.getItem(STORAGE_KEYS.ROOM);
            const savedName = localStorage.getItem(STORAGE_KEYS.NAME);
            const savedRole = localStorage.getItem(STORAGE_KEYS.ROLE) || 'player';
            const savedToken = localStorage.getItem(STORAGE_KEYS.TOKEN);
            const savedAvatar = localStorage.getItem(STORAGE_KEYS.AVATAR) || '🐱';

            if (savedRoom && savedName) {
                state.roomCode = savedRoom;
                state.sessionToken = savedToken;
                selectRole(savedRole);
                state.selfPlayer = { name: savedName, avatar: savedAvatar, role: savedRole, score: 0 };

                updateRoomBadge(savedRoom);
                updatePlayerBadge(state.selfPlayer);

                if (!netClient || !netClient.isConnected) {
                    initNetworkClient();
                } else {
                    netClient.joinRoom(savedRoom, savedName, savedAvatar, savedToken, savedRole);
                }

                if (savedRole === 'host') {
                    showScreen('host');
                    updateHostScreen('LOBBY');
                } else {
                    showScreen('waiting');
                }
                showToast('Восстановление сессии...', 'info');
            }
        });

        // Giant Buzzer Click
        elements.buzzerBtn.addEventListener('click', () => {
            if (state.buzzerState !== 'ready') return;
            haptic('buzz_press');

            if (netClient) {
                netClient.buzz();
            }
        });

        // Answer Form Submit
        elements.answerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = (elements.answerInput.value || '').trim();
            if (netClient) {
                netClient.submitAnswer(text);
            }
            haptic('success');
            stopAnswerTimer();
            if (state.questionType === 'auction' || state.questionType === 'auction_all') {
                setWaitingTexts('Ответ отправлен', 'Ведущий проверит ответы и начислит или спишет ставку.');
                showScreen('waiting');
            } else {
                showToast('Ответ отправлен ведущему!', 'success');
                showScreen('buzzer');
            }
        });

        // Auction Steppers & Quick Bets
        elements.btnBetMinus.addEventListener('click', () => {
            const current = parseInt(elements.betInput.value, 10) || 100;
            const min = parseInt(elements.betInput.min, 10) || 100;
            elements.betInput.value = clampBet(current - 100);
        });

        elements.btnBetPlus.addEventListener('click', () => {
            const current = parseInt(elements.betInput.value, 10) || 100;
            elements.betInput.value = clampBet(current + 100);
        });

        document.querySelectorAll('.btn-quick-bet[data-add]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const add = parseInt(btn.dataset.add, 10) || 0;
                const current = parseInt(elements.betInput.value, 10) || 100;
                elements.betInput.value = current + add;
            });
        });



        elements.btnVaBank.addEventListener('click', () => {
            elements.betInput.value = clampBet(state.betMax || 0);
            showToast('Ва-банк: вся сумма на ставке', 'info');
        });

        elements.betInput.addEventListener('change', () => {
            elements.betInput.value = clampBet(elements.betInput.value);
        });

        elements.auctionForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const amount = clampBet(elements.betInput.value);
            elements.betInput.value = amount;
            if (netClient) {
                netClient.auctionBet(amount);
            }
            state.betSubmitted = true;
            haptic('success');
            setWaitingTexts('Ставка принята', state.questionType === 'auction_leader'
                ? `Ваша ставка: ${amount}. Ждём остальных — отвечает самая высокая.`
                : `Ваша ставка: ${amount}. Если ведущий откроет вопрос — вы обязаны ответить.`);
            showScreen('waiting');
        });

        elements.btnPassBet.addEventListener('click', () => {
            if (netClient) {
                netClient.auctionBet(0);
            }
            state.betSubmitted = true;
            setWaitingTexts('Вы спасовали', 'Вы не участвуете в этом аукционе. Ждите следующего вопроса.');
            showScreen('waiting');
        });

        // Pass on a regular question: two taps (second one confirms)
        if (elements.btnPassQuestion) {
            elements.btnPassQuestion.addEventListener('click', () => {
                if (!netClient) return;
                if (!elements.btnPassQuestion.classList.contains('confirm')) {
                    elements.btnPassQuestion.classList.add('confirm');
                    elements.btnPassQuestion.textContent = 'Точно спасовать? Нажмите ещё раз';
                    haptic('buzz_press');
                    state.passConfirmTimer = setTimeout(resetPassConfirm, 3000);
                    return;
                }
                resetPassConfirm();
                netClient.passQuestion();
            });
        }

        // Cat Confirmation Click
        elements.btnConfirmCat.addEventListener('click', () => {
            if (!state.selectedCatTargetId || !netClient) return;
            netClient.catTransfer(state.selectedCatTargetId);
            showToast('Вопрос передан сопернику!', 'success');
            haptic('success');
            showScreen('waiting');
        });

        // Room Code Input Auto-uppercase
        elements.roomCodeInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        });

        // Auto-reconnect on visibility change & online
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                if (netClient && !netClient.isConnected && state.roomCode) {
                    console.log('App returned from background, reconnecting...');
                    netClient.connect().catch(() => {});
                }
            }
        });

        window.addEventListener('online', () => {
            console.log('Device returned online, reconnecting...');
            if (netClient && !netClient.isConnected) {
                netClient.connect().catch(() => {});
            }
        });
    }

    // =========================================================================
    // Initialization & Pre-fill from URL
    // =========================================================================
    function getRoomCodeFromUrl() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            let code = urlParams.get('room') || 
                       urlParams.get('roomCode') || 
                       urlParams.get('code') || 
                       urlParams.get('r') ||
                       urlParams.get('ROOM') || 
                       urlParams.get('CODE');
            if (code) return code.toUpperCase().trim();

            if (window.location.hash) {
                const hash = window.location.hash;
                const qIdx = hash.indexOf('?');
                const hashQuery = qIdx !== -1 ? hash.slice(qIdx + 1) : hash.replace(/^[#/]+/, '');
                const hashParams = new URLSearchParams(hashQuery);
                code = hashParams.get('room') || 
                       hashParams.get('roomCode') || 
                       hashParams.get('code') || 
                       hashParams.get('r') ||
                       hashParams.get('ROOM') || 
                       hashParams.get('CODE');
                if (code) return code.toUpperCase().trim();

                const cleanHash = hash.replace(/^[#/]+/, '').trim().toUpperCase();
                if (/^[A-Z0-9]{4}$/.test(cleanHash)) {
                    return cleanHash;
                }
            }
        } catch (e) {
            console.warn('Error reading room code from URL:', e);
        }
        return null;
    }

    function init() {
        initTheme();
        setupEventHandlers();

        // Check URL for room code (?room=ABCD or #room=ABCD)
        const urlRoom = getRoomCodeFromUrl();

        // Restore saved player preferences
        const savedRoom = localStorage.getItem(STORAGE_KEYS.ROOM);
        const savedName = localStorage.getItem(STORAGE_KEYS.NAME);
        const savedRole = localStorage.getItem(STORAGE_KEYS.ROLE);
        const savedAvatar = localStorage.getItem(STORAGE_KEYS.AVATAR);
        const savedToken = localStorage.getItem(STORAGE_KEYS.TOKEN);

        if (savedRole) {
            selectRole(savedRole);
        }

        if (savedAvatar) {
            state.selectedAvatar = savedAvatar;
            document.querySelectorAll('.avatar-btn').forEach((b) => {
                b.classList.toggle('selected', b.dataset.avatar === savedAvatar);
            });
        }

        if (savedName) {
            elements.playerNameInput.value = savedName;
        }

        if (urlRoom) {
            // Automatically pre-fill and set room code from scanned QR code
            if (elements.roomCodeInput) elements.roomCodeInput.value = urlRoom;
            state.roomCode = urlRoom;
            updateRoomBadge(urlRoom);
            localStorage.setItem(STORAGE_KEYS.ROOM, urlRoom);

            // If scanned QR code is for a different room, clear old token
            if (savedRoom && savedRoom !== urlRoom) {
                state.sessionToken = null;
                localStorage.removeItem(STORAGE_KEYS.TOKEN);
            }
        } else if (savedRoom) {
            if (elements.roomCodeInput) elements.roomCodeInput.value = savedRoom;
        }

        // Show reconnect banner only if saved session matches the active room
        const isSameRoom = !urlRoom || (savedRoom === urlRoom);
        if (isSameRoom && savedToken && savedRoom && savedName) {
            state.sessionToken = savedToken;
            elements.reconnectAvatar.textContent = savedAvatar || (savedRole === 'host' ? '🎙️' : '🐱');
            elements.reconnectName.textContent = savedName + (savedRole === 'host' ? ' (Ведущий)' : '');
            elements.reconnectRoom.textContent = `Комната: ${savedRoom}`;
            elements.reconnectBanner.classList.remove('hidden');
        } else {
            elements.reconnectBanner.classList.add('hidden');
        }

        // Auto-connect to WebSocket server
        initNetworkClient();
    }

    // Refresh pre-filled room code on pageshow (e.g. Safari back-forward cache) & hashchange
    window.addEventListener('pageshow', () => {
        const urlRoom = getRoomCodeFromUrl();
        if (urlRoom && elements.roomCodeInput) {
            elements.roomCodeInput.value = urlRoom;
            state.roomCode = urlRoom;
            updateRoomBadge(urlRoom);
        }
    });

    window.addEventListener('hashchange', () => {
        const urlRoom = getRoomCodeFromUrl();
        if (urlRoom && elements.roomCodeInput) {
            elements.roomCodeInput.value = urlRoom;
            state.roomCode = urlRoom;
            updateRoomBadge(urlRoom);
        }
    });

    // Start on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
