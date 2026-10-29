const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const { server, wss, roomManager } = require('../src/server');

function handshake(url, origin, headers) {
    return new Promise((resolve, reject) => {
        const options = { ...(origin === undefined ? {} : { origin }), ...(headers ? { headers } : {}) };
        const ws = new WebSocket(url, options);
        const timer = setTimeout(() => {
            ws.terminate();
            reject(new Error('Не завершена проверка Origin: ' + origin));
        }, 2000);
        function finish(status) {
            clearTimeout(timer);
            resolve(status);
            ws.terminate();
        }
        ws.once('open', () => finish(101));
        ws.once('unexpected-response', (_request, response) => {
            response.resume();
            finish(response.statusCode);
        });
        ws.on('error', error => {
            clearTimeout(timer);
            reject(error);
        });
    });
}

test('BUG-73: Origin проверяет настоящий приватный IP, а не префикс домена', async (t) => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = 'ws://127.0.0.1:' + server.address().port;
    t.after(async () => {
        for (const ws of wss.clients) ws.terminate();
        roomManager.destroy();
        await new Promise(resolve => wss.close(resolve));
        await new Promise(resolve => server.close(resolve));
    });

    const denied = [
        'https://192.168.attacker.example',
        'https://10.attacker.example',
        'https://127.attacker.example',
        'https://172.16.attacker.example',
        'https://169.254.attacker.example',
        'https://172.15.0.1',
        'https://172.32.0.1',
        'https://192.169.0.1',
        'https://8.8.8.8',
        'https://public.example'
    ];
    for (const origin of denied) {
        await t.test('отклоняется ' + origin, async () => {
            assert.equal(await handshake(url, origin), 401);
        });
    }

    const allowed = [
        undefined,
        'null',
        'http://localhost:8080',
        'https://quiz.localhost',
        'http://quiz.local:8080',
        'http://10.0.0.1:8080',
        'http://127.1.2.3:8080',
        'http://192.168.1.9:8080',
        'http://172.16.0.1:8080',
        'http://172.31.255.254:8080',
        'http://169.254.1.2:8080',
        'http://[::1]:8080',
        'tauri://localhost'
    ];
    for (const origin of allowed) {
        await t.test('допускается ' + String(origin), async () => {
            assert.equal(await handshake(url, origin), 101);
        });
    }

    await t.test('сохраняется Origin того же Host', async () => {
        assert.equal(await handshake(url, 'https://quiz.example:8080', { Host: 'quiz.example:8080' }), 101);
    });
});
