const test = require('node:test');
const assert = require('node:assert/strict');
const { server, wss, roomManager } = require('../server/src/server');

test('Браузерная игра: основной экран и LAN-пульт загружаются со всеми локальными скриптами', async (t) => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    t.after(async () => {
        roomManager.destroy();
        await new Promise(resolve => wss.close(resolve));
        await new Promise(resolve => server.close(resolve));
    });

    async function get(url) {
        const response = await fetch(url);
        assert.equal(response.status, 200, url);
        return response;
    }

    await t.test('Локальный режим и адаптивные стили доступны по основному адресу', async () => {
        const html = await (await get(origin + '/')).text();
        assert.match(html, /<meta[^>]+name="viewport"/);
        assert.match(html, /onclick="checkSavedGame\(\)"[\s\S]*?Локальная игра/);
        assert.match(html, /id="team-setup-container"/);
        assert.match(html, /id="game-board"/);
        const css = await (await get(origin + '/css/style.css')).text();
        assert.match(css, /@media\s*\(max-width:\s*767px\)/);
    });

    await t.test('Оба браузерных входа разрешают относительные script src через HTTP', async () => {
        for (const pathname of ['/', '/mobile/']) {
            const pageUrl = origin + pathname;
            const html = await (await get(pageUrl)).text();
            const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)]
                .map(match => new URL(match[1], pageUrl))
                .filter(url => url.origin === origin);
            assert.ok(scripts.length > 0, pathname);
            for (const url of scripts) {
                const response = await get(url.href);
                assert.match(response.headers.get('content-type'), /javascript/);
                assert.ok((await response.text()).trim().length > 0, url.href);
            }
        }
        const controller = await (await get(origin + '/mobile/')).text();
        for (const id of ['screen-join', 'screen-host', 'buzzer-btn', 'btn-role-player', 'btn-role-host']) {
            assert.ok(controller.includes('id="' + id + '"'), id);
        }
    });

    await t.test('Манифест веб-пульта, стартовый адрес и иконки остаются доступны', async () => {
        const manifestUrl = origin + '/mobile/manifest.json';
        const manifest = await (await get(manifestUrl)).json();
        assert.ok(manifest.name.includes('Quiz U'));
        assert.equal(manifest.display, 'standalone');
        assert.ok(manifest.icons.length >= 2);
        const startUrl = new URL(manifest.start_url, manifestUrl);
        assert.equal(startUrl.pathname, '/mobile/index.html');
        assert.match((await get(startUrl.href)).headers.get('content-type'), /text\/html/);
        for (const icon of manifest.icons) {
            const response = await get(new URL(icon.src, manifestUrl).href);
            assert.match(response.headers.get('content-type'), /^image\//);
        }
    });
});
