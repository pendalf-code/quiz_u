(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.PackParser = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * PackParser: модуль валидации, нормализации и античит-фильтрации паков вопросов.
     */
    const PackParser = {
        /**
         * Нормализует различные форматы структуры пакета вопросов в единый массив раундов.
         * @param {*} data
         * @returns {Array} Массив раундов
         */
        normalizeGameData: function (data) {
            if (!data) return [];
            if (Array.isArray(data)) return data;
            if (typeof data === 'object') {
                if (Array.isArray(data.value)) return data.value;
                if (Array.isArray(data.rounds)) return data.rounds;
                if (data.rounds && typeof data.rounds === 'object') {
                    if (Array.isArray(data.rounds.value)) return data.rounds.value;
                    if (Array.isArray(data.rounds.rounds)) return data.rounds.rounds;
                    if (data.rounds.themes && Array.isArray(data.rounds.themes)) return [data.rounds];
                }
                if (data.themes && Array.isArray(data.themes)) return [data];
                return [data];
            }
            return [];
        },

        /**
         * Валидирует структуру пакета вопросов.
         * @param {*} data
         * @returns {{valid: boolean, errors: string[], roundsCount: number, questionsCount: number}}
         */
        validatePack: function (data) {
            const errors = [];
            const rounds = this.normalizeGameData(data);
            let totalQuestions = 0;

            if (!rounds || rounds.length === 0) {
                return {
                    valid: false,
                    errors: ['Пакет не содержит раундов или имеет неверную структуру'],
                    roundsCount: 0,
                    questionsCount: 0
                };
            }

            rounds.forEach((round, rIdx) => {
                const roundName = round.roundName || `Раунд ${rIdx + 1}`;
                if (!round.themes || !Array.isArray(round.themes) || round.themes.length === 0) {
                    errors.push(`Раунд "${roundName}" не содержит тем`);
                    return;
                }

                round.themes.forEach((theme, tIdx) => {
                    const themeName = theme.name || `Тема ${tIdx + 1}`;
                    if (!theme.questions || !Array.isArray(theme.questions) || theme.questions.length === 0) {
                        errors.push(`Тема "${themeName}" в раунде "${roundName}" не содержит вопросов`);
                        return;
                    }

                    theme.questions.forEach((q, qIdx) => {
                        totalQuestions++;
                        if (!q || typeof q !== 'object') {
                            errors.push(`Некорректный вопрос #${qIdx + 1} в теме "${themeName}"`);
                            return;
                        }
                        if (typeof q.q !== 'string' || q.q.trim().length === 0) {
                            errors.push(`Отсутствует текст вопроса #${qIdx + 1} в теме "${themeName}"`);
                        }
                        if (typeof q.a !== 'string' || q.a.trim().length === 0) {
                            errors.push(`Отсутствует ответ на вопрос #${qIdx + 1} в теме "${themeName}"`);
                        }
                        if (typeof q.cost !== 'number' || isNaN(q.cost) || q.cost <= 0) {
                            errors.push(`Некорректная стоимость (${q.cost}) вопроса #${qIdx + 1} в теме "${themeName}"`);
                        }
                    });
                });
            });

            return {
                valid: errors.length === 0,
                errors: errors,
                roundsCount: rounds.length,
                questionsCount: totalQuestions
            };
        },

        /**
         * Античит-фильтрация: создает копию пакета/вопроса БЕЗ правильного ответа (field 'a').
         * Предназначено для отправки на клиентские устройства игроков.
         * @param {*} data
         * @returns {*}
         */
        sanitizeForPlayers: function (data) {
            if (!data) return null;
            const rounds = this.normalizeGameData(data);
            return rounds.map(round => ({
                roundName: round.roundName,
                isFinal: !!round.isFinal,
                themes: (round.themes || []).map(theme => ({
                    name: theme.name,
                    questions: (theme.questions || []).map(q => {
                        const sanitized = {
                            cost: q.cost,
                            q: q.q,
                            type: q.type || 'normal',
                            hasMedia: !!(q.img || q.music || q.video)
                        };
                        if (q.img) sanitized.img = q.img;
                        if (q.music) sanitized.music = q.music;
                        if (q.video) sanitized.video = q.video;
                        // Поле 'a' (ответ) и 'a_img' принципиально НЕ включаются!
                        return sanitized;
                    })
                }))
            }));
        },

        /**
         * Античит-фильтрация одиночного активного вопроса.
         * @param {Object} question
         * @returns {Object}
         */
        sanitizeQuestionForPlayer: function (question) {
            if (!question) return null;
            const safe = {
                q: question.q,
                cost: question.cost,
                type: question.type || 'normal'
            };
            if (question.img) safe.img = question.img;
            if (question.music) safe.music = question.music;
            if (question.video) safe.video = question.video;
            return safe;
        }
    };

    return PackParser;
}));
