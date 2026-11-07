const test = require('node:test');
const assert = require('node:assert/strict');
const Room = require('../src/Room');
const socket = () => ({ readyState: 1, send() {} });
for (const field of ['audio', 'music', 'video']) {
    for (const readingTime of [0, 7]) {
        test(`Медиа ${field}: ожидание окончания, чтение ${readingTime} с`, () => {
            const room = new Room('MEDIA', socket(), { readingTime });
            try {
                room.setPack([{ roundName: 'Раунд', themes: [{ name: 'Тема', questions: [
                    { q: 'Вопрос', a: 'Ответ', cost: 100, [field]: 'assets/test.mp4' }
                ] }] }]);
                room.addPlayer('Игрок', '🙂', socket());
                room.startGame();
                room.selectQuestion(0, 0);
                assert.equal(room.stateMachine.state, 'QUESTION_READING');
                assert.equal(room.readingTimer, null, 'Нет автоматического запуска через 7 секунд');
                assert.equal(room.thinkingTimer, null);
                room.togglePause(true);
                room.togglePause(false);
                assert.equal(room.readingTimer, null, 'Пауза не создаёт таймер чтения');
                assert.equal(room.getStateSnapshot(false).currentQuestion[field], 'assets/test.mp4');
                room.activateBuzzer();
                assert.equal(room.stateMachine.state, 'BUZZ_ACTIVE');
                assert.ok(room.thinkingTimer);
            } finally { room.destroy(); }
        });
    }
}
for (const type of ['cat', 'auction_leader']) {
    test(`Медиа ${type}: решение ведущего сохраняет ожидание и ограничение баззера`, () => {
        const room = new Room('SPECIAL', socket(), { readingTime: 7 });
        try {
            room.setPack([{ roundName: 'Раунд', themes: [{ name: 'Тема', questions: [
                { q: 'Вопрос', a: 'Ответ', cost: 100, type, audio: 'assets/test.mp3' }
            ] }] }]);
            const player = room.addPlayer('Игрок', '🙂', socket()).player;
            room.startGame();
            room.selectQuestion(0, 0);
            assert.equal(room.readingTimer, null);
            if (type === 'cat') room.setCatTarget(player.id);
            else room.setAuctionLeader(player.id, 100);
            assert.equal(room.stateMachine.state, 'QUESTION_READING');
            assert.equal(room.readingTimer, null);
            room.activateBuzzer();
            assert.deepEqual(room.allowedBuzzerPlayerIds, [player.id]);
        } finally { room.destroy(); }
    });
}
