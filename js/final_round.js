/**
 * Quiz U — экран финального раунда на ПК / большом экране (локальная игра и LAN).
 *
 * Финал — один вопрос (если в финальном раунде несколько тем, ведущий выбирает одну, остальные
 * отбрасываются). Этапы экрана (`#final-screen[data-stage]`):
 *   intro → bets → question → judging → results
 * Локально ПК сам ведёт финал и меняет счёт через changeTeamScore. В LAN всё решает сервер
 * (ставки, приём ответов, вердикты, конец игры), а экран только отображает его события; кнопки
 * управления видны, только если ведущий — этот ПК (isLocalHostEnabled).
 *
 * Использует глобальные переменные и функции game.js: teams, gameData, currentRoundIndex,
 * isOnlineGame, hostNetworkClient, isLocalHostEnabled, isTestMode, changeTeamScore, saveGameState,
 * hideGameLayout, showWinnerCelebration, showSubScreen, resolveMediaPath и звуки.
 */
(function () {
    'use strict';

    const LOCAL_ANSWER_SECONDS = 60;

    const st = {
        active: false,
        roundIdx: null,
        stage: 'intro',
        themeIdx: null,
        themeName: '',
        question: null,
        limits: {},       // key -> { min, max }
        bets: {},         // key -> number (LAN: known to the host only)
        placed: {},       // key -> true
        answers: {},      // key -> text (LAN host only)
        answered: {},     // key -> true
        verdicts: {},     // key -> true | false
        answerShown: false,
        timer: null,
        timeLeft: 0,
        timeTotal: 0,
        paused: false,
        hidTeamsPanel: false
    };

    function $(id) {
        return document.getElementById(id);
    }

    function esc(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function math(str) {
        const fn = (typeof window !== 'undefined' && typeof window.renderMathInString === 'function') ? window.renderMathInString : null;
        return fn ? fn(esc(str)) : esc(str);
    }

    function isLan() {
        return typeof isOnlineGame !== 'undefined' && isOnlineGame
            && typeof hostNetworkClient !== 'undefined' && hostNetworkClient && hostNetworkClient.isConnected;
    }

    // The PC operator may act: always offline, in LAN only when the PC is the host
    function pcControls() {
        return !isLan() || (typeof isLocalHostEnabled !== 'undefined' && Boolean(isLocalHostEnabled));
    }

    function teamList() {
        return (typeof teams !== 'undefined' && Array.isArray(teams)) ? teams : [];
    }

    function keyOf(team, idx) {
        return isLan() && team && team.id ? String(team.id) : String(idx);
    }

    function teamIdxByKey(key) {
        return teamList().findIndex((t, i) => keyOf(t, i) === String(key));
    }

    function sound(name) {
        try {
            const fn = window[name];
            if (typeof fn === 'function') fn();
        } catch (e) {
        }
    }

    function media(url) {
        if (!url) return '';
        try {
            return (typeof resolveMediaPath === 'function') ? resolveMediaPath(String(url).trim()) : String(url).trim();
        } catch (e) {
            return String(url).trim();
        }
    }

    function currentRound() {
        return (typeof gameData !== 'undefined' && Array.isArray(gameData)) ? gameData[currentRoundIndex] : null;
    }

    /** Same rule as the server (Room.computeFinalBetLimits) */
    function computeLocalLimits(cost) {
        const list = teamList();
        const limits = {};
        const positive = list.filter(t => (Number(t.score) || 0) > 0);
        if (positive.length > 0) {
            list.forEach((t, i) => {
                if ((Number(t.score) || 0) > 0) limits[keyOf(t, i)] = {min: 1, max: Number(t.score)};
            });
        } else {
            const nominal = Math.max(1, Number(cost) || 100);
            list.forEach((t, i) => {
                limits[keyOf(t, i)] = {min: nominal, max: nominal};
            });
        }
        return limits;
    }

    function finalists() {
        return Object.keys(st.limits).filter(k => teamIdxByKey(k) !== -1);
    }

    function bidders() {
        return finalists().filter(k => st.placed[k]);
    }

    function stopTimer() {
        if (st.timer) {
            clearInterval(st.timer);
            st.timer = null;
        }
    }

    function startTimer(seconds, onEnd) {
        stopTimer();
        st.timeTotal = Math.max(1, Number(seconds) || LOCAL_ANSWER_SECONDS);
        st.timeLeft = st.timeTotal;
        st.paused = false;
        renderTimer();
        st.timer = setInterval(() => {
            if (st.paused) return;
            st.timeLeft = Math.max(0, st.timeLeft - 1);
            if (st.timeLeft > 0 && st.timeLeft <= 5) sound('playTickSound');
            renderTimer();
            if (st.timeLeft <= 0) {
                stopTimer();
                sound('playTimeUpSound');
                if (typeof onEnd === 'function') onEnd();
            }
        }, 1000);
    }

    function renderTimer() {
        const wrap = $('final-timer');
        const num = $('final-timer-num');
        const ring = $('final-timer-ring');
        if (num) num.textContent = String(st.timeLeft);
        if (wrap) {
            wrap.classList.toggle('is-low', st.timeLeft <= 10);
            wrap.classList.toggle('is-paused', st.paused);
        }
        if (ring) {
            const circumference = 2 * Math.PI * 45;
            const progress = st.timeTotal > 0 ? st.timeLeft / st.timeTotal : 0;
            ring.style.strokeDasharray = String(circumference);
            ring.style.strokeDashoffset = String(circumference * (1 - progress));
        }
    }

    // ------------------------------------------------------------------ layout

    function setLayoutVisible(visible) {
        const screen = $('final-screen');
        if (screen) screen.hidden = !visible;
        const board = $('game-board');
        if (board && visible) board.style.display = 'none';
        const teamsWrapper = $('teams-block-wrapper');
        if (teamsWrapper) {
            if (visible && teamsWrapper.style.display !== 'none') {
                teamsWrapper.style.display = 'none';
                st.hidTeamsPanel = true;
            } else if (!visible && st.hidTeamsPanel) {
                teamsWrapper.style.display = 'block';
                st.hidTeamsPanel = false;
            }
        }
        // The turn makes no sense in the final
        ['current-turn-display', 'btn-switch-turn'].forEach(id => {
            const el = $(id);
            if (el) el.style.visibility = visible ? 'hidden' : '';
        });
    }

    function reset(roundIdx) {
        stopTimer();
        st.active = true;
        st.roundIdx = roundIdx;
        st.stage = 'intro';
        st.themeIdx = null;
        st.themeName = '';
        st.question = null;
        st.limits = {};
        st.bets = {};
        st.placed = {};
        st.answers = {};
        st.answered = {};
        st.verdicts = {};
        st.answerShown = false;
    }

    function setStage(stage) {
        st.stage = stage;
        render();
    }

    // ------------------------------------------------------------------ rendering

    function render() {
        const screen = $('final-screen');
        if (!screen) return;
        screen.dataset.stage = st.stage;
        screen.classList.toggle('is-lan', isLan());
        screen.classList.toggle('is-host', pcControls());

        const round = currentRound();
        const roundName = $('final-round-name');
        if (roundName) roundName.textContent = (round && round.roundName) || 'Финальный раунд';

        renderThemes(round);
        renderThemeBanner();
        renderQuestion();
        renderAnswer();
        renderPlayers();
        renderStatus();
        renderActions();
        if (window.gamepadManager) {
            setTimeout(() => window.gamepadManager.ensureInitialFocus(), 60);
        }
    }

    function renderThemes(round) {
        const box = $('final-themes');
        if (!box) return;
        box.innerHTML = '';
        if (st.stage !== 'intro' || !round) return;
        const themes = round.themes || [];
        themes.forEach((theme, idx) => {
            const card = document.createElement(pcControls() ? 'button' : 'div');
            card.className = 'final-theme-card';
            if (pcControls()) {
                card.type = 'button';
                card.onclick = () => start(idx);
            }
            const q = theme.questions && theme.questions[0];
            card.innerHTML = `<span class="final-theme-card-label">Тема ${themes.length > 1 ? idx + 1 : ''}</span>
                <span class="final-theme-card-name">${esc(theme.name || 'Финальная тема')}</span>
                ${q && q.cost ? `<span class="final-theme-card-cost">номинал ${esc(q.cost)}</span>` : ''}`;
            box.appendChild(card);
        });
    }

    function renderThemeBanner() {
        const name = $('final-theme-name');
        if (name) name.textContent = st.themeName || '';
    }

    function renderQuestion() {
        const box = $('final-question');
        if (!box) return;
        const showText = ['question', 'judging', 'results'].includes(st.stage) && st.question;
        if (!showText) {
            box.innerHTML = '';
            return;
        }
        const q = st.question;
        let html = q.q ? `<div class="final-question-text">${math(q.q)}</div>` : '';
        if (q.img) html += `<img class="final-question-img" alt="Иллюстрация" src="${esc(media(q.img))}" onerror="this.style.display='none'">`;
        if (q.music) html += `<audio class="final-question-audio" controls src="${esc(media(q.music))}"></audio>`;
        if (q.video) html += `<video class="final-question-video" controls src="${esc(media(q.video))}"></video>`;
        // Re-rendering must not restart a playing audio / video
        if (box.dataset.key !== String(q.q) + st.stage) {
            box.innerHTML = html;
            box.dataset.key = String(q.q) + st.stage;
        }
    }

    function renderAnswer() {
        const box = $('final-answer');
        const text = $('final-answer-text');
        const img = $('final-answer-img');
        // The host on this PC needs the answer to judge; the public screen gets it at the end
        const visible = Boolean(st.question) && (st.answerShown || (st.stage === 'judging' && pcControls()) || st.stage === 'results');
        if (box) box.hidden = !visible;
        if (!visible) return;
        if (text) text.innerHTML = math(st.question.a || '—');
        if (img) {
            const src = st.question.a_img || st.question.answer_img;
            img.hidden = !src;
            if (src) img.src = media(src);
        }
    }

    function playerRowHtml(team, idx, key) {
        const isFinalist = Boolean(st.limits[key]);
        const lim = st.limits[key];
        const verdict = st.verdicts[key];
        const avatar = team.avatar ? `<span class="final-player-avatar">${esc(team.avatar)}</span>` : `<span class="final-player-avatar">${idx + 1}</span>`;
        let middle = '';
        let right = '';

        if (!isFinalist) {
            middle = '<span class="final-player-note">не участвует — нет очков</span>';
        } else if (st.stage === 'intro') {
            middle = `<span class="final-player-note">ставка ${lim.min === lim.max ? lim.min : `1 – ${esc(lim.max)}`}</span>`;
        } else if (st.stage === 'bets') {
            if (!isLan()) {
                const val = st.bets[key] !== undefined ? st.bets[key] : '';
                middle = `<div class="final-bet-controls">
                    <input class="final-bet-input" type="number" inputmode="numeric" min="${lim.min}" max="${lim.max}" value="${esc(val)}"
                           placeholder="${lim.min === lim.max ? lim.min : `1 – ${lim.max}`}" data-key="${esc(key)}" aria-label="Ставка ${esc(team.name)}">
                    ${lim.min === lim.max ? '' : `<button class="final-bet-quick" type="button" data-key="${esc(key)}" data-val="${lim.max}">Ва-банк</button>`}
                </div>`;
            } else {
                middle = `<span class="final-player-state">${st.placed[key] ? '✅ ставка сделана' : '🤔 думает…'}</span>`;
            }
        } else if (st.stage === 'question') {
            if (isLan()) {
                if (!st.placed[key]) middle = '<span class="final-player-note">без ставки</span>';
                else middle = `<span class="final-player-state">${st.answered[key] ? '✅ ответ получен' : '✍️ пишет ответ…'}</span>`;
            } else {
                middle = `<span class="final-player-bet">ставка ${esc(st.bets[key])}</span>`;
            }
        } else {
            // judging / results
            if (!st.placed[key]) {
                middle = '<span class="final-player-note">без ставки</span>';
            } else {
                const revealed = verdict !== undefined || pcControls();
                const answerText = st.answers[key];
                const answerHtml = isLan()
                    ? `<span class="final-player-answer">${revealed ? (answerText ? `«${esc(answerText)}»` : '— нет ответа —') : '🔒 ответ скрыт'}</span>`
                    : '';
                const betHtml = `<span class="final-player-bet">${revealed ? `ставка ${esc(st.bets[key])}` : 'ставка ?'}</span>`;
                middle = answerHtml + betHtml;
                if (verdict !== undefined) {
                    const bet = Number(st.bets[key]) || 0;
                    right = `<span class="final-player-verdict ${verdict ? 'correct' : 'wrong'}">${verdict ? `✅ +${bet}` : `❌ −${bet}`}</span>`;
                } else if (pcControls() && st.stage === 'judging') {
                    right = `<div class="final-judge">
                        <button class="final-judge-btn correct" type="button" data-key="${esc(key)}" data-ok="1">✅ Верно</button>
                        <button class="final-judge-btn wrong" type="button" data-key="${esc(key)}" data-ok="0">❌ Неверно</button>
                    </div>`;
                } else {
                    right = '<span class="final-player-state">⏳ проверка…</span>';
                }
            }
        }

        const classes = ['final-player'];
        if (!isFinalist) classes.push('is-out');
        if (st.placed[key]) classes.push('is-bet');
        if (st.answered[key]) classes.push('is-answered');
        if (verdict === true) classes.push('is-correct');
        if (verdict === false) classes.push('is-wrong');
        return `<div class="${classes.join(' ')}" data-key="${esc(key)}">
            <div class="final-player-head">${avatar}
                <span class="final-player-name">${esc(team.name)}</span>
                <span class="final-player-score">${esc(team.score)}</span>
            </div>
            <div class="final-player-body">${middle}</div>
            <div class="final-player-side">${right}</div>
        </div>`;
    }

    function renderPlayers() {
        const box = $('final-players');
        if (!box) return;
        const list = teamList().map((t, i) => ({team: t, idx: i, key: keyOf(t, i)}));
        if (st.stage === 'results') list.sort((a, b) => (Number(b.team.score) || 0) - (Number(a.team.score) || 0));
        // Keep a typed bet while the list re-renders (LAN events, score updates)
        const focused = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('final-bet-input')
            ? document.activeElement.dataset.key : null;
        box.innerHTML = list.map(item => playerRowHtml(item.team, item.idx, item.key)).join('');

        box.querySelectorAll('.final-bet-input').forEach(input => {
            input.addEventListener('input', () => {
                const v = parseInt(input.value, 10);
                if (isNaN(v)) delete st.bets[input.dataset.key];
                else st.bets[input.dataset.key] = v;
                input.classList.remove('is-invalid');
                renderActions();
            });
            if (focused && input.dataset.key === focused) input.focus();
        });
        box.querySelectorAll('.final-bet-quick').forEach(btn => {
            btn.addEventListener('click', () => {
                st.bets[btn.dataset.key] = Number(btn.dataset.val);
                renderPlayers();
                renderActions();
            });
        });
        box.querySelectorAll('.final-judge-btn').forEach(btn => {
            btn.addEventListener('click', () => judge(btn.dataset.key, btn.dataset.ok === '1'));
        });
    }

    function renderStatus() {
        const el = $('final-status');
        if (!el) return;
        const lan = isLan();
        const host = pcControls();
        const n = finalists().length;
        let text = '';
        switch (st.stage) {
            case 'intro': {
                const themes = (currentRound() && currentRound().themes) || [];
                if (host) text = themes.length > 1 ? 'Выберите тему финала — остальные темы выбывают' : 'Финальный вопрос один на всех. Ставки делают все, у кого есть очки';
                else text = 'Ведущий выбирает тему финала на телефоне…';
                break;
            }
            case 'bets':
                if (!lan) text = 'Каждая команда тайно выбирает ставку: от 1 до своего счёта. Остальные — не подглядывать 🙈';
                else text = `Игроки делают ставки на телефонах: ${bidders().length} из ${n}`;
                break;
            case 'question':
                text = lan ? 'Пишите ответ на телефоне — после таймера ввод закроется' : 'Команды записывают ответ. Время пошло!';
                break;
            case 'judging':
                text = host ? 'Оцените каждый ответ: верно — ставка прибавляется, неверно — вычитается' : 'Ведущий проверяет ответы…';
                break;
            case 'results':
                text = 'Финал сыгран! Итоговый счёт';
                break;
            default:
                text = '';
        }
        el.textContent = text;
    }

    function renderActions() {
        const box = $('final-actions');
        if (!box) return;
        box.innerHTML = '';
        if (!pcControls()) return;
        const add = (label, cls, fn, disabled = false) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `btn ${cls}`;
            btn.textContent = label;
            btn.disabled = disabled;
            btn.onclick = fn;
            box.appendChild(btn);
        };
        const lan = isLan();
        if (st.stage === 'intro') {
            const themes = (currentRound() && currentRound().themes) || [];
            if (themes.length === 1) add('🏁 Начать финал', 'btn-success', () => start(0));
        } else if (st.stage === 'bets') {
            if (lan) {
                const count = bidders().length;
                add(count ? `💰 Принять ставки (${count}) и открыть вопрос` : '⏳ Ждём ставки…', 'btn-success', closeBets, count === 0);
            } else {
                const ready = finalists().filter(k => st.bets[k] !== undefined).length;
                add(`💰 Ставки сделаны (${ready}/${finalists().length}) — показать вопрос`, 'btn-success', closeBets, ready === 0);
            }
        } else if (st.stage === 'question') {
            if (!lan) {
                add(st.paused ? '▶️ Продолжить' : '⏸️ Пауза', 'btn-check', togglePause);
                add('⏭️ Время вышло — к ответам', 'btn-check', () => {
                    stopTimer();
                    setStage('judging');
                });
            }
        } else if (st.stage === 'results') {
            add('🏆 Итоги игры', 'btn-success', finish);
        }
    }

    // ------------------------------------------------------------------ flow

    /** Called by initBoard for a final round (also on every LAN board refresh: keeps the stage) */
    function showForRound(roundIdx) {
        if (!st.active || st.roundIdx !== roundIdx) {
            reset(roundIdx);
            sound('playAuctionFanfareSound');
            if (window.steamIntegration) {
                try {
                    window.steamIntegration.updateGameStatus({activity: 'Финал'});
                } catch (e) {
                }
            }
        }
        setLayoutVisible(true);
        render();
    }

    function start(themeIdx) {
        const round = currentRound();
        const theme = round && round.themes && round.themes[themeIdx];
        const question = theme && theme.questions && theme.questions[0];
        if (!question) return;
        if (isLan()) {
            // The server opens the final; `question_active` brings us to the bets
            hostNetworkClient.selectQuestion(themeIdx, 0, question);
            return;
        }
        st.themeIdx = themeIdx;
        st.themeName = theme.name || '';
        st.question = question;
        st.limits = computeLocalLimits(question.cost);
        // One possible bet (everybody at the nominal): nothing to choose
        finalists().forEach(k => {
            if (st.limits[k].min === st.limits[k].max) st.bets[k] = st.limits[k].min;
        });
        setStage('bets');
    }

    function closeBets() {
        if (isLan()) {
            hostNetworkClient.startAuctionAnswer(bidders());
            return;
        }
        let hasErrors = false;
        finalists().forEach(k => {
            const lim = st.limits[k];
            const v = st.bets[k];
            const input = document.querySelector(`.final-bet-input[data-key="${k}"]`);
            if (v === undefined) return; // no bet: the team sits the final out
            if (isNaN(v) || v < lim.min || v > lim.max) {
                hasErrors = true;
                if (input) input.classList.add('is-invalid');
            } else {
                st.placed[k] = true;
            }
        });
        if (hasErrors) {
            st.placed = {};
            if (typeof showSystemModal === 'function') {
                showSystemModal('❌ Недопустимая ставка', 'Ставка в финале — от 1 до текущего счёта команды.');
            }
            return;
        }
        if (bidders().length === 0) return;
        setStage('question');
        sound('playStartThinkingSound');
        startTimer(LOCAL_ANSWER_SECONDS, () => setStage('judging'));
    }

    function togglePause() {
        st.paused = !st.paused;
        renderTimer();
        renderActions();
    }

    function judge(key, isCorrect) {
        if (st.verdicts[key] !== undefined) return;
        if (isLan()) {
            // The server applies the bet and answers with `final_judged` + `score_updated`
            hostNetworkClient.judgeFinal(key, isCorrect);
            return;
        }
        const idx = teamIdxByKey(key);
        const bet = Number(st.bets[key]) || 0;
        st.verdicts[key] = Boolean(isCorrect);
        if (idx !== -1 && typeof changeTeamScore === 'function') changeTeamScore(idx, isCorrect ? bet : -bet);
        sound(isCorrect ? 'playVictorySound' : 'playTimeUpSound');
        afterVerdict();
    }

    function afterVerdict() {
        const all = bidders().every(k => st.verdicts[k] !== undefined);
        if (all) {
            st.answerShown = true;
            setStage('results');
        } else {
            render();
        }
    }

    function markQuestionUsed() {
        const round = currentRound();
        const q = round && st.themeIdx !== null && round.themes && round.themes[st.themeIdx] && round.themes[st.themeIdx].questions[0];
        if (q) q.used = true;
    }

    function finish() {
        if (isLan()) {
            // The server ends the game (GAME_OVER); `question_closed` hides this screen
            hostNetworkClient.closeQuestion();
            return;
        }
        markQuestionUsed();
        hide();
        if (typeof isTestMode !== 'undefined' && isTestMode) {
            isTestMode = false;
            if (typeof hideGameLayout === 'function') hideGameLayout();
            if (typeof showSubScreen === 'function') showSubScreen('sub-menu-dev');
            return;
        }
        if (typeof hideGameLayout === 'function') hideGameLayout();
        if (typeof showWinnerCelebration === 'function') showWinnerCelebration();
    }

    function hide() {
        stopTimer();
        const wasActive = st.active;
        st.active = false;
        st.roundIdx = null;
        if (wasActive || !($('final-screen') || {}).hidden) setLayoutVisible(false);
    }

    // ------------------------------------------------------------------ LAN events

    function onQuestionActive(payload) {
        if (!payload) return;
        if (!st.active) showForRound(currentRoundIndex);
        stopTimer();
        st.themeIdx = payload.themeIdx !== undefined ? payload.themeIdx : 0;
        st.themeName = payload.themeName || '';
        st.question = payload.question || null;
        st.limits = Object.assign({}, payload.finalBetLimits || {});
        st.bets = {};
        st.placed = {};
        st.answers = {};
        st.answered = {};
        st.verdicts = {};
        st.answerShown = false;
        setStage('bets');
    }

    function onBet(payload) {
        if (!st.active || !payload || !payload.playerId) return;
        st.placed[payload.playerId] = true;
        if (payload.amount !== undefined) st.bets[payload.playerId] = Number(payload.amount) || 0;
        render();
    }

    function onAnswersStart(payload) {
        if (!st.active) return;
        if (payload && payload.question) st.question = payload.question;
        st.placed = {};
        ((payload && payload.biddingPlayerIds) || []).forEach(id => {
            st.placed[id] = true;
        });
        Object.entries((payload && payload.bets) || {}).forEach(([id, v]) => {
            st.bets[id] = Number(v) || 0;
        });
        setStage('question');
        sound('playStartThinkingSound');
        // The server locks the input itself; this countdown is only the picture
        startTimer((payload && payload.answerTime) || LOCAL_ANSWER_SECONDS, null);
    }

    function onAnswerSubmitted(payload) {
        if (!st.active || !payload || !payload.playerId) return;
        st.answered[payload.playerId] = true;
        if (payload.answerText !== undefined) st.answers[payload.playerId] = payload.answerText;
        render();
    }

    function onAnswersLocked() {
        if (!st.active) return;
        stopTimer();
        st.timeLeft = 0;
        renderTimer();
        setStage('judging');
    }

    function onJudged(payload) {
        if (!st.active || !payload || !payload.playerId) return;
        st.verdicts[payload.playerId] = Boolean(payload.isCorrect);
        if (payload.bet !== undefined) st.bets[payload.playerId] = Number(payload.bet) || 0;
        if (payload.answerText !== undefined) st.answers[payload.playerId] = payload.answerText;
        sound(payload.isCorrect ? 'playVictorySound' : 'playTimeUpSound');
        if (payload.allJudged) {
            st.answerShown = true;
            setStage('results');
        } else {
            render();
        }
    }

    function onShowAnswer() {
        if (!st.active) return;
        st.answerShown = true;
        render();
    }

    function onPause(isPaused) {
        if (!st.active) return;
        st.paused = Boolean(isPaused);
        renderTimer();
    }

    /** Scores changed (local judging or `score_updated`) */
    function refresh() {
        if (st.active) render();
    }

    window.FinalRound = {
        showForRound,
        isActive: () => st.active,
        getStage: () => st.stage,
        start,
        closeBets,
        judge,
        finish,
        hide,
        refresh,
        onQuestionActive,
        onBet,
        onAnswersStart,
        onAnswerSubmitted,
        onAnswersLocked,
        onJudged,
        onShowAnswer,
        onPause,
        LOCAL_ANSWER_SECONDS
    };
})();
