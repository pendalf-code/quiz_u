(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ScoreManager = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * ScoreManager: управление командами, счетом, ставками аукциона, очередью ходов и статистикой.
     */
    class ScoreManager {
        constructor(initialTeams = null) {
            this.teams = [];
            this.gameStats = {};
            this.auctionBets = {};
            this.currentTurnIndex = 0;
            this.listeners = [];

            if (Array.isArray(initialTeams) && initialTeams.length > 0) {
                this.setTeams(initialTeams);
            } else {
                this.setTeams([
                    { name: 'Команда 1', score: 0 },
                    { name: 'Команда 2', score: 0 }
                ]);
            }
        }

        /**
         * Устанавливает список команд.
         * @param {Array<{name: string, score?: number, id?: string}>} newTeams
         */
        setTeams(newTeams) {
            if (!Array.isArray(newTeams)) return;
            this.teams = newTeams.map((t, idx) => ({
                id: t.id || `team_${idx + 1}`,
                name: (t.name && t.name.trim()) ? t.name.trim() : `Команда ${idx + 1}`,
                score: typeof t.score === 'number' && !isNaN(t.score) ? t.score : 0
            }));
            this.currentTurnIndex = 0;
            this.clearAuctionBets();
            this._notifyChange();
        }

        /**
         * Возвращает копию массива команд.
         * @returns {Array<{id: string, name: string, score: number}>}
         */
        getTeams() {
            return this.teams.map(t => ({ ...t }));
        }

        /**
         * Добавляет новую команду.
         * @param {string} name
         * @param {number} initialScore
         * @returns {Object} Созданная команда
         */
        addTeam(name, initialScore = 0) {
            const idx = this.teams.length + 1;
            const newTeam = {
                id: `team_${Date.now()}_${idx}`,
                name: (name && name.trim()) ? name.trim() : `Команда ${idx}`,
                score: typeof initialScore === 'number' ? initialScore : 0
            };
            this.teams.push(newTeam);
            this._notifyChange();
            return { ...newTeam };
        }

        /**
         * Удаляет команду по индексу или id.
         * @param {number|string} teamIdOrIdx
         */
        removeTeam(teamIdOrIdx) {
            const idx = this._resolveTeamIndex(teamIdOrIdx);
            if (idx >= 0 && idx < this.teams.length) {
                this.teams.splice(idx, 1);
                if (this.currentTurnIndex >= this.teams.length) {
                    this.currentTurnIndex = 0;
                }
                this._notifyChange();
            }
        }

        /**
         * Переименовывает команду.
         * @param {number|string} teamIdOrIdx
         * @param {string} newName
         */
        renameTeam(teamIdOrIdx, newName) {
            const idx = this._resolveTeamIndex(teamIdOrIdx);
            if (idx >= 0 && idx < this.teams.length && newName && newName.trim()) {
                this.teams[idx].name = newName.trim();
                this._notifyChange();
            }
        }

        /**
         * Изменяет счет команды и обновляет статистику.
         * @param {number|string} teamIdOrIdx Индекс команды или id
         * @param {number} amount Сумма изменения (+ или -)
         * @param {string} category 'normal' | 'cat' | 'auction' | 'pass'
         */
        changeScore(teamIdOrIdx, amount, category = 'normal') {
            const idx = this._resolveTeamIndex(teamIdOrIdx);
            if (idx < 0 || idx >= this.teams.length) return;

            this.teams[idx].score += amount;

            if (!this.gameStats[idx]) {
                this.gameStats[idx] = { correct: 0, wrong: 0, passes: 0, cats: 0, auctions: 0 };
            }

            if (category === 'pass') {
                this.gameStats[idx].passes++;
            } else {
                if (amount > 0) {
                    this.gameStats[idx].correct++;
                } else if (amount < 0) {
                    this.gameStats[idx].wrong++;
                }
                if (category === 'cat') this.gameStats[idx].cats++;
                if (category === 'auction') this.gameStats[idx].auctions++;
            }

            this._notifyChange();
        }

        /**
         * Применяет изменение очков ко всем командам (например, бонус/штраф раунда).
         * @param {number} delta
         */
        applyScoreChangeForAll(delta) {
            if (typeof delta !== 'number' || isNaN(delta)) return;
            this.teams.forEach((team, idx) => {
                team.score += delta;
                if (!this.gameStats[idx]) {
                    this.gameStats[idx] = { correct: 0, wrong: 0, passes: 0, cats: 0, auctions: 0 };
                }
                if (delta > 0) this.gameStats[idx].correct++;
                else if (delta < 0) this.gameStats[idx].wrong++;
            });
            this._notifyChange();
        }

        /**
         * Устанавливает ставку команды на аукционе.
         * @param {number|string} teamIdOrIdx
         * @param {number} bet
         */
        setAuctionBet(teamIdOrIdx, bet) {
            const idx = this._resolveTeamIndex(teamIdOrIdx);
            if (idx >= 0 && idx < this.teams.length) {
                this.auctionBets[idx] = Math.max(0, Math.floor(bet));
            }
        }

        /**
         * Получает ставку команды.
         * @param {number|string} teamIdOrIdx
         * @returns {number}
         */
        getAuctionBet(teamIdOrIdx) {
            const idx = this._resolveTeamIndex(teamIdOrIdx);
            return typeof this.auctionBets[idx] === 'number' ? this.auctionBets[idx] : 0;
        }

        /**
         * Очищает ставки аукциона.
         */
        clearAuctionBets() {
            this.auctionBets = {};
        }

        /**
         * Вычисляет максимальную допустимую ставку для команды.
         * Правило: max(номинал вопроса, текущий счет команды).
         * @param {number|string} teamIdOrIdx
         * @param {number} nominalCost
         * @returns {number}
         */
        getMaxAllowedBet(teamIdOrIdx, nominalCost = 100) {
            const idx = this._resolveTeamIndex(teamIdOrIdx);
            if (idx < 0 || idx >= this.teams.length) return nominalCost;
            return Math.max(nominalCost, this.teams[idx].score);
        }

        /**
         * Передает ход следующей команде циклически.
         * @returns {number} Новый индекс активной команды
         */
        passTurn() {
            if (this.teams.length === 0) return 0;
            this.currentTurnIndex = (this.currentTurnIndex + 1) % this.teams.length;
            this._notifyChange();
            return this.currentTurnIndex;
        }

        /**
         * Устанавливает индекс команды, делающей ход.
         * @param {number} idx
         */
        setTurnIndex(idx) {
            if (typeof idx === 'number' && idx >= 0 && idx < this.teams.length) {
                this.currentTurnIndex = idx;
                this._notifyChange();
            }
        }

        /**
         * Возвращает команду, чья сейчас очередь выбирать вопрос.
         * @returns {Object|null}
         */
        getTurnTeam() {
            if (this.teams.length === 0) return null;
            return { ...this.teams[this.currentTurnIndex] };
        }

        /**
         * Определяет победителей викторины (с поддержкой ничьей).
         * @returns {{isTie: boolean, maxScore: number, winners: Array<{name: string, score: number}>}}
         */
        determineWinners() {
            if (this.teams.length === 0) {
                return { isTie: false, maxScore: 0, winners: [] };
            }
            let maxScore = -Infinity;
            this.teams.forEach(t => {
                if (t.score > maxScore) maxScore = t.score;
            });
            const winners = this.teams.filter(t => t.score === maxScore);
            return {
                isTie: winners.length > 1,
                maxScore: maxScore,
                winners: winners.map(w => ({ ...w }))
            };
        }

        /**
         * Сбрасывает статистику и счет команд.
         */
        resetScores() {
            this.teams.forEach(t => { t.score = 0; });
            this.gameStats = {};
            this.clearAuctionBets();
            this.currentTurnIndex = 0;
            this._notifyChange();
        }

        /**
         * Подписка на изменения данных команд и счета.
         * @param {Function} listener
         */
        subscribe(listener) {
            if (typeof listener === 'function') {
                this.listeners.push(listener);
            }
        }

        _notifyChange() {
            const snapshot = {
                teams: this.getTeams(),
                currentTurnIndex: this.currentTurnIndex,
                stats: { ...this.gameStats }
            };
            this.listeners.forEach(fn => {
                try {
                    fn(snapshot);
                } catch (e) {
                    console.error('ScoreManager listener error:', e);
                }
            });
        }

        _resolveTeamIndex(teamIdOrIdx) {
            if (typeof teamIdOrIdx === 'number') return teamIdOrIdx;
            if (typeof teamIdOrIdx === 'string') {
                const foundIdx = this.teams.findIndex(t => t.id === teamIdOrIdx);
                if (foundIdx !== -1) return foundIdx;
                const parsed = parseInt(teamIdOrIdx, 10);
                if (!isNaN(parsed)) return parsed;
            }
            return -1;
        }
    }

    return ScoreManager;
}));
