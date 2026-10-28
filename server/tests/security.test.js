const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const { server, wss, roomManager } = require('../src/server');
const { MSG_TYPES, createMessage, parseMessage } = require('../src/protocol');
const Room = require('../src/Room');

function mockWs() {
    return { send() {}, readyState: 1, close() {} };
}

test('Room: names and avatars are plain text of bounded length', () => {
    const room = new Room('SECUR', mockWs(), {});
    const res = room.addPlayer('<img src=x onerror=alert(1)>' + 'я'.repeat(60), '<b>🦊</b>"', mockWs());
    assert.equal(res.success, true);
    assert.ok(!/[<>&"'`]/.test(res.player.name));
    assert.ok(res.player.name.length <= 24);
    assert.equal(res.player.avatar, 'b🦊/b');
    room.destroy();
});

test('Room: a disconnected player or host seat cannot be taken without its token', () => {
    const room = new Room('SECUR', mockWs(), {});
    const host = room.addPlayer('Ведущий', '🎙️', mockWs(), null, 'host');
    const alice = room.addPlayer('Алиса', '🦊', mockWs());
    alice.player.isConnected = false;
    host.player.isConnected = false;

    assert.equal(room.addPlayer('Другой', '🐼', mockWs(), null, 'host').success, false);
    assert.equal(room.addPlayer('Алиса', '🐼', mockWs()).success, false);
    assert.equal(room.addPlayer('Алиса', '🦊', mockWs(), alice.player.sessionToken).success, true);
    assert.equal(room.addPlayer('Ведущий', '🎙️', mockWs(), host.player.sessionToken, 'host').success, true);
    room.destroy();
});

test('Server: range requests, origin check, stats, join brute force', async (t) => {
    let port;
    t.before(async () => {
        await new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
            port = server.address().port;
            resolve();
        }));
    });
    t.after(async () => {
        roomManager.destroy();
        for (const client of wss.clients) client.terminate();
        await new Promise((resolve) => wss.close(() => server.close(resolve)));
    });

    await t.test('Range request returns 206 with the requested bytes', async () => {
        const res = await fetch(`http://127.0.0.1:${port}/js/core/ScoreManager.js`, { headers: { Range: 'bytes=0-9' } });
        assert.equal(res.status, 206);
        assert.equal(res.headers.get('accept-ranges'), 'bytes');
        assert.match(res.headers.get('content-range'), /^bytes 0-9\/\d+$/);
        assert.equal((await res.arrayBuffer()).byteLength, 10);

        const bad = await fetch(`http://127.0.0.1:${port}/js/core/ScoreManager.js`, { headers: { Range: 'bytes=99999999-' } });
        assert.equal(bad.status, 416);
    });

    await t.test('WebSocket from a public web origin is refused, LAN origin is accepted', async () => {
        const refused = await new Promise((resolve) => {
            const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Origin: 'https://evil.example.com' } });
            ws.on('open', () => { ws.close(); resolve(false); });
            ws.on('error', () => resolve(true));
        });
        assert.equal(refused, true);

        const accepted = await new Promise((resolve) => {
            const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Origin: 'http://192.168.1.20:8080' } });
            ws.on('open', () => { ws.close(); resolve(true); });
            ws.on('error', () => resolve(false));
        });
        assert.equal(accepted, true);
    });

    await t.test('Repeated joins with wrong room codes are throttled', async () => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`);
        await new Promise((resolve) => ws.on('open', resolve));
        const messages = [];
        ws.on('message', (d) => messages.push(parseMessage(d)));
        for (let i = 0; i < 12; i++) {
            ws.send(createMessage(MSG_TYPES.PLAYER_JOIN, { roomCode: 'ZZZZZ', name: 'Bot' }));
        }
        await new Promise((r) => setTimeout(r, 300));
        ws.close();
        assert.ok(messages.some((m) => m.payload && /неудачных попыток/.test(m.payload.message)));
    });
});
