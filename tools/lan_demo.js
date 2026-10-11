/**
 * LAN-демо: ПК-экран + ведущий (телефон) + 5 игроков по реальному WebSocket.
 * Проверяет кота, аукцион для всех и на лидера, пас, штрафы, реконнекты, паузу и синхронность событий/счетов.
 * Запуск (сервер должен работать):  cd server && npm start   затем   PORT=8080 node tools/lan_demo.js
 * Занимает ~50 с (30 с — окно ввода ответов аукциона). Код выхода 0 — всё прошло.
 */
const { WebSocket } = require('../server/node_modules/ws');
const PORT = process.env.PORT || 8080;
const URL = `ws://127.0.0.1:${PORT}`;

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok: !!ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '\n        -> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Client {
    constructor(name, role) {
        this.name = name; this.role = role; this.log = []; this.mark = 0; this.id = null; this.token = null;
        this.scores = {}; this.lastState = null;
    }
    connect() {
        return new Promise((res, rej) => {
            this.ws = new WebSocket(URL);
            this.ws.on('open', res); this.ws.on('error', rej);
            this.ws.on('message', (d) => {
                const m = JSON.parse(d.toString());
                this.log.push(m);
                const p = m.payload || {};
                if (m.type === 'ROOM_STATE') {
                    this.lastState = p;
                    if (p.self && p.self.id) this.id = p.self.id;
                    if (p.sessionToken) this.token = p.sessionToken;
                    (p.players || []).forEach((x) => { this.scores[x.id] = x.score; });
                }
                if (m.type === 'SCORE_UPDATED') (p.players || []).forEach((x) => { this.scores[x.id] = x.score; });
            });
        });
    }
    send(type, payload = {}) { this.ws.send(JSON.stringify({ type, payload, timestamp: Date.now() })); }
    since(mark = this.mark) { return this.log.slice(mark); }
    async waitFor(type, pred = () => true, timeout = 4000, from = this.mark) {
        const t0 = Date.now();
        for (;;) {
            const hit = this.log.slice(from).find((m) => m.type === type && pred(m.payload || {}));
            if (hit) return hit;
            if (Date.now() - t0 > timeout) return null;
            await sleep(20);
        }
    }
    has(type, pred = () => true, from = this.mark) { return this.log.slice(from).some((m) => m.type === type && pred(m.payload || {})); }
    lastErr(from = this.mark) { const e = this.log.slice(from).filter((m) => m.type === 'ERROR'); return e.length ? e[e.length - 1].payload : null; }
}

const SECRET = (n) => `СЕКРЕТНЫЙ-ОТВЕТ-${n}`;
const PACK = [
    { roundName: 'Раунд 1', themes: [
        { name: 'Разминка', questions: [
            { cost: 100, q: 'Обычный вопрос 100', a: SECRET(0) },
            { cost: 200, q: 'Кот в мешке (правильно)', a: SECRET(1), type: 'cat' },
            { cost: 300, q: 'Кот в мешке (неверно, попытка перехвата)', a: SECRET(2), type: 'cat' }
        ] }
    ] },
    { roundName: 'Раунд 2', themes: [
        { name: 'Торги', questions: [
            { cost: 400, q: 'Аукцион для всех', a: SECRET(3), type: 'auction' },
            { cost: 500, q: 'Аукцион на лидера (верно)', a: SECRET(4), type: 'auction_leader' },
            { cost: 600, q: 'Аукцион на лидера (неверно)', a: SECRET(5), type: 'auction_leader' },
            { cost: 700, q: 'Все пасуют', a: SECRET(6) }
        ] }
    ] }
];

const pc = new Client('ПК', 'pc');
const host = new Client('Ведущий', 'host');
const names = ['Алиса', 'Боб', 'Вика', 'Гоша', 'Дима'];
const pl = names.map((n) => new Client(n, 'player'));
const all = [pc, host, ...pl];
const byName = Object.fromEntries(pl.map((p) => [p.name, p]));
const NONDET = new Set(['ERROR', 'PONG', 'ANSWER_SUBMITTED']);

function norm(m) {
    const p = JSON.parse(JSON.stringify(m.payload || {}));
    if (m.type === 'ROOM_STATE') {
        return { state: p.state, scores: Object.fromEntries((p.players || []).map((x) => [x.id, x.score])), paused: p.isPaused, ab: p.activeBuzzerPlayerId,
            cat: p.catTargetPlayerId, lead: p.auctionLeaderPlayerId, bets: p.auctionBets, open: p.buzzerOpenFor, passed: p.passedPlayerIds, cost: p.currentCost, round: p.currentRoundIndex };
    }
    if (m.type === 'QUESTION_ACTIVE') { p.question = p.question && p.question.q; }
    if (m.type === 'SCORE_UPDATED') { p.players = (p.players || []).map((x) => `${x.id}:${x.score}`); }
    return p;
}

// сверка: все 7 клиентов получили одни и те же события в том же порядке
async function sync(label) {
    await sleep(250);
    const seqs = all.map((c) => c.since().filter((m) => !NONDET.has(m.type) && m.type !== 'PLAYER_JOINED'));
    const ref = seqs[0].map((m) => m.type);
    let ok = true; const diffs = [];
    all.forEach((c, i) => {
        const t = seqs[i].map((m) => m.type);
        if (JSON.stringify(t) !== JSON.stringify(ref)) { ok = false; diffs.push(`${c.name}: [${t.join(',')}] vs ПК [${ref.join(',')}]`); return; }
        seqs[i].forEach((m, k) => {
            const a = JSON.stringify(norm(m)), b = JSON.stringify(norm(seqs[0][k]));
            if (a !== b) { ok = false; diffs.push(`${c.name} ${m.type}#${k}: ${a} != ПК ${b}`); }
        });
    });
    check(`[sync] ${label}: ${ref.length} событий одинаковы у ПК, ведущего и 5 игроков`, ok, diffs.slice(0, 4));
    // счета
    const sc = all.map((c) => JSON.stringify(Object.entries(c.scores).sort()));
    check(`[sync] ${label}: счета совпадают у всех`, sc.every((s) => s === sc[0]), sc.map((s, i) => `${all[i].name} ${s}`).slice(0, 3));
    all.forEach((c) => { c.mark = c.log.length; });
}
const scoreOf = (n) => host.scores[byName[n].id];
const scoreLine = () => names.map((n) => `${n}=${scoreOf(n)}`).join(' ');

(async () => {
    const t0 = Date.now();
    // ---------- лобби ----------
    await pc.connect();
    pc.send('HOST_CREATE_ROOM', { options: { readingTime: 1, thinkingTime: 20, answerTime: 5, penaltyEnabled: true, isHostOnPC: false, requireMobileHost: true } });
    const created = await pc.waitFor('ROOM_CREATED');
    const room = created.payload.roomCode;
    check('ПК создал комнату', !!room, created.payload);
    pc.send('HOST_SET_PACK', { pack: PACK });
    await host.connect();
    host.send('PLAYER_JOIN', { roomCode: room, name: 'Ведущий', avatar: '🎙️', role: 'host' });
    await host.waitFor('ROOM_STATE');
    for (const p of pl) { await p.connect(); p.send('PLAYER_JOIN', { roomCode: room, name: p.name, avatar: '🙂' }); await p.waitFor('ROOM_STATE'); }
    await sleep(300);
    check('5 игроков + ведущий в комнате', pc.lastState.players.length === 5 && pc.lastState.hasHost, pc.lastState.players.length);
    check('ведущий-телефон виден ПК как host', pc.lastState.host && pc.lastState.host.role === 'host' && pc.lastState.host.name === 'Ведущий', pc.lastState.host);
    all.forEach((c) => { c.mark = c.log.length; });

    host.send('HOST_START_GAME');
    await host.waitFor('ROOM_STATE', (p) => p.state === 'BOARD');
    await sync('старт игры → BOARD');
    check('у ведущего-телефона есть сетка board', host.lastState.board && host.lastState.board.themes.length === 1, host.lastState.board && host.lastState.board.themes.length);
    check('у игроков нет board (античит)', pl.every((p) => !p.lastState.board));

    // стартовые очки вручную (как кнопки +N у ведущего)
    const start = { 'Алиса': 1000, 'Боб': 600, 'Вика': 300, 'Гоша': 800, 'Дима': 0 };
    for (const n of names) if (start[n]) host.send('HOST_UPDATE_SCORE', { playerId: byName[n].id, delta: start[n] });
    await sleep(300);
    check('ручные очки ведущего дошли до всех', names.every((n) => all.every((c) => c.scores[byName[n].id] === start[n])), scoreLine());
    all.forEach((c) => { c.mark = c.log.length; });

    // ---------- Q0: обычный вопрос (база: гонка баззера, пас, штраф) ----------
    console.log('\n=== Q0 обычный вопрос ===');
    host.send('HOST_SELECT_QUESTION', { themeIdx: 0, questionIdx: 0 });
    await pc.waitFor('BUZZER_READY');
    const qa = pl[0].since().find((m) => m.type === 'QUESTION_ACTIVE').payload;
    check('игрок получил вопрос без ответа', qa.question.q === 'Обычный вопрос 100' && qa.question.a === undefined, qa.question);
    const qaHost = host.since().find((m) => m.type === 'QUESTION_ACTIVE').payload;
    check('ведущий и ПК получили ответ', qaHost.question.a === SECRET(0) && pc.since().find((m) => m.type === 'QUESTION_ACTIVE').payload.question.a === SECRET(0));
    byName['Алиса'].send('PLAYER_BUZZ'); byName['Боб'].send('PLAYER_BUZZ');
    await pc.waitFor('BUZZ_LOCKED');
    await sleep(150);
    const locks = pc.since().filter((m) => m.type === 'BUZZ_LOCKED');
    check('одновременное нажатие: ровно один победитель', locks.length === 1, locks.length);
    const winner = locks[0].payload.playerName;
    const loser = winner === 'Алиса' ? 'Боб' : 'Алиса';
    const errLoser = byName[loser].lastErr();
    check('проигравший гонки получил отказ', !!errLoser, 'нет ERROR');
    byName[winner].send('PLAYER_SUBMIT_ANSWER', { answerText: 'мой ответ' });
    await host.waitFor('ANSWER_SUBMITTED');
    check('текст ответа получил ведущий', host.has('ANSWER_SUBMITTED', (p) => p.answerText === 'мой ответ'));
    const before = scoreOf(winner);
    host.send('HOST_JUDGE_ANSWER', { isCorrect: false, withPenalty: true });
    await host.waitFor('JUDGE_RESULT');
    await sleep(150);
    check('штраф -100 применён и синхронен', all.every((c) => c.scores[byName[winner].id] === before - 100), scoreLine());
    check('баззер переоткрыт без отвечавшего', pc.has('BUZZER_READY', (p) => !p.allowedPlayerIds.includes(byName[winner].id) && p.allowedPlayerIds.length === 4));
    byName['Дима'].send('PLAYER_PASS');
    await sleep(150);
    check('Дима спасовал: все видят PLAYER_PASSED', all.every((c) => c.has('PLAYER_PASSED', (p) => p.playerId === byName['Дима'].id)));
    byName['Дима'].send('PLAYER_BUZZ');
    await sleep(100);
    check('спасовавший не может нажать баззер', !!byName['Дима'].lastErr());
    byName['Вика'].send('PLAYER_BUZZ');
    await pc.waitFor('BUZZ_LOCKED', (p) => p.playerName === 'Вика');
    const vBefore = scoreOf('Вика');
    host.send('HOST_JUDGE_ANSWER', { isCorrect: true });
    await host.waitFor('JUDGE_RESULT', (p) => p.isCorrect);
    await sleep(150);
    check('верный ответ +100 у Вики у всех', all.every((c) => c.scores[byName['Вика'].id] === vBefore + 100), scoreLine());
    host.send('HOST_SHOW_ANSWER'); await pc.waitFor('SHOW_ANSWER');
    host.send('HOST_CLOSE_QUESTION'); await pc.waitFor('QUESTION_CLOSED');
    await sync('Q0 целиком');

    // ---------- Q1: Кот в мешке (верно) ----------
    console.log('\n=== Q1 Кот в мешке ===');
    host.send('HOST_SELECT_QUESTION', { themeIdx: 0, questionIdx: 1 });
    await Promise.all(all.map((c) => c.waitFor('QUESTION_ACTIVE')));
    check('кот: у всех QUESTION_ACTIVE state=CAT_CHOOSING, questionType=cat', all.every((c) => { const q = c.since().find((m) => m.type === 'QUESTION_ACTIVE').payload; return q.state === 'CAT_CHOOSING' && q.questionType === 'cat'; }));
    await sleep(1500);
    check('кот: баззер НЕ открылся без решения ведущего', !all.some((c) => c.has('BUZZER_READY')));
    byName['Гоша'].send('PLAYER_BUZZ'); await sleep(100);
    check('кот: нажатие до назначения отклонено', !!byName['Гоша'].lastErr());
    byName['Гоша'].send('HOST_SET_CAT_TARGET', { targetPlayerId: byName['Гоша'].id }); await sleep(150);
    check('кот: игрок не может назначить кота командой ведущего', !all.some((c) => c.has('CAT_TRANSFERRED')));
    host.send('HOST_SET_CAT_TARGET', { targetPlayerId: byName['Боб'].id });
    await pc.waitFor('BUZZER_READY');
    check('кот: CAT_TRANSFERRED у всех → Боб', all.every((c) => c.has('CAT_TRANSFERRED', (p) => p.toPlayerName === 'Боб')));
    check('кот: баззер только у Боба', all.every((c) => c.has('BUZZER_READY', (p) => p.allowedPlayerIds.length === 1 && p.allowedPlayerIds[0] === byName['Боб'].id)));
    byName['Алиса'].send('PLAYER_BUZZ'); await sleep(100);
    check('кот: чужой баззер отклонён', !!byName['Алиса'].lastErr());
    byName['Боб'].send('PLAYER_PASS'); await sleep(100);
    check('кот: назначенный не может спасовать', !!byName['Боб'].lastErr() && !pc.has('PLAYER_PASSED'));
    byName['Боб'].send('PLAYER_BUZZ');
    await pc.waitFor('BUZZ_LOCKED');
    const bBefore = scoreOf('Боб');
    byName['Боб'].send('PLAYER_SUBMIT_ANSWER', { answerText: 'ответ кота' });
    host.send('HOST_JUDGE_ANSWER', { isCorrect: true });
    await host.waitFor('JUDGE_RESULT');
    await sleep(150);
    check('кот: +200 Бобу у всех', all.every((c) => c.scores[byName['Боб'].id] === bBefore + 200), scoreLine());
    host.send('HOST_SHOW_ANSWER'); host.send('HOST_CLOSE_QUESTION'); await pc.waitFor('QUESTION_CLOSED');
    await sync('Q1 кот');

    // ---------- Q2: Кот в мешке (неверно + попытка перехвата игроком) ----------
    console.log('\n=== Q2 Кот в мешке, перехват ===');
    host.send('HOST_SELECT_QUESTION', { themeIdx: 0, questionIdx: 2 });
    await Promise.all(all.map((c) => c.waitFor('QUESTION_ACTIVE')));
    byName['Дима'].send('PLAYER_CAT_TRANSFER', { targetPlayerId: byName['Дима'].id });
    await sleep(400);
    const hijacked = pc.has('CAT_TRANSFERRED');
    check('кот: игрок не может сам назначить кота через PLAYER_CAT_TRANSFER (ведущий ещё не решил)', !hijacked,
        'ПЕРЕХВАТ: игрок Дима отправил PLAYER_CAT_TRANSFER в CAT_CHOOSING — сервер принял, вопрос ушёл Диме без ведущего');
    if (pc.lastState && pc.has('BUZZER_READY') === false) { /* ничего */ }
    if (!hijacked) host.send('HOST_SET_CAT_TARGET', { targetPlayerId: byName['Вика'].id });
    const ready = await pc.waitFor('BUZZER_READY');
    const target = ready.payload.allowedPlayerIds.map((id) => pl.find((p) => p.id === id).name)[0];
    byName[target].send('PLAYER_BUZZ'); await pc.waitFor('BUZZ_LOCKED');
    const tBefore = scoreOf(target);
    host.send('HOST_JUDGE_ANSWER', { isCorrect: false, withPenalty: true });
    await host.waitFor('JUDGE_RESULT'); await sleep(200);
    check('кот: неверно → -300, вопрос не переоткрыт другим', all.every((c) => c.scores[byName[target].id] === tBefore - 300) && !pc.has('JUDGE_RESULT', (p) => p.reopened), scoreLine());
    host.send('HOST_SHOW_ANSWER'); host.send('HOST_CLOSE_QUESTION'); await pc.waitFor('QUESTION_CLOSED');
    await sleep(200);
    check('раунд 1 исчерпан → ROUND_END у всех', all.every((c) => c.lastState.state === 'ROUND_END'), all.map((c) => c.lastState.state));
    await sync('Q2 кот/перехват');
    host.send('HOST_NEXT_ROUND'); await pc.waitFor('ROUND_CHANGED');
    await sync('следующий раунд');
    check('раунд 2: board показывает новую тему', host.lastState.board && host.lastState.board.themes[0].name === 'Торги', host.lastState.board && host.lastState.board.themes[0].name);

    // ---------- Q3: Аукцион для всех ----------
    console.log('\n=== Q3 Аукцион для всех ===');
    const scBefore = Object.fromEntries(names.map((n) => [n, scoreOf(n)]));
    console.log('  счета перед аукционом:', scoreLine());
    host.send('HOST_SELECT_QUESTION', { themeIdx: 0, questionIdx: 0 });
    await Promise.all(all.map((c) => c.waitFor('QUESTION_ACTIVE')));
    check('аукцион: state=AUCTION_BETTING, questionType=auction у всех', all.every((c) => { const q = c.since().find((m) => m.type === 'QUESTION_ACTIVE').payload; return q.state === 'AUCTION_BETTING' && q.questionType === 'auction'; }));
    const wantBets = { 'Алиса': 5000, 'Боб': 450, 'Вика': 0, 'Гоша': 400 }; // Дима не ставит
    for (const [n, v] of Object.entries(wantBets)) byName[n].send('PLAYER_AUCTION_BET', { amount: v });
    await sleep(500);
    const made = {}; host.since().filter((m) => m.type === 'AUCTION_BET_MADE').forEach((m) => { made[m.payload.playerName] = m.payload.amount; });
    const expAlisa = Math.max(400, scBefore['Алиса']);
    check('аукцион: ставка выше счёта обрезана до счёта', made['Алиса'] === expAlisa, made);
    check('аукцион: ставки Боб/Вика/Гоша приняты верно', made['Боб'] === 450 && made['Вика'] === 0 && made['Гоша'] === 400, made);
    check('аукцион: ПК и ведущий видят все ставки', pc.since().filter((m) => m.type === 'AUCTION_BET_MADE').length === 4 && host.since().filter((m) => m.type === 'AUCTION_BET_MADE').length === 4);
    const leakBets = pl.filter((p) => p.has('AUCTION_BET_MADE')).length;
    console.log(`  (инфо) ставки чужих игроков видят ${leakBets}/5 игроков на проводе`);
    // реконнект Гоши в разгар торгов
    const gToken = byName['Гоша'].token;
    byName['Гоша'].ws.terminate(); await sleep(300);
    check('аукцион: отключение игрока ставит игру на паузу у всех', host.has('GAME_PAUSED', (p) => p.isPaused && p.reason === 'disconnect') && pc.has('GAME_PAUSED', (p) => p.isPaused));
    const g2 = new Client('Гоша', 'player'); await g2.connect(); g2.id = byName['Гоша'].id; g2.scores = { ...byName['Гоша'].scores };
    g2.send('PLAYER_JOIN', { roomCode: room, name: 'Гоша', avatar: '🙂', sessionToken: gToken });
    const rs = await g2.waitFor('ROOM_STATE', (p) => p.self);
    check('аукцион: реконнект Гоши → тот же id и снимок state=AUCTION_BETTING с его ставкой', rs.payload.self.id === byName['Гоша'].id && rs.payload.state === 'AUCTION_BETTING' && rs.payload.auctionBets[byName['Гоша'].id] === 400, { id: rs.payload.self.id, state: rs.payload.state, bets: rs.payload.auctionBets });
    await sleep(200);
    check('аукцион: пауза снята после возвращения', pc.has('GAME_PAUSED', (p) => p.isPaused === false) && host.has('GAME_PAUSED', (p) => p.isPaused === false));
    pl[3] = g2; byName['Гоша'] = g2; all[5] = g2; g2.mark = 0; g2.log = g2.log; // подменяем клиента
    all.forEach((c) => { c.mark = c.log.length; });

    const bidders = pl.filter((p) => (made[p.name] || 0) > 0).map((p) => p.id);
    host.send('HOST_START_AUCTION_ANSWER', { biddingPlayerIds: bidders });
    await Promise.all(all.map((c) => c.waitFor('AUCTION_ANSWER_START')));
    const st = pc.since().find((m) => m.type === 'AUCTION_ANSWER_START').payload;
    check('аукцион: старт ответов у всех, 3 ответчика, 30 с', st.biddingPlayerIds.length === 3 && st.answerTime === 30, st);
    check('аукцион: баззер не открывался', !all.some((c) => c.has('BUZZER_READY')));
    byName['Алиса'].send('PLAYER_SUBMIT_ANSWER', { answerText: 'ответ Алисы' });
    byName['Боб'].send('PLAYER_SUBMIT_ANSWER', { answerText: 'ответ Боба' });
    byName['Дима'].send('PLAYER_SUBMIT_ANSWER', { answerText: 'я не ставил' });
    byName['Вика'].send('PLAYER_SUBMIT_ANSWER', { answerText: 'я спасовала' });
    await sleep(500);
    check('аукцион: ответы ставивших дошли до ведущего с их ставками', host.since().filter((m) => m.type === 'ANSWER_SUBMITTED').length === 2 && host.has('ANSWER_SUBMITTED', (p) => p.playerName === 'Боб' && p.bet === 450), host.since().filter((m) => m.type === 'ANSWER_SUBMITTED').map((m) => m.payload));
    check('аукцион: Дима и Вика (не ставили) получили отказ', !!byName['Дима'].lastErr() && !!byName['Вика'].lastErr());
    const leakAns = pl.filter((p) => p.has('ANSWER_SUBMITTED', (x) => x.answerText && x.playerId !== p.id)).length;
    check('аукцион: чужие ТЕКСТЫ ответов не рассылаются остальным игрокам (до оценки)', leakAns === 0, `${leakAns}/5 игроков получили чужой текст ответа (ANSWER_SUBMITTED идёт broadcastToAll)`);
    // реконнект ответчика во время ввода
    const aToken = byName['Алиса'].token; byName['Алиса'].ws.terminate(); await sleep(300);
    const a2 = new Client('Алиса', 'player'); await a2.connect(); a2.id = byName['Алиса'].id; a2.scores = { ...byName['Алиса'].scores };
    a2.send('PLAYER_JOIN', { roomCode: room, name: 'Алиса', avatar: '🙂', sessionToken: aToken });
    const rs2 = await a2.waitFor('ROOM_STATE', (p) => p.self);
    console.log('  снимок Алисы после реконнекта в AUCTION_ANSWERING: state=%s keys: bidders=%s bets=%s', rs2.payload.state, JSON.stringify(rs2.payload.biddingPlayerIds), JSON.stringify(rs2.payload.auctionBets));
    check('аукцион: после реконнекта снимок содержит state=AUCTION_ANSWERING', rs2.payload.state === 'AUCTION_ANSWERING', rs2.payload.state);
    check('аукцион: снимок содержит список ответчиков/срок/признак «уже ответил» (иначе экран ввода не восстановить)', Array.isArray(rs2.payload.biddingPlayerIds), 'в getStateSnapshot нет biddingPlayerIds / remaining time / answeredIds');
    pl[0] = a2; byName['Алиса'] = a2; all[2] = a2; all.forEach((c) => { c.mark = c.log.length; });
    console.log('  ждём окончание окна ввода 30 с …');
    await Promise.all(all.map((c) => c.waitFor('ANSWER_TIMEOUT', (p) => p.isAuction, 33000)));
    check('аукцион: по таймеру ANSWER_TIMEOUT(isAuction) у всех', all.every((c) => c.has('ANSWER_TIMEOUT', (p) => p.isAuction)));
    byName['Гоша'].send('PLAYER_SUBMIT_ANSWER', { answerText: 'поздно' }); await sleep(200);
    check('аукцион: ответ после таймера отклонён', !!byName['Гоша'].lastErr() && host.since().filter((m) => m.type === 'ANSWER_SUBMITTED' && m.payload.answerText === 'поздно').length === 0);
    // оценка: как кнопки +/- в host-auction-card
    host.send('HOST_UPDATE_SCORE', { playerId: byName['Алиса'].id, delta: made['Алиса'] });
    host.send('HOST_UPDATE_SCORE', { playerId: byName['Боб'].id, delta: -450 });
    host.send('HOST_UPDATE_SCORE', { playerId: byName['Гоша'].id, delta: -400 });
    await sleep(400);
    const exp = { ...scBefore, 'Алиса': scBefore['Алиса'] + made['Алиса'], 'Боб': scBefore['Боб'] - 450, 'Гоша': scBefore['Гоша'] - 400 };
    check('аукцион: очки по ставкам применены и одинаковы у всех', names.every((n) => all.every((c) => c.scores[byName[n].id] === exp[n])), { exp, got: scoreLine() });
    host.send('HOST_SHOW_ANSWER'); await pc.waitFor('SHOW_ANSWER');
    host.send('HOST_CLOSE_QUESTION'); await pc.waitFor('QUESTION_CLOSED');
    await sleep(200);
    check('аукцион: после «К табло» у всех BOARD', all.every((c) => c.lastState.state === 'BOARD'), all.map((c) => c.lastState.state));
    await sync('Q3 аукцион для всех');

    // ---------- Q4: Аукцион на лидера (верно) ----------
    console.log('\n=== Q4 Аукцион на лидера ===');
    console.log('  счета:', scoreLine());
    const s4 = Object.fromEntries(names.map((n) => [n, scoreOf(n)]));
    host.send('HOST_SELECT_QUESTION', { themeIdx: 0, questionIdx: 1 });
    await Promise.all(all.map((c) => c.waitFor('QUESTION_ACTIVE')));
    check('лидер: state=AUCTION_BETTING, questionType=auction_leader', all.every((c) => { const q = c.since().find((m) => m.type === 'QUESTION_ACTIVE').payload; return q.state === 'AUCTION_BETTING' && q.questionType === 'auction_leader'; }));
    const bets4 = { 'Алиса': 800, 'Боб': 520, 'Вика': 0, 'Гоша': 650, 'Дима': 300 };
    for (const [n, v] of Object.entries(bets4)) byName[n].send('PLAYER_AUCTION_BET', { amount: v });
    await sleep(500);
    const m4 = {}; host.since().filter((m) => m.type === 'AUCTION_BET_MADE').forEach((m) => { m4[m.payload.playerName] = m.payload.amount; });
    console.log('  принятые ставки:', JSON.stringify(m4));
    const maxName = Object.entries(m4).sort((a, b) => b[1] - a[1])[0][0];
    check('лидер: ставки зажаты в [номинал..счёт] (Дима 300 → 500, Вика пас)', m4['Дима'] === 500 && m4['Вика'] === 0, m4);
    byName[maxName].send('PLAYER_BUZZ'); await sleep(100);
    check('лидер: до решения ведущего баззер недоступен', !!byName[maxName].lastErr());
    const betLeader = m4[maxName];
    host.send('HOST_SET_AUCTION_LEADER', { leaderPlayerId: byName[maxName].id, maxBet: betLeader });
    const rd = await pc.waitFor('BUZZER_READY');
    check(`лидер: AUCTION_LEADER_SET (${maxName}, ${betLeader}) у всех`, all.every((c) => c.has('AUCTION_LEADER_SET', (p) => p.leaderPlayerId === byName[maxName].id && p.bet === betLeader)));
    check('лидер: баззер только у лидера, цена = ставка', rd.payload.allowedPlayerIds.length === 1 && rd.payload.allowedPlayerIds[0] === byName[maxName].id && rd.payload.cost === betLeader, rd.payload);
    const other = names.find((n) => n !== maxName);
    byName[other].send('PLAYER_BUZZ'); await sleep(100);
    check('лидер: другой игрок не может нажать', !!byName[other].lastErr());
    byName[maxName].send('PLAYER_PASS'); await sleep(100);
    check('лидер: лидер не может спасовать', !!byName[maxName].lastErr());
    byName[maxName].send('PLAYER_BUZZ'); await pc.waitFor('BUZZ_LOCKED');
    byName[maxName].send('PLAYER_SUBMIT_ANSWER', { answerText: 'ответ лидера' });
    await host.waitFor('ANSWER_SUBMITTED');
    host.send('HOST_JUDGE_ANSWER', { isCorrect: true });
    await host.waitFor('JUDGE_RESULT'); await sleep(200);
    const jr = pc.since().find((m) => m.type === 'JUDGE_RESULT').payload;
    check(`лидер: верно → +${betLeader} (ставка, не номинал 500)`, jr.cost === betLeader && all.every((c) => c.scores[byName[maxName].id] === s4[maxName] + betLeader), { jr, line: scoreLine() });
    host.send('HOST_SHOW_ANSWER'); host.send('HOST_CLOSE_QUESTION'); await pc.waitFor('QUESTION_CLOSED');
    await sync('Q4 аукцион на лидера (верно)');

    // ---------- Q5: Аукцион на лидера (неверно) ----------
    console.log('\n=== Q5 Аукцион на лидера, неверно ===');
    const s5 = Object.fromEntries(names.map((n) => [n, scoreOf(n)]));
    host.send('HOST_SELECT_QUESTION', { themeIdx: 0, questionIdx: 2 });
    await Promise.all(all.map((c) => c.waitFor('QUESTION_ACTIVE')));
    byName['Боб'].send('PLAYER_AUCTION_BET', { amount: 99999 });
    byName['Дима'].send('PLAYER_AUCTION_BET', { amount: 0 });
    await sleep(300);
    const bobBet = host.since().filter((m) => m.type === 'AUCTION_BET_MADE' && m.payload.playerName === 'Боб').pop().payload.amount;
    check('лидер#2: ставка Боба = max(номинал, его счёт)', bobBet === Math.max(600, s5['Боб']), { bobBet, score: s5['Боб'] });
    host.send('HOST_SET_AUCTION_LEADER', { leaderPlayerId: byName['Боб'].id, maxBet: bobBet });
    await pc.waitFor('BUZZER_READY');
    byName['Боб'].send('PLAYER_BUZZ'); await pc.waitFor('BUZZ_LOCKED');
    host.send('HOST_JUDGE_ANSWER', { isCorrect: false, withPenalty: true });
    await host.waitFor('JUDGE_RESULT'); await sleep(200);
    check(`лидер#2: неверно → -${bobBet} и вопрос закрыт без переоткрытия`, all.every((c) => c.scores[byName['Боб'].id] === s5['Боб'] - bobBet) && !pc.has('JUDGE_RESULT', (p) => p.reopened), scoreLine());
    host.send('HOST_CLOSE_QUESTION'); await pc.waitFor('QUESTION_CLOSED');
    await sync('Q5 аукцион на лидера (неверно)');

    // ---------- Q6: все пасуют → GAME_OVER ----------
    console.log('\n=== Q6 все пасуют ===');
    host.send('HOST_SELECT_QUESTION', { themeIdx: 0, questionIdx: 3 });
    await pc.waitFor('BUZZER_READY');
    pl.forEach((p) => p.send('PLAYER_PASS'));
    await pc.waitFor('SHOW_ANSWER');
    check('пас всех: ответ показан на ПК/ведущему', pc.has('SHOW_ANSWER', (p) => p.answer === SECRET(6)) && host.has('SHOW_ANSWER', (p) => p.answer === SECRET(6)));
    host.send('HOST_CLOSE_QUESTION'); await pc.waitFor('QUESTION_CLOSED'); await sleep(200);
    check('все вопросы использованы → GAME_OVER у всех', all.every((c) => c.lastState.state === 'GAME_OVER'), all.map((c) => c.lastState.state));
    await sync('Q6 пас всех / GAME_OVER');

    // ---------- античит: ни один игрок не видел секретных ответов до показа ----------
    const leaks = [];
    pl.forEach((p) => p.log.forEach((m) => { if (m.type !== 'SHOW_ANSWER' && JSON.stringify(m).includes('СЕКРЕТНЫЙ-ОТВЕТ')) leaks.push(`${p.name}:${m.type}`); }));
    check('античит: секретные ответы не уходили игрокам нигде кроме SHOW_ANSWER', leaks.length === 0, leaks.slice(0, 5));
    console.log('\nИтоговые очки:', scoreLine());
    console.log(`Время: ${((Date.now() - t0) / 1000).toFixed(1)} c`);
    const fails = results.filter((r) => !r.ok);
    console.log(`\n=== ИТОГ: ${results.length - fails.length}/${results.length} PASS, ${fails.length} FAIL ===`);
    fails.forEach((f) => console.log(' FAIL:', f.name));
    all.forEach((c) => { try { c.ws.close(); } catch (_) {} });
    setTimeout(() => process.exit(fails.length ? 1 : 0), 200);
})().catch((e) => { console.error('СЦЕНАРИЙ УПАЛ:', e); process.exit(2); });
