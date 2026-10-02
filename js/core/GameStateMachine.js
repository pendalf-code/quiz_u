(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.GameStateMachine = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * Константы состояний викторины
     */
    const GameStates = {
        INIT: 'INIT',
        LOBBY: 'LOBBY',
        BOARD: 'BOARD',
        QUESTION_READING: 'QUESTION_READING',
        BUZZ_ACTIVE: 'BUZZ_ACTIVE',
        ANSWERING: 'ANSWERING',
        AUCTION_BETTING: 'AUCTION_BETTING',
        CAT_CHOOSING: 'CAT_CHOOSING',
        ROUND_END: 'ROUND_END',
        GAME_OVER: 'GAME_OVER'
    };

    /**
     * GameStateMachine: конечный автомат состояний игрового процесса Quiz U.
     * Реализует чистую логику переходов, таймингов и валидацию действий игроков/хоста.
     */
    class GameStateMachine {
        constructor(config = {}) {
            this.state = GameStates.INIT;
            this.config = Object.assign({
                readingTime: 7,
                thinkingTime: 30,
                answerTime: 5
            }, config);

            this.currentQuestion = null;
            this.activePlayerId = null;
            this.activeTeamId = null;
            this.currentRound = 0;
            this.totalRounds = 0;
            this.answeredPlayersInCurrentQuestion = new Set();
            this.bets = {};
            this.listeners = {};
        }

        /**
         * Текущее состояние игры.
         * @returns {string}
         */
        getState() {
            return this.state;
        }

        /**
         * Переход в состояние LOBBY.
         */
        startLobby() {
            this._transitionTo(GameStates.LOBBY);
        }

        /**
         * Переход к игровому табло раунда.
         * @param {number} roundIndex
         * @param {number} totalRounds
         */
        showBoard(roundIndex = null, totalRounds = null) {
            if (roundIndex !== null) this.currentRound = roundIndex;
            if (totalRounds !== null) this.totalRounds = totalRounds;
            this.currentQuestion = null;
            this.activePlayerId = null;
            this.activeTeamId = null;
            this.answeredPlayersInCurrentQuestion.clear();
            this.bets = {};

            this._transitionTo(GameStates.BOARD, {
                round: this.currentRound,
                totalRounds: this.totalRounds
            });
        }

        /**
         * Запуск вопроса с табло.
         * В зависимости от типа вопроса переходит в QUESTION_READING, AUCTION_BETTING или CAT_CHOOSING.
         * @param {Object} question
         * @param {Object} options
         */
        startQuestion(question, options = {}) {
            if (this.state !== GameStates.BOARD) {
                throw new Error(`Cannot start question from state ${this.state}. Must be in BOARD.`);
            }
            if (!question) {
                throw new Error('Question data is required to start question');
            }

            this.currentQuestion = question;
            this.activePlayerId = null;
            this.activeTeamId = options.turnTeamId || null;
            this.answeredPlayersInCurrentQuestion.clear();
            this.bets = {};

            const qType = question.type || 'normal';

            if (qType === 'cat' || qType === 'secret') {
                this._transitionTo(GameStates.CAT_CHOOSING, {
                    question: question,
                    turnTeamId: this.activeTeamId
                });
            } else if (qType === 'auction' || qType === 'auction_all' || qType === 'auction_leader') {
                this._transitionTo(GameStates.AUCTION_BETTING, {
                    question: question,
                    subType: qType,
                    turnTeamId: this.activeTeamId
                });
            } else {
                this.startReading();
            }
        }

        /**
         * Фаза чтения вопроса ведущим.
         */
        startReading() {
            const validOrigins = [GameStates.BOARD, GameStates.CAT_CHOOSING, GameStates.AUCTION_BETTING];
            if (!validOrigins.includes(this.state)) {
                throw new Error(`Cannot start reading from state ${this.state}`);
            }

            this._transitionTo(GameStates.QUESTION_READING, {
                question: this.currentQuestion,
                duration: this.config.readingTime
            });
        }

        /**
         * Активация кнопки ответа (Buzzer) для игроков и запуск таймера размышления.
         */
        openBuzzer() {
            if (this.state !== GameStates.QUESTION_READING) {
                throw new Error(`Cannot open buzzer from state ${this.state}. Must be in QUESTION_READING.`);
            }

            this._transitionTo(GameStates.BUZZ_ACTIVE, {
                question: this.currentQuestion,
                duration: this.config.thinkingTime,
                excludedPlayers: Array.from(this.answeredPlayersInCurrentQuestion)
            });
        }

        /**
         * Регистрация нажатия кнопки Buzzer игроком.
         * @param {string} playerId
         * @param {string} teamId
         * @returns {boolean} Успешность регистрации
         */
        registerBuzz(playerId, teamId = null) {
            if (this.state !== GameStates.BUZZ_ACTIVE) {
                return false;
            }
            if (this.answeredPlayersInCurrentQuestion.has(playerId)) {
                return false; // Игрок уже пытался ответить в этом вопросе
            }

            this.activePlayerId = playerId;
            this.activeTeamId = teamId;
            this.answeredPlayersInCurrentQuestion.add(playerId);

            this._transitionTo(GameStates.ANSWERING, {
                playerId: playerId,
                teamId: teamId,
                duration: this.config.answerTime
            });
            return true;
        }

        /**
         * Игрок отправляет ответ на вопрос.
         * @param {string} answerText
         */
        submitAnswer(answerText) {
            if (this.state !== GameStates.ANSWERING) {
                throw new Error(`Cannot submit answer in state ${this.state}. Must be in ANSWERING.`);
            }

            this.emit('answer_submitted', {
                playerId: this.activePlayerId,
                teamId: this.activeTeamId,
                answer: answerText,
                correctAnswer: this.currentQuestion ? this.currentQuestion.a : null
            });
        }

        /**
         * Резолюция ответа (ведущий или сервер подтверждает правильность/неправильность).
         * @param {boolean} isCorrect
         * @param {Object} options
         */
        resolveAnswer(isCorrect, options = {}) {
            if (this.state !== GameStates.ANSWERING && this.state !== GameStates.QUESTION_READING) {
                throw new Error(`Cannot resolve answer in state ${this.state}`);
            }

            const payload = {
                isCorrect: !!isCorrect,
                playerId: this.activePlayerId,
                teamId: this.activeTeamId,
                question: this.currentQuestion
            };

            this.emit('answer_resolved', payload);

            if (isCorrect) {
                // Вопрос сыгран — возвращаемся к табло
                this.showBoard();
            } else {
                // Ответ неверный. Если разрешено доигрывание другим командам — возвращаем BUZZ_ACTIVE
                if (options.canOthersBuzz && this.currentQuestion?.type !== 'auction') {
                    this._transitionTo(GameStates.BUZZ_ACTIVE, {
                        question: this.currentQuestion,
                        duration: options.remainingThinkingTime || this.config.thinkingTime,
                        excludedPlayers: Array.from(this.answeredPlayersInCurrentQuestion)
                    });
                } else {
                    this.showBoard();
                }
            }
        }

        /**
         * Завершение таймера без ответа (время истекло).
         */
        timeoutQuestion() {
            if (this.state !== GameStates.BUZZ_ACTIVE && this.state !== GameStates.ANSWERING && this.state !== GameStates.QUESTION_READING) {
                return;
            }
            this.emit('question_timeout', { question: this.currentQuestion });
            this.showBoard();
        }

        /**
         * Передача "Кота в мешке" выбранной команде.
         * @param {string} targetTeamId
         */
        transferCat(targetTeamId) {
            if (this.state !== GameStates.CAT_CHOOSING) {
                throw new Error(`Cannot transfer cat in state ${this.state}. Must be in CAT_CHOOSING.`);
            }

            this.activeTeamId = targetTeamId;
            this.emit('cat_transferred', {
                targetTeamId: targetTeamId,
                question: this.currentQuestion
            });
            this.startReading();
        }

        /**
         * Принятие ставки на аукционе.
         * @param {string} teamId
         * @param {number} amount
         */
        submitAuctionBet(teamId, amount) {
            if (this.state !== GameStates.AUCTION_BETTING) {
                throw new Error(`Cannot submit bet in state ${this.state}. Must be in AUCTION_BETTING.`);
            }

            this.bets[teamId] = amount;
            this.emit('auction_bet_placed', { teamId, amount });
        }

        /**
         * Финализация аукциона: победителем объявляется команда с максимальной ставкой.
         * @param {string} winningTeamId
         * @param {number} finalCost
         */
        finalizeAuction(winningTeamId, finalCost) {
            if (this.state !== GameStates.AUCTION_BETTING) {
                throw new Error(`Cannot finalize auction in state ${this.state}. Must be in AUCTION_BETTING.`);
            }

            this.activeTeamId = winningTeamId;
            if (this.currentQuestion) {
                this.currentQuestion.cost = finalCost;
            }

            this.emit('auction_won', {
                winnerTeamId: winningTeamId,
                cost: finalCost,
                question: this.currentQuestion
            });

            this.startReading();
        }

        /**
         * Завершение текущего раунда.
         */
        endRound() {
            this._transitionTo(GameStates.ROUND_END, {
                round: this.currentRound,
                totalRounds: this.totalRounds
            });
        }

        /**
         * Переход к следующему раунду или завершение игры, если раунд был последним.
         */
        nextRound() {
            if (this.currentRound + 1 >= this.totalRounds) {
                this.finishGame();
            } else {
                this.currentRound++;
                this.showBoard(this.currentRound, this.totalRounds);
            }
        }

        /**
         * Финал игры (показ победителей и салют).
         */
        finishGame() {
            this._transitionTo(GameStates.GAME_OVER, {
                finalRound: this.currentRound
            });
        }

        /**
         * Подписка на события стейт-машины.
         * @param {string} event
         * @param {Function} handler
         */
        on(event, handler) {
            if (!this.listeners[event]) this.listeners[event] = [];
            this.listeners[event].push(handler);
        }

        /**
         * Отписка от событий.
         * @param {string} event
         * @param {Function} handler
         */
        off(event, handler) {
            if (!this.listeners[event]) return;
            this.listeners[event] = this.listeners[event].filter(fn => fn !== handler);
        }

        /**
         * Генерация события.
         * @param {string} event
         * @param {*} data
         */
        emit(event, data) {
            if (!this.listeners[event]) return;
            this.listeners[event].forEach(fn => {
                try {
                    fn(data);
                } catch (e) {
                    console.error(`Error in event handler '${event}':`, e);
                }
            });
        }

        _transitionTo(nextState, payload = {}) {
            const prevState = this.state;
            this.state = nextState;
            this.emit('state_changed', {
                from: prevState,
                to: nextState,
                payload: payload
            });
        }
    }

    GameStateMachine.States = GameStates;
    return GameStateMachine;
}));
