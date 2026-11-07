const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/game.js', 'utf8');
function setup(online = false) {
    const nodes = new Map();
    function node(id) {
        if (!nodes.has(id)) nodes.set(id, {
            src: '', ended: false, hidden: true, style: {}, classList: { add() {}, remove() {} },
            getAttribute() { return this.src; }, pause() {}, play() { return Promise.resolve(); }
        });
        return nodes.get(id);
    }
    const ctx = { document: { getElementById: node }, isOnlineGame: online, isGlobalTimerPaused: false,
        lastServerRoomState: 'QUESTION_READING', configThinkingTime: 30,
        hostNetworkClient: { isConnected: true, activateBuzzer() { ctx.requests++; } },
        stopTimer() {}, startTimer() { ctx.starts++; }, playStartThinkingSound() {},
        resolveMediaPath: x => x, requests: 0, starts: 0 };
    vm.createContext(ctx);
    vm.runInContext(source.slice(source.indexOf('let waitingForQuestionMedia'), source.indexOf('function hideGameLayout')), ctx);
    vm.runInContext('waitingForQuestionMedia = true', ctx);
    return { ctx, node };
}
test('Аудио ждёт ended; повторный ended не перезапускает таймер', () => {
    const { ctx, node } = setup();
    ctx.handleQuestionAudio({ audio: 'test.mp3' });
    assert.equal(ctx.starts, 0);
    assert.equal(node('question-audio-visualizer').hidden, false);
    node('modal-question-audio').ended = true;
    ctx.finishQuestionMedia();
    assert.equal(ctx.starts, 1);
    ctx.finishQuestionMedia();
    assert.equal(ctx.starts, 1);
});
test('Одновременные медиа: ждём оба; LAN отправляет команду серверу', () => {
    const { ctx, node } = setup(true);
    node('modal-question-audio').src = 'a.mp3';
    node('modal-question-audio').ended = true;
    node('modal-question-video').src = 'v.mp4';
    ctx.finishQuestionMedia();
    assert.equal(ctx.requests, 0);
    node('modal-question-video').ended = true;
    ctx.finishQuestionMedia();
    assert.equal(ctx.requests, 1);
    assert.equal(ctx.starts, 0);
});
test('Закрытие, пауза и поздний ended не открывают баззер', () => {
    const { ctx } = setup(true);
    ctx.isGlobalTimerPaused = true;
    ctx.startTimerAfterVideo();
    assert.equal(ctx.requests, 0);
    ctx.isGlobalTimerPaused = false;
    ctx.stopQuestionAudio();
    ctx.finishQuestionMedia();
    assert.equal(ctx.requests, 0);
});
test('Заблокированный autoplay показывает кнопку; старый promise её не возвращает', async () => {
    const { ctx, node } = setup();
    node('modal-question-audio').play = () => Promise.reject(new Error('autoplay'));
    ctx.handleQuestionAudio({ music: 'a.mp3' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(node('question-media-play').hidden, false);
    ctx.handleQuestionAudio({ music: 'b.mp3' });
    ctx.stopQuestionAudio();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(node('question-media-play').hidden, true);
});
