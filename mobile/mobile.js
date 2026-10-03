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
        btnHostOpenBuzzer: document.getElementById('btn-host-open-buzzer'),
        btnHostPause: document.getElementById('btn-host-pause'),
        hostPauseIcon: document.getElementById('host-pause-icon'),
        hostPauseText: document.getElementById('host-pause-text'),
        btnHostShowAnswer: document.getElementById('btn-host-show-answer'),
        btnHostCloseQuestion: document.getElementById('btn-host-close-question'),
        btnHostStartGame: document.getElementById('btn-host-start-game'),
        hostLobbyAction: document.getElementById('host-lobby-action'),
        hostPlayersList: document.getElementById('host-players-list'),
        hostPlayersCount: document.getElementById('host-players-count'),

        // Toast
        toast: document.getElementById('mobile-toast'),
        toastIcon: document.getElementById('toast-icon'),
        toastMessage: document.getElementById('toast-message')
    };

    // State
    const state = {
        selectedRole: 'player', // 'player' | 'host' (TASK-03)
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
        roomState: 'LOBBY'
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

        const stepMs = 100;
        const totalSteps = (seconds * 1000) / stepMs;
        let currentStep = totalSteps;

        state.answerTimerInterval = setInterval(() => {
            currentStep--;
            const progress = Math.max(0, currentStep / totalSteps);
            elements.answerTimerBar.style.width = `${progress * 100}%`;

            const secsLeft = Math.ceil(progress * seconds);
            elements.answerTimerNum.textContent = secsLeft;

            if (progress <= 0.3) {
                elements.answerTimerBar.style.backgroundColor = 'var(--accent-red)';
            } else if (progress <= 0.6) {
                elements.answerTimerBar.style.backgroundColor = 'var(--accent-gold)';
            }

            if (currentStep <= 0) {
                clearInterval(state.answerTimerInterval);
                state.answerTimerInterval = null;
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
                'GAME_OVER': 'Игра завершена'
            };
            elements.hostStateBadge.textContent = stateLabels[currentRoomState] || currentRoomState;
        }

        // Meta (Theme & Cost)
        if (elements.hostThemeBadge) {
            const theme = meta.themeName || (state.activeQuestion && (state.activeQuestion.theme || state.activeQuestion.themeName)) || '—';
            elements.hostThemeBadge.textContent = `Тема: ${theme}`;
        }
        if (elements.hostCostBadge) {
            elements.hostCostBadge.textContent = `${state.currentCost} очков`;
        }

        // Lobby action button (Start Game) (TASK-05 validation)
        const playersList = (netClient ? netClient.getPlayersList() : []) || [];
        const activePlayers = playersList.filter(p => p.isConnected && p.role !== 'host');
        const canStart = activePlayers.length >= 2;

        if (elements.hostLobbyAction) {
            if (currentRoomState === 'LOBBY' || currentRoomState === 'INIT') {
                elements.hostLobbyAction.style.display = 'block';
                if (elements.btnHostStartGame) {
                    elements.btnHostStartGame.disabled = !canStart;
                    if (!canStart) {
                        elements.btnHostStartGame.textContent = `🚀 Начать игру (Игроков: ${activePlayers.length}/2)`;
                    } else {
                        elements.btnHostStartGame.textContent = `🚀 Начать игру (${activePlayers.length} игроков)`;
                    }
                }
            } else {
                elements.hostLobbyAction.style.display = 'none';
            }
        }

        // Question text and secret answer card
        if (elements.hostQuestionText) {
            if (state.activeQuestion && (state.activeQuestion.q || state.activeQuestion.text)) {
                elements.hostQuestionText.textContent = state.activeQuestion.q || state.activeQuestion.text;
            } else if (currentRoomState === 'LOBBY' || currentRoomState === 'INIT') {
                elements.hostQuestionText.textContent = 'Ожидание игроков. Нажмите «Начать игру», когда все будут готовы.';
            } else {
                elements.hostQuestionText.textContent = 'Вопрос не выбран. Ожидайте открытия вопроса на табло.';
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

        // Active Answering Player & Judging Buttons
        if (state.activeAnsweringPlayer) {
            if (elements.hostAnsweringBanner) elements.hostAnsweringBanner.classList.remove('hidden');
            if (elements.hostAnsweringName) elements.hostAnsweringName.textContent = `Отвечает: ${state.activeAnsweringPlayer.playerName || 'Игрок'}`;
            if (elements.hostAnsweringSubtext) {
                elements.hostAnsweringSubtext.textContent = meta.answerText
                    ? `Ответ игрока: «${meta.answerText}»`
                    : 'Слушайте ответ вслух или ждите ввода...';
            }
            if (elements.btnHostJudgeCorrect) elements.btnHostJudgeCorrect.disabled = false;
            if (elements.btnHostJudgeWrong) elements.btnHostJudgeWrong.disabled = false;
            if (elements.btnHostJudgeCorrectText) elements.btnHostJudgeCorrectText.textContent = `Зачесть (+${state.currentCost})`;
            if (elements.btnHostJudgeWrongText) elements.btnHostJudgeWrongText.textContent = `Отклонить (-${state.currentCost})`;
        } else {
            if (elements.hostAnsweringBanner) elements.hostAnsweringBanner.classList.add('hidden');
            if (elements.btnHostJudgeCorrect) elements.btnHostJudgeCorrect.disabled = true;
            if (elements.btnHostJudgeWrong) elements.btnHostJudgeWrong.disabled = true;
        }

        // Buzzer open button
        if (elements.btnHostOpenBuzzer) {
            elements.btnHostOpenBuzzer.disabled = (currentRoomState !== 'QUESTION_READING');
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

    function renderHostPlayersList(players) {
        if (!elements.hostPlayersList) return;
        elements.hostPlayersList.innerHTML = '';

        const playerList = (players || []).filter(p => p.role !== 'host');
        if (elements.hostPlayersCount) {
            elements.hostPlayersCount.textContent = `${playerList.length} игроков`;
        }

        if (playerList.length === 0) {
            elements.hostPlayersList.innerHTML = '<div style="color:var(--text-muted); padding:10px; text-align:center;">Ожидание подключения игроков...</div>';
            return;
        }

        playerList.forEach((p) => {
            const row = document.createElement('div');
            row.className = 'host-player-row';
            row.innerHTML = `
                <div class="host-player-info">
                    <span class="host-player-avatar">${p.avatar || '🐱'}</span>
                    <span class="host-player-name">${escapeHtml(p.name)}</span>
                </div>
                <div class="host-player-actions">
                    <button type="button" class="score-step-btn minus" data-id="${p.id}" title="Снять 100">-100</button>
                    <span class="host-player-score">${p.score || 0}</span>
                    <button type="button" class="score-step-btn plus" data-id="${p.id}" title="Добавить 100">+100</button>
                </div>
            `;

            row.querySelector('.minus').addEventListener('click', () => {
                if (netClient) {
                    netClient.updateScore(p.id, -100);
                    haptic('buzz_press');
                }
            });

            row.querySelector('.plus').addEventListener('click', () => {
                if (netClient) {
                    netClient.updateScore(p.id, 100);
                    haptic('buzz_press');
                }
            });

            elements.hostPlayersList.appendChild(row);
        });
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
            elements.joinError.textContent = payload.message || 'Ошибка сервера';
            elements.joinError.classList.remove('hidden');
            haptic('error');
            showToast(payload.message || 'Ошибка', 'error');

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

            if (payload.cost) {
                state.currentCost = payload.cost;
                elements.buzzerCostBadge.textContent = `${payload.cost} очков`;
            }

            renderPlayersList(payload.players);

            // Handle Host Role Screen View
            if (state.selectedRole === 'host') {
                showScreen('host');
                updateHostScreen(payload.state, payload);
                renderHostPlayersList(payload.players);
                return;
            }

            // Update description based on role
            elements.waitingDesc.textContent = 'Ведущий выбирает вопрос на табло...';

            // Handle Room States for Players
            switch (payload.state) {
                case 'INIT':
                case 'LOBBY':
                case 'BOARD':
                case 'ROUND_END':
                case 'GAME_OVER':
                    stopAnswerTimer();
                    showScreen('waiting');
                    break;

                case 'QUESTION_READING':
                    stopAnswerTimer();
                    setBuzzerState('locked');
                    showScreen('buzzer');
                    break;

                case 'BUZZ_ACTIVE':
                    showScreen('buzzer');
                    setBuzzerState('ready');
                    break;

                case 'AUCTION_BETTING':
                    showScreen('auction');
                    elements.auctionNominal.textContent = payload.currentCost || 100;
                    elements.betInput.value = payload.currentCost || 100;
                    elements.betInput.min = payload.currentCost || 100;
                    break;

                case 'CAT_CHOOSING':
                    showScreen('cat');
                    renderCatPlayersList(payload.players);
                    break;
            }
        });

        netClient.on('question_active', (payload) => {
            stopAnswerTimer();
            state.currentCost = payload.cost || 100;
            state.isEligibleForBuzzer = true;
            state.activeQuestion = payload.question || null;
            state.activeAnsweringPlayer = null;

            if (state.selectedRole === 'host') {
                showScreen('host');
                updateHostScreen(payload.state || 'QUESTION_READING', payload);
                return;
            }

            elements.buzzerCostBadge.textContent = `${state.currentCost} очков`;
            elements.answerCostHint.textContent = `Ставка: ${state.currentCost} очков`;
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

            // Check if player is allowed to buzz
            if (payload.allowedPlayerIds && state.selfPlayer) {
                state.isEligibleForBuzzer = payload.allowedPlayerIds.includes(state.selfPlayer.id);
            }

            if (state.isEligibleForBuzzer) {
                setBuzzerState('ready');
            } else {
                setBuzzerState('locked-out');
            }
            showScreen('buzzer');
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
                updateHostScreen('ANSWERING', { answerText: payload.answerText });
                haptic('buzz_press');
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

            showToast('Время на ответ вышло!', 'error');
            setBuzzerState('locked');
            showScreen('buzzer');
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
            }
            const players = netClient.getPlayersList();
            renderPlayersList(players);
            if (state.selectedRole === 'host') {
                renderHostPlayersList(players);
                updateHostScreen(state.roomState);
            }
        });

        netClient.on('player_left', () => {
            const players = netClient.getPlayersList();
            renderPlayersList(players);
            if (state.selectedRole === 'host') {
                renderHostPlayersList(players);
                updateHostScreen(state.roomState);
            }
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
    // UI Event Handlers
    // =========================================================================
    function setupEventHandlers() {
        // Host Phone Remote Controls (TASK-04)
        if (elements.btnHostJudgeCorrect) {
            elements.btnHostJudgeCorrect.addEventListener('click', () => {
                if (!netClient) return;
                netClient.judgeAnswer(true);
                elements.btnHostJudgeCorrect.disabled = true;
                elements.btnHostJudgeWrong.disabled = true;
                haptic('success');
                showToast(`Ответ зачтён (+${state.currentCost})`, 'success');
            });
        }

        if (elements.btnHostJudgeWrong) {
            elements.btnHostJudgeWrong.addEventListener('click', () => {
                if (!netClient) return;
                netClient.judgeAnswer(false);
                elements.btnHostJudgeCorrect.disabled = true;
                elements.btnHostJudgeWrong.disabled = true;
                haptic('error');
                showToast(`Ответ отклонён (-${state.currentCost})`, 'error');
            });
        }

        if (elements.btnHostOpenBuzzer) {
            elements.btnHostOpenBuzzer.addEventListener('click', () => {
                if (!netClient) return;
                netClient.activateBuzzer();
                elements.btnHostOpenBuzzer.disabled = true;
                haptic('buzz_press');
                showToast('Кнопка открыта для игроков', 'info');
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
                if (activePlayers.length < 2) {
                    haptic('buzz_lost');
                    showToast(`⚠️ Требуется минимум 2 игрока (сейчас: ${activePlayers.length})`, 'warning');
                    return;
                }
                netClient.startGame();
                haptic('success');
                showToast('Запуск игры...', 'success');
            });
        }

        // Role Selector buttons (TASK-03)
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
            showToast('Ответ отправлен ведущему!', 'success');
            haptic('success');
            stopAnswerTimer();
            showScreen('buzzer');
        });

        // Auction Steppers & Quick Bets
        elements.btnBetMinus.addEventListener('click', () => {
            const current = parseInt(elements.betInput.value, 10) || 100;
            const min = parseInt(elements.betInput.min, 10) || 100;
            elements.betInput.value = Math.max(min, current - 100);
        });

        elements.btnBetPlus.addEventListener('click', () => {
            const current = parseInt(elements.betInput.value, 10) || 100;
            elements.betInput.value = current + 100;
        });

        document.querySelectorAll('.btn-quick-bet[data-add]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const add = parseInt(btn.dataset.add, 10) || 0;
                const current = parseInt(elements.betInput.value, 10) || 100;
                elements.betInput.value = current + add;
            });
        });

        elements.btnVaBank.addEventListener('click', () => {
            const balance = (state.selfPlayer && state.selfPlayer.score) || 0;
            elements.betInput.value = Math.max(balance, state.currentCost);
            showToast('Ставка ВА-БАНК установлена!', 'info');
        });

        elements.auctionForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const amount = parseInt(elements.betInput.value, 10) || state.currentCost;
            if (netClient) {
                netClient.auctionBet(amount);
            }
            showToast(`Ставка ${amount} очков подтверждена!`, 'success');
            haptic('success');
            showScreen('waiting');
        });

        elements.btnPassBet.addEventListener('click', () => {
            if (netClient) {
                netClient.auctionBet(0);
            }
            showToast('Вы спасовали на аукционе', 'info');
            showScreen('waiting');
        });

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
    function init() {
        initTheme();
        setupEventHandlers();

        // Check URL Query Parameters for room code (?room=ABCD)
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoom = urlParams.get('room');
        if (urlRoom) {
            elements.roomCodeInput.value = urlRoom.toUpperCase().trim();
        }

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

        if (savedRoom && !urlRoom) {
            elements.roomCodeInput.value = savedRoom;
        }

        // Show reconnect banner if existing session data is found
        if (savedToken && savedRoom && savedName) {
            state.sessionToken = savedToken;
            elements.reconnectAvatar.textContent = savedAvatar || (savedRole === 'host' ? '🎙️' : '🐱');
            elements.reconnectName.textContent = savedName + (savedRole === 'host' ? ' (Ведущий)' : '');
            elements.reconnectRoom.textContent = `Комната: ${savedRoom}`;
            elements.reconnectBanner.classList.remove('hidden');
        }

        // Auto-connect to WebSocket server
        initNetworkClient();
    }

    // Start on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
