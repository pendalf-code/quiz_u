const { describe, it } = require('node:test');
const assert = require('node:assert');
const PackParser = require('../js/core/PackParser.js');

describe('Core: PackParser Tests', () => {
    describe('normalizeGameData', () => {
        it('handles null, undefined and empty values', () => {
            assert.deepStrictEqual(PackParser.normalizeGameData(null), []);
            assert.deepStrictEqual(PackParser.normalizeGameData(undefined), []);
            assert.deepStrictEqual(PackParser.normalizeGameData(''), []);
        });

        it('returns array as-is when input is array of rounds', () => {
            const rounds = [{ roundName: 'Раунд 1', themes: [] }];
            assert.strictEqual(PackParser.normalizeGameData(rounds), rounds);
        });

        it('extracts rounds from pack.rounds object with value', () => {
            const pack = { rounds: { value: [{ roundName: 'Раунд 1', themes: [] }] } };
            const result = PackParser.normalizeGameData(pack);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].roundName, 'Раунд 1');
        });

        it('wraps single-round theme object in an array', () => {
            const single = { themes: [{ name: 'Тема', questions: [] }] };
            const result = PackParser.normalizeGameData(single);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].themes[0].name, 'Тема');
        });
    });

    describe('validatePack', () => {
        it('detects empty packs', () => {
            const result = PackParser.validatePack(null);
            assert.strictEqual(result.valid, false);
            assert.ok(result.errors.length > 0);
        });

        it('validates a correct pack structure', () => {
            const validPack = [
                {
                    roundName: 'Раунд 1',
                    themes: [
                        {
                            name: 'История',
                            questions: [
                                { q: 'Год основания Москвы?', a: '1147', cost: 100 },
                                { q: 'Первый император?', a: 'Петр I', cost: 200 }
                            ]
                        }
                    ]
                }
            ];
            const result = PackParser.validatePack(validPack);
            assert.strictEqual(result.valid, true);
            assert.strictEqual(result.errors.length, 0);
            assert.strictEqual(result.roundsCount, 1);
            assert.strictEqual(result.questionsCount, 2);
        });

        it('reports missing question or answer or invalid cost', () => {
            const invalidPack = [
                {
                    roundName: 'Раунд 1',
                    themes: [
                        {
                            name: 'Битые вопросы',
                            questions: [
                                { q: '', a: 'Ответ', cost: 100 },
                                { q: 'Вопрос', a: '', cost: 200 },
                                { q: 'Вопрос 2', a: 'Ответ 2', cost: -50 }
                            ]
                        }
                    ]
                }
            ];
            const result = PackParser.validatePack(invalidPack);
            assert.strictEqual(result.valid, false);
            assert.strictEqual(result.errors.length, 3);
        });
    });

    describe('sanitizeForPlayers (Anti-Cheat)', () => {
        it('completely removes answer field "a" and "a_img" from all questions', () => {
            const pack = [
                {
                    roundName: 'Раунд 1',
                    themes: [
                        {
                            name: 'Кино',
                            questions: [
                                {
                                    q: 'Кто сыграл Нео в Матрице?',
                                    a: 'Киану Ривз (СЕКРЕТНЫЙ ОТВЕТ)',
                                    a_img: 'assets/a_img/matrix.jpg',
                                    cost: 300,
                                    img: 'assets/q_img/neo.jpg'
                                }
                            ]
                        }
                    ]
                }
            ];

            const sanitized = PackParser.sanitizeForPlayers(pack);
            const question = sanitized[0].themes[0].questions[0];

            assert.strictEqual(question.q, 'Кто сыграл Нео в Матрице?');
            assert.strictEqual(question.cost, 300);
            assert.strictEqual(question.img, 'assets/q_img/neo.jpg');
            assert.strictEqual(question.a, undefined, 'Field "a" must NEVER be exposed to players!');
            assert.strictEqual(question.a_img, undefined, 'Field "a_img" must NEVER be exposed to players!');
        });

        it('sanitizes a single active question', () => {
            const singleQ = {
                q: 'Столица Франции?',
                a: 'Париж',
                cost: 200,
                video: 'assets/video/eiffel.mp4'
            };
            const safe = PackParser.sanitizeQuestionForPlayer(singleQ);
            assert.strictEqual(safe.q, 'Столица Франции?');
            assert.strictEqual(safe.cost, 200);
            assert.strictEqual(safe.video, 'assets/video/eiffel.mp4');
            assert.strictEqual(safe.a, undefined);
        });
    });
});
