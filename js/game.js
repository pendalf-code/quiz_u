    let audioCtx = null;
    let fireworksInterval = null;
    let isTestMode = false;

    let currentActiveQuestion = null;
    let isAnswerTimerActive = false;
    let savedThinkingTime = 0;
    let answerCountdownInterval = null;

    function normalizeGameData(data) {
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
    }
    window.normalizeGameData = normalizeGameData;

    let rawSavedPack = null;
    try {
        rawSavedPack = JSON.parse(localStorage.getItem('jeopardy_pack'));
    } catch (e) {
        console.warn("Could not parse saved jeopardy_pack", e);
    }
    let gameData = normalizeGameData(rawSavedPack);
    if (!gameData || gameData.length === 0 || (gameData[0]?.themes?.[0]?.name === "Гейминг и Мемы" && gameData[0]?.themes?.[0]?.questions?.[0]?.a === "Among Us")) {
        const defaultPackRounds = (typeof AVAILABLE_PACKS !== 'undefined' && AVAILABLE_PACKS.length > 0) ? AVAILABLE_PACKS[0].rounds : null;
        gameData = normalizeGameData(defaultPackRounds);
        try {
            localStorage.setItem('jeopardy_pack', JSON.stringify(gameData));
        } catch (e) {}
    }
    let currentRoundIndex = 0, currentCost = 0, timerInterval = null, timeLeft = 30, isReadingTime = true;
    let currentThemeIdx = 0, currentQuestionIdx = 0;
    let configReadingTime = parseInt(localStorage.getItem('cfg_reading_time')) || 7;
    let configThinkingTime = parseInt(localStorage.getItem('cfg_thinking_time')) || 30;
    let configAnswerTime = parseInt(localStorage.getItem('cfg_answer_time')) || 5;
    let activeTeamIdxForQuestion = null, currentTurnTeamIdx = 0, activeCellOnBoard = null;
    let auctionBets = {};
    let teams = [{name: "Команда 1", score: 0}, {name: "Команда 2", score: 0}];
    let gameStats = {};

    function initTheme() {
        const saved = localStorage.getItem('quiz_theme') || 'dark';
        const toggleBtn = document.getElementById('theme-toggle');
        if (saved === 'light') {
            document.body.classList.add('light-theme');
            if (toggleBtn) toggleBtn.textContent = '🌙';
        } else {
            document.body.classList.remove('light-theme');
            if (toggleBtn) toggleBtn.textContent = '☀️';
        }
    }

    function toggleTheme() {
        const isLight = document.body.classList.toggle('light-theme');
        const toggleBtn = document.getElementById('theme-toggle');
        if (toggleBtn) toggleBtn.textContent = isLight ? '🌙' : '☀️';
        localStorage.setItem('quiz_theme', isLight ? 'light' : 'dark');
        if (!isLight) {
            generateStarrySky();
        } else {
            const container = document.getElementById('stars-container');
            if (container) container.innerHTML = '';
        }
    }

    initTheme();

    function getAudioContext() {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) audioCtx = new AudioContext();
        }
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }

    function playVictorySound() {
        try {
            const ctx = getAudioContext();
            if (!ctx) return;
            const now = ctx.currentTime;
            const notes = [523.25, 659.25, 783.99, 1046.50];
            notes.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + idx * 0.12);
                gain.gain.setValueAtTime(0.3, now + idx * 0.12);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.6);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + idx * 0.12);
                osc.stop(now + idx * 0.12 + 0.6);
            });
        } catch (e) {
        }
    }

    function playStartThinkingSound() {
        try {
            const ctx = getAudioContext();
            if (!ctx) return;
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(440, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.25);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.25);
        } catch (e) {
        }
    }

    function playTickSound() {
        try {
            const ctx = getAudioContext();
            if (!ctx) return;
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.08);
        } catch (e) {
        }
    }

    function playTimeUpSound() {
        try {
            const ctx = getAudioContext();
            if (!ctx) return;
            const osc1 = ctx.createOscillator(), osc2 = ctx.createOscillator(), gain = ctx.createGain();
            osc1.type = 'sine';
            osc2.type = 'triangle';
            osc1.frequency.setValueAtTime(987.77, ctx.currentTime);
            osc2.frequency.setValueAtTime(1318.51, ctx.currentTime);
            gain.gain.setValueAtTime(0.5, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.2);
            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);
            osc1.start(ctx.currentTime);
            osc2.start(ctx.currentTime);
            osc1.stop(ctx.currentTime + 1.2);
            osc2.stop(ctx.currentTime + 1.2);
        } catch (e) {
        }
    }

    function playGavelStrikeSound() {
        try {
            const ctx = getAudioContext();
            if (!ctx) return;
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(340, now);
            osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);
            gain.gain.setValueAtTime(0.7, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.14);

            const oscThud = ctx.createOscillator();
            const gainThud = ctx.createGain();
            oscThud.type = 'sine';
            oscThud.frequency.setValueAtTime(130, now);
            oscThud.frequency.exponentialRampToValueAtTime(35, now + 0.22);
            gainThud.gain.setValueAtTime(0.75, now);
            gainThud.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
            oscThud.connect(gainThud);
            gainThud.connect(ctx.destination);
            oscThud.start(now);
            oscThud.stop(now + 0.22);
        } catch (e) {
        }
    }

    function playAuctionFanfareSound() {
        try {
            const ctx = getAudioContext();
            if (!ctx) return;
            const now = ctx.currentTime;
            const sequence = [
                {f: 392.00, t: 0.00, d: 0.12},
                {f: 523.25, t: 0.12, d: 0.12},
                {f: 659.25, t: 0.24, d: 0.12},
                {f: 783.99, t: 0.36, d: 0.28},
                {f: 523.25, t: 0.68, d: 0.8},
                {f: 659.25, t: 0.68, d: 0.8},
                {f: 783.99, t: 0.68, d: 0.8},
                {f: 1046.50, t: 0.68, d: 0.8}
            ];
            sequence.forEach(note => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(note.f, now + note.t);
                gain.gain.setValueAtTime(0.32, now + note.t);
                gain.gain.exponentialRampToValueAtTime(0.001, now + note.t + note.d);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + note.t);
                osc.stop(now + note.t + note.d);
            });
        } catch (e) {
        }
    }

    let catSplashTimer = null;
    let catSplashOnComplete = null;
    let isDismissingCatSplash = false;

    function showCatInBagSplash(onComplete) {
        catSplashOnComplete = onComplete;
        isDismissingCatSplash = false;
        const overlay = document.getElementById('cat-splash-overlay');
        if (!overlay) {
            if (onComplete) onComplete();
            return;
        }

        overlay.classList.remove('fade-out');
        overlay.style.display = 'flex';

        // Re-inject SVG so animations replay cleanly every time
        const animWrap = overlay.querySelector('.cat-splash-anim-wrap');
        if (animWrap) {
            animWrap.innerHTML = `
                <div class="cat-splash-bubble">МЯУ! 🐾</div>
                ${getCatInBagSvgHtml('cat-splash-svg')}
            `;
        }

        // Play meow sound synchronized with head emergence
        setTimeout(() => {
            playCatMeowSound();
        }, 550);

        // Auto dismiss after 3.2s if not clicked
        if (catSplashTimer) clearTimeout(catSplashTimer);
        catSplashTimer = setTimeout(() => {
            dismissCatSplash();
        }, 3200);
    }

    function dismissCatSplash(event) {
        if (event) event.stopPropagation();
        if (isDismissingCatSplash) return;
        isDismissingCatSplash = true;

        if (catSplashTimer) {
            clearTimeout(catSplashTimer);
            catSplashTimer = null;
        }
        const overlay = document.getElementById('cat-splash-overlay');
        if (!overlay || overlay.style.display === 'none') {
            isDismissingCatSplash = false;
            if (catSplashOnComplete) {
                const cb = catSplashOnComplete;
                catSplashOnComplete = null;
                cb();
            }
            return;
        }

        overlay.classList.add('fade-out');
        setTimeout(() => {
            overlay.style.display = 'none';
            overlay.classList.remove('fade-out');
            isDismissingCatSplash = false;
            if (catSplashOnComplete) {
                const cb = catSplashOnComplete;
                catSplashOnComplete = null;
                cb();
            }
        }, 250);
    }

    let auctionSplashTimer = null;
    let auctionSplashOnComplete = null;
    let isDismissingAuctionSplash = false;

    function showAuctionSplash(type, onComplete) {
        auctionSplashOnComplete = onComplete;
        isDismissingAuctionSplash = false;
        const overlay = document.getElementById('auction-splash-overlay');
        if (!overlay) {
            if (onComplete) onComplete();
            return;
        }

        const isLeaderAuction = (type === 'auction_leader');
        const titleElem = document.getElementById('auction-splash-title');
        const subtitleElem = document.getElementById('auction-splash-subtitle');
        const continueBtn = document.getElementById('auction-splash-continue-btn');
        const animWrap = document.getElementById('auction-splash-anim-wrap');

        if (isLeaderAuction) {
            if (titleElem) titleElem.innerHTML = "\uD83D\uDD28 \u0410\u0423\u041A\u0426\u0418\u041E\u041D \u0417\u0410 \u041F\u0420\u0410\u0412\u041E \u041E\u0422\u0412\u0415\u0422\u0410! \uD83D\uDD28";
            if (subtitleElem) subtitleElem.textContent = "\u0412\u043E\u043F\u0440\u043E\u0441 \u0434\u043E\u0441\u0442\u0430\u043D\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0441\u0430\u043C\u043E\u0439 \u0432\u044B\u0441\u043E\u043A\u043E\u0439 \u0441\u0442\u0430\u0432\u043A\u0435!";
            if (continueBtn) continueBtn.innerHTML = "\uD83D\uDD28 \u041D\u0430\u0447\u0430\u0442\u044C \u0442\u043E\u0440\u0433\u0438 \u2794";
            if (animWrap) {
                animWrap.innerHTML = `
                    <div class="auction-splash-bubble">\u041F\u0420\u041E\u0414\u0410\u041D\u041E! \u26A1</div>
                    ${getAuctionGavelSvgHtml('auction-splash-svg')}
                `;
            }
            setTimeout(() => {
                playGavelStrikeSound();
            }, 450);
            setTimeout(() => {
                playAuctionFanfareSound();
            }, 720);
        } else {
            if (titleElem) titleElem.innerHTML = "\uD83D\uDCB0 \u0412\u041E\u041F\u0420\u041E\u0421 \u0421\u041E \u0421\u0422\u0410\u0412\u041A\u041E\u0419! \uD83D\uDCB0";
            if (subtitleElem) subtitleElem.textContent = "\u0421\u0442\u0430\u0432\u043A\u0438 \u0434\u0435\u043B\u0430\u044E\u0442 \u0432\u0441\u0435 \u043A\u043E\u043C\u0430\u043D\u0434\u044B! \u0420\u0438\u0441\u043A\u0443\u0439\u0442\u0435 \u043E\u0447\u043A\u0430\u043C\u0438 \u0438 \u0438\u0434\u0438\u0442\u0435 \u0432\u0430-\u0431\u0430\u043D\u043A!";
            if (continueBtn) continueBtn.innerHTML = "\uD83D\uDCB0 \u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A \u0442\u043E\u0440\u0433\u0430\u043C \u2794";
            if (animWrap) {
                animWrap.innerHTML = `
                    <div class="auction-splash-bubble">\u0412\u0410-\u0411\u0410\u041D\u041A! \uD83E\uDE99</div>
                    ${getAuctionChestSvgHtml('auction-splash-svg')}
                `;
            }
            setTimeout(() => {
                playAuctionFanfareSound();
            }, 250);
        }

        overlay.classList.remove('fade-out');
        overlay.style.display = 'flex';

        if (auctionSplashTimer) clearTimeout(auctionSplashTimer);
        auctionSplashTimer = setTimeout(() => {
            dismissAuctionSplash();
        }, 3200);
    }

    function dismissAuctionSplash(event) {
        if (event) event.stopPropagation();
        if (isDismissingAuctionSplash) return;
        isDismissingAuctionSplash = true;

        if (auctionSplashTimer) {
            clearTimeout(auctionSplashTimer);
            auctionSplashTimer = null;
        }
        const overlay = document.getElementById('auction-splash-overlay');
        if (!overlay || overlay.style.display === 'none') {
            isDismissingAuctionSplash = false;
            if (auctionSplashOnComplete) {
                const cb = auctionSplashOnComplete;
                auctionSplashOnComplete = null;
                cb();
            }
            return;
        }

        overlay.classList.add('fade-out');
        setTimeout(() => {
            overlay.style.display = 'none';
            overlay.classList.remove('fade-out');
            isDismissingAuctionSplash = false;
            if (auctionSplashOnComplete) {
                const cb = auctionSplashOnComplete;
                auctionSplashOnComplete = null;
                cb();
            }
        }, 250);
    }

    function getAuctionChestSvgHtml(extraClass = 'auction-splash-svg') {
        return `
            <svg class="${extraClass}" viewBox="0 0 340 280">
                <defs>
                    <radialGradient id="chestGlowGrad" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.8"/>
                        <stop offset="50%" stop-color="#f59e0b" stop-opacity="0.3"/>
                        <stop offset="100%" stop-color="#d97706" stop-opacity="0"/>
                    </radialGradient>
                    <linearGradient id="chestWoodGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="#9a3412"/>
                        <stop offset="50%" stop-color="#7c2d12"/>
                        <stop offset="100%" stop-color="#451a03"/>
                    </linearGradient>
                    <linearGradient id="chestGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#fef08a"/>
                        <stop offset="35%" stop-color="#facc15"/>
                        <stop offset="70%" stop-color="#eab308"/>
                        <stop offset="100%" stop-color="#a16207"/>
                    </linearGradient>
                    <radialGradient id="coinGrad" cx="35%" cy="35%" r="65%">
                        <stop offset="0%" stop-color="#fef9c3"/>
                        <stop offset="40%" stop-color="#facc15"/>
                        <stop offset="85%" stop-color="#ca8a04"/>
                        <stop offset="100%" stop-color="#854d0e"/>
                    </radialGradient>
                    <linearGradient id="gemRubyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#fda4af"/>
                        <stop offset="40%" stop-color="#f43f5e"/>
                        <stop offset="100%" stop-color="#9f1239"/>
                    </linearGradient>
                    <linearGradient id="gemBlueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#bae6fd"/>
                        <stop offset="40%" stop-color="#0ea5e9"/>
                        <stop offset="100%" stop-color="#0369a1"/>
                    </linearGradient>
                    <filter id="chestDropShadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="8" stdDeviation="8" flood-opacity="0.5"/>
                    </filter>
                    <filter id="coinGlow" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="3" result="blur"/>
                        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
                    </filter>
                </defs>

                <ellipse cx="170" cy="252" rx="110" ry="18" fill="rgba(0,0,0,0.4)" filter="url(#chestDropShadow)"/>

                <g class="anim-chest-aura" transform="translate(170, 160)">
                    <circle cx="0" cy="0" r="130" fill="url(#chestGlowGrad)"/>
                </g>

                <g class="anim-chest-base-group" filter="url(#chestDropShadow)">
                    <path d="M 85 160 L 255 160 L 245 180 L 95 180 Z" fill="#2d0f04"/>
                    <ellipse cx="170" cy="168" rx="65" ry="14" fill="#fde047" opacity="0.95" filter="url(#coinGlow)"/>

                    <g class="anim-coins-burst">
                        <g class="anim-coin-1" filter="url(#coinGlow)">
                            <ellipse cx="120" cy="115" rx="14" ry="14" fill="url(#coinGrad)" stroke="#fef08a" stroke-width="1.5"/>
                            <ellipse cx="120" cy="115" rx="10" ry="10" fill="none" stroke="#ca8a04" stroke-width="1.2"/>
                            <text x="120" y="120" font-size="11" font-weight="900" text-anchor="middle" fill="#713f12">в‚Ѕ</text>
                        </g>
                        <g class="anim-coin-2" filter="url(#coinGlow)">
                            <ellipse cx="225" cy="105" rx="15" ry="15" fill="url(#coinGrad)" stroke="#fef08a" stroke-width="1.5"/>
                            <ellipse cx="225" cy="105" rx="11" ry="11" fill="none" stroke="#ca8a04" stroke-width="1.2"/>
                            <text x="225" y="111" font-size="12" font-weight="900" text-anchor="middle" fill="#713f12">в…</text>
                        </g>
                        <g class="anim-coin-3" filter="url(#coinGlow)">
                            <ellipse cx="170" cy="65" rx="17" ry="17" fill="url(#coinGrad)" stroke="#fef08a" stroke-width="2"/>
                            <ellipse cx="170" cy="65" rx="12" ry="12" fill="none" stroke="#ca8a04" stroke-width="1.4"/>
                            <text x="170" y="71" font-size="14" font-weight="900" text-anchor="middle" fill="#713f12">в‚Ѕ</text>
                        </g>
                        <g class="anim-coin-4">
                            <ellipse cx="70" cy="130" rx="12" ry="12" fill="url(#coinGrad)" stroke="#fef08a" stroke-width="1.2"/>
                            <text x="70" y="134" font-size="9" font-weight="900" text-anchor="middle" fill="#713f12">в…</text>
                        </g>
                        <g class="anim-coin-5">
                            <ellipse cx="270" cy="125" rx="12" ry="12" fill="url(#coinGrad)" stroke="#fef08a" stroke-width="1.2"/>
                            <text x="270" y="129" font-size="9" font-weight="900" text-anchor="middle" fill="#713f12">в‚Ѕ</text>
                        </g>

                        <g class="anim-gem-ruby">
                            <polygon points="140,85 148,93 140,105 132,93" fill="url(#gemRubyGrad)" stroke="#fecdd3" stroke-width="1.2"/>
                        </g>
                        <g class="anim-gem-blue">
                            <polygon points="202,75 211,83 202,96 193,83" fill="url(#gemBlueGrad)" stroke="#e0f2fe" stroke-width="1.2"/>
                        </g>

                        <g class="anim-sparkle-1" transform="translate(130, 60)">
                            <path d="M 0,-12 Q 0,0 12,0 Q 0,0 0,12 Q 0,0 -12,0 Q 0,0 0,-12" fill="#fff" opacity="0.95"/>
                        </g>
                        <g class="anim-sparkle-2" transform="translate(215, 55)">
                            <path d="M 0,-10 Q 0,0 10,0 Q 0,0 0,10 Q 0,0 -10,0 Q 0,0 0,-10" fill="#fef08a" opacity="0.95"/>
                        </g>
                        <g class="anim-sparkle-3" transform="translate(170, 28)">
                            <path d="M 0,-14 Q 0,0 14,0 Q 0,0 0,14 Q 0,0 -14,0 Q 0,0 0,-14" fill="#fff" opacity="0.95"/>
                        </g>
                    </g>

                    <path d="M 80 160 L 260 160 L 250 240 L 90 240 Z" fill="url(#chestWoodGrad)" stroke="#3f1704" stroke-width="3"/>
                    <rect x="78" y="160" width="22" height="80" fill="url(#chestGoldGrad)" stroke="#854d0e" stroke-width="1.5"/>
                    <rect x="240" y="160" width="22" height="80" fill="url(#chestGoldGrad)" stroke="#854d0e" stroke-width="1.5"/>
                    <rect x="159" y="160" width="22" height="80" fill="url(#chestGoldGrad)" stroke="#854d0e" stroke-width="1.5"/>

                    <circle cx="89" cy="175" r="2.5" fill="#fef08a"/>
                    <circle cx="89" cy="200" r="2.5" fill="#fef08a"/>
                    <circle cx="89" cy="225" r="2.5" fill="#fef08a"/>
                    <circle cx="251" cy="175" r="2.5" fill="#fef08a"/>
                    <circle cx="251" cy="200" r="2.5" fill="#fef08a"/>
                    <circle cx="251" cy="225" r="2.5" fill="#fef08a"/>

                    <rect x="156" y="170" width="28" height="32" rx="6" fill="url(#chestGoldGrad)" stroke="#78350f" stroke-width="2"/>
                    <circle cx="170" cy="182" r="4.5" fill="#451a03"/>
                    <polygon points="168,183 172,183 173,194 167,194" fill="#451a03"/>

                    <g class="anim-chest-lid">
                        <path d="M 75 160 Q 170 105 265 160 L 260 148 Q 170 95 80 148 Z" fill="url(#chestWoodGrad)" stroke="#3f1704" stroke-width="3"/>
                        <path d="M 77 158 Q 110 120 100 146 Z" fill="url(#chestGoldGrad)" stroke="#854d0e" stroke-width="1.5"/>
                        <path d="M 263 158 Q 230 120 240 146 Z" fill="url(#chestGoldGrad)" stroke="#854d0e" stroke-width="1.5"/>
                        <path d="M 160 134 Q 170 120 180 134 L 180 160 L 160 160 Z" fill="url(#chestGoldGrad)" stroke="#854d0e" stroke-width="1.5"/>
                        <path d="M 162 154 L 178 154 L 175 168 L 165 168 Z" fill="url(#chestGoldGrad)" stroke="#78350f" stroke-width="1.5"/>
                    </g>
                </g>
            </svg>
        `;
    }

    function getAuctionGavelSvgHtml(extraClass = 'auction-splash-svg') {
        return `
            <svg class="${extraClass}" viewBox="0 0 340 280">
                <defs>
                    <radialGradient id="gavelGlowGrad" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.8"/>
                        <stop offset="50%" stop-color="#d97706" stop-opacity="0.3"/>
                        <stop offset="100%" stop-color="#b45309" stop-opacity="0"/>
                    </radialGradient>
                    <linearGradient id="blockWoodGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="#a16207"/>
                        <stop offset="30%" stop-color="#78350f"/>
                        <stop offset="80%" stop-color="#451a03"/>
                        <stop offset="100%" stop-color="#270e02"/>
                    </linearGradient>
                    <linearGradient id="blockPlateGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stop-color="#ca8a04"/>
                        <stop offset="50%" stop-color="#fef08a"/>
                        <stop offset="100%" stop-color="#a16207"/>
                    </linearGradient>
                    <linearGradient id="gavelHandleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#fef08a"/>
                        <stop offset="30%" stop-color="#b45309"/>
                        <stop offset="70%" stop-color="#78350f"/>
                        <stop offset="100%" stop-color="#451a03"/>
                    </linearGradient>
                    <linearGradient id="gavelHeadGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="#fef08a"/>
                        <stop offset="25%" stop-color="#facc15"/>
                        <stop offset="65%" stop-color="#ca8a04"/>
                        <stop offset="100%" stop-color="#854d0e"/>
                    </linearGradient>
                    <filter id="gavelDropShadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="8" stdDeviation="7" flood-opacity="0.5"/>
                    </filter>
                    <filter id="impactGlow" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="4" result="blur"/>
                        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
                    </filter>
                </defs>

                <ellipse cx="170" cy="254" rx="115" ry="18" fill="rgba(0,0,0,0.45)" filter="url(#gavelDropShadow)"/>

                <g class="anim-gavel-aura" transform="translate(170, 175)">
                    <circle cx="0" cy="0" r="120" fill="url(#gavelGlowGrad)"/>
                </g>

                <g class="anim-sounding-block" filter="url(#gavelDropShadow)">
                    <path d="M 90 236 L 250 236 L 256 248 L 84 248 Z" fill="#270e02"/>
                    <ellipse cx="170" cy="236" rx="80" ry="16" fill="url(#blockWoodGrad)"/>

                    <path d="M 110 206 L 230 206 L 236 226 L 104 226 Z" fill="#3b1303" stroke="#200a01" stroke-width="1.5"/>
                    <ellipse cx="170" cy="206" rx="60" ry="14" fill="url(#blockWoodGrad)" stroke="#a16207" stroke-width="2"/>

                    <ellipse cx="170" cy="206" rx="42" ry="9" fill="url(#blockPlateGrad)" stroke="#78350f" stroke-width="1.2"/>

                    <rect x="135" y="215" width="70" height="9" rx="3" fill="url(#blockPlateGrad)" stroke="#854d0e" stroke-width="1"/>
                    <text x="170" y="222" font-size="6.5" font-weight="900" fill="#451a03" text-anchor="middle" letter-spacing="1">&#9733; &#1040;&#1059;&#1050;&#1062;&#1048;&#1054;&#1053; &#9733;</text>
                </g>

                <g class="anim-shockwaves" transform="translate(170, 206)">
                    <ellipse class="anim-shockwave-1" cx="0" cy="0" rx="40" ry="12" fill="none" stroke="#fef08a" stroke-width="5" opacity="0"/>
                    <ellipse class="anim-shockwave-2" cx="0" cy="0" rx="40" ry="12" fill="none" stroke="#f59e0b" stroke-width="3" opacity="0"/>
                </g>

                <g class="anim-impact-burst" transform="translate(170, 206)">
                    <g class="anim-spark-left">
                        <path d="M -15,-5 L -55,-35" stroke="#fde047" stroke-width="3" stroke-linecap="round"/>
                        <polygon points="-65,-40 -58,-38 -60,-32" fill="#fff"/>
                        <circle cx="-42" cy="-18" r="3" fill="#facc15"/>
                        <path d="M 0,-15 Q -10,-35 -30,-45" stroke="#f59e0b" stroke-width="2.5" fill="none" stroke-linecap="round"/>
                    </g>
                    <g class="anim-spark-right">
                        <path d="M 15,-5 L 55,-35" stroke="#fde047" stroke-width="3" stroke-linecap="round"/>
                        <polygon points="65,-40 58,-38 60,-32" fill="#fff"/>
                        <circle cx="42" cy="-18" r="3" fill="#facc15"/>
                        <path d="M 0,-15 Q 10,-35 30,-45" stroke="#f59e0b" stroke-width="2.5" fill="none" stroke-linecap="round"/>
                    </g>
                    <g class="anim-spark-top">
                        <polygon points="0,-25 4,-35 14,-35 6,-42 9,-52 0,-46 -9,-52 -6,-42 -14,-35 -4,-35" fill="#fef08a" filter="url(#impactGlow)"/>
                    </g>
                </g>

                <g class="anim-gavel-wrapper" filter="url(#gavelDropShadow)">
                    <g transform="rotate(38, 170, 200)">
                        <path d="M 166 200 L 174 200 L 265 95 L 257 95 Z" fill="url(#gavelHandleGrad)" stroke="#381503" stroke-width="1.5"/>
                        <rect x="238" y="112" width="16" height="5" rx="2" fill="url(#gavelHeadGrad)" transform="rotate(-49, 246, 114)"/>
                        <rect x="250" y="100" width="14" height="5" rx="2" fill="url(#gavelHeadGrad)" transform="rotate(-49, 257, 102)"/>
                        <circle cx="265" cy="92" r="7" fill="url(#gavelHeadGrad)" stroke="#78350f" stroke-width="1.5"/>

                        <g transform="translate(142, 175) rotate(-49)">
                            <rect x="0" y="0" width="46" height="26" rx="4" fill="url(#gavelHeadGrad)" stroke="#78350f" stroke-width="2"/>
                            <rect x="18" y="-3" width="10" height="32" rx="2" fill="#fef08a" stroke="#a16207" stroke-width="1.5"/>
                            <rect x="-6" y="-2" width="8" height="30" rx="3" fill="url(#gavelHeadGrad)" stroke="#78350f" stroke-width="1.5"/>
                            <rect x="44" y="-2" width="8" height="30" rx="3" fill="url(#gavelHeadGrad)" stroke="#78350f" stroke-width="1.5"/>
                            <line x1="2" y1="5" x2="44" y2="5" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
                        </g>
                    </g>
                </g>
            </svg>
        `;
    }

    function getCatInBagSvgHtml(extraClass = 'cat-splash-svg') {
        return `
            <svg class="${extraClass}" viewBox="0 0 320 270">
                <defs>
                    <radialGradient id="sackGrad" cx="45%" cy="65%" r="60%">
                        <stop offset="0%" stop-color="#df9d56" />
                        <stop offset="60%" stop-color="#b67232" />
                        <stop offset="100%" stop-color="#784415" />
                    </radialGradient>
                    <linearGradient id="ropeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stop-color="#f6b93b" />
                        <stop offset="50%" stop-color="#fad390" />
                        <stop offset="100%" stop-color="#e58e26" />
                    </linearGradient>
                    <radialGradient id="catHeadGrad" cx="45%" cy="40%" r="65%">
                        <stop offset="0%" stop-color="#353540" />
                        <stop offset="65%" stop-color="#191920" />
                        <stop offset="100%" stop-color="#0c0c10" />
                    </radialGradient>
                    <radialGradient id="catEyeGrad" cx="35%" cy="35%" r="60%">
                        <stop offset="0%" stop-color="#7bed9f" />
                        <stop offset="50%" stop-color="#2ed573" />
                        <stop offset="100%" stop-color="#10ac84" />
                    </radialGradient>
                    <filter id="eyeGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="2.5" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <filter id="dropShadow" x="-10%" y="-10%" width="120%" height="120%">
                        <feDropShadow dx="0" dy="6" stdDeviation="6" flood-opacity="0.45"/>
                    </filter>
                </defs>

                <!-- SACK CONTAINER -->
                <g class="anim-sack" filter="url(#dropShadow)">
                    <!-- Hole inside sack -->
                    <ellipse cx="160" cy="132" rx="66" ry="24" fill="#201004" />

                    <!-- CAT PEEKING OUT -->
                    <g class="anim-cat-peek">
                        <g class="anim-cat-idle">
                            <!-- Left Ear -->
                            <g class="anim-left-ear">
                                <polygon points="112,74 134,22 144,72" fill="#191920" stroke="#0c0c10" stroke-width="2"/>
                                <polygon points="118,70 134,34 141,68" fill="#ff7675" opacity="0.8"/>
                            </g>
                            <!-- Right Ear -->
                            <g class="anim-right-ear">
                                <polygon points="176,72 186,22 208,74" fill="#191920" stroke="#0c0c10" stroke-width="2"/>
                                <polygon points="179,68 186,34 202,70" fill="#ff7675" opacity="0.8"/>
                            </g>

                            <!-- Head -->
                            <ellipse cx="160" cy="86" rx="46" ry="40" fill="url(#catHeadGrad)" />

                            <!-- Eyes Group with blink -->
                            <g class="anim-cat-eyes">
                                <!-- Left Eye -->
                                <ellipse cx="142" cy="82" rx="11" ry="13" fill="url(#catEyeGrad)" filter="url(#eyeGlow)" />
                                <ellipse cx="142" cy="82" rx="4" ry="10" fill="#0c0c10" />
                                <circle cx="139" cy="78" r="3.2" fill="#ffffff" />
                                <circle cx="144" cy="84" r="1.5" fill="#ffffff" />

                                <!-- Right Eye -->
                                <ellipse cx="178" cy="82" rx="11" ry="13" fill="url(#catEyeGrad)" filter="url(#eyeGlow)" />
                                <ellipse cx="178" cy="82" rx="4" ry="10" fill="#0c0c10" />
                                <circle cx="175" cy="78" r="3.2" fill="#ffffff" />
                                <circle cx="180" cy="84" r="1.5" fill="#ffffff" />
                            </g>

                            <!-- Cute Nose -->
                            <polygon points="156,96 164,96 160,101" fill="#ff7675" />

                            <!-- Mouth / Chin -->
                            <path d="M 154 102 Q 160 106 160 102 Q 160 106 166 102" stroke="#485460" stroke-width="1.8" fill="none" stroke-linecap="round"/>

                            <!-- Whiskers Left -->
                            <g class="anim-whiskers-left">
                                <line x1="148" y1="99" x2="114" y2="92" stroke="#f1f2f6" stroke-width="1.6" stroke-linecap="round" opacity="0.9"/>
                                <line x1="147" y1="102" x2="110" y2="102" stroke="#f1f2f6" stroke-width="1.6" stroke-linecap="round" opacity="0.9"/>
                                <line x1="148" y1="105" x2="115" y2="112" stroke="#f1f2f6" stroke-width="1.6" stroke-linecap="round" opacity="0.9"/>
                            </g>

                            <!-- Whiskers Right -->
                            <g class="anim-whiskers-right">
                                <line x1="172" y1="99" x2="206" y2="92" stroke="#f1f2f6" stroke-width="1.6" stroke-linecap="round" opacity="0.9"/>
                                <line x1="173" y1="102" x2="210" y2="102" stroke="#f1f2f6" stroke-width="1.6" stroke-linecap="round" opacity="0.9"/>
                                <line x1="172" y1="105" x2="205" y2="112" stroke="#f1f2f6" stroke-width="1.6" stroke-linecap="round" opacity="0.9"/>
                            </g>
                        </g>
                    </g>

                    <!-- SACK FRONT & ROPE -->
                    <path d="M 64 165 C 50 215, 80 255, 160 255 C 240 255, 270 215, 256 165 C 250 142, 235 132, 218 132 C 196 132, 180 142, 160 142 C 140 142, 124 132, 102 132 C 85 132, 70 142, 64 165 Z"
                          fill="url(#sackGrad)" stroke="#592f0b" stroke-width="3" />

                    <!-- Sack Folds & Shadows -->
                    <path d="M 96 170 Q 110 230 160 245" stroke="#784415" stroke-width="3.5" fill="none" opacity="0.4" stroke-linecap="round"/>
                    <path d="M 224 170 Q 210 230 160 245" stroke="#784415" stroke-width="3.5" fill="none" opacity="0.4" stroke-linecap="round"/>
                    <!-- Decorative Patch on sack -->
                    <polygon points="185,195 210,190 215,215 190,220" fill="#a56326" stroke="#592f0b" stroke-width="1.5"/>
                    <line x1="184" y1="193" x2="187" y2="198" stroke="#f6b93b" stroke-width="1.5"/>
                    <line x1="208" y1="188" x2="211" y2="193" stroke="#f6b93b" stroke-width="1.5"/>
                    <line x1="213" y1="213" x2="216" y2="218" stroke="#f6b93b" stroke-width="1.5"/>
                    <line x1="189" y1="218" x2="192" y2="223" stroke="#f6b93b" stroke-width="1.5"/>

                    <!-- Tied Golden Rope -->
                    <path d="M 100 138 C 120 146, 140 149, 160 149 C 180 149, 200 146, 220 138"
                          stroke="url(#ropeGrad)" stroke-width="8" fill="none" stroke-linecap="round" />
                    <!-- Rope Knot & Hanging Ends -->
                    <ellipse cx="140" cy="148" rx="7" ry="5" fill="#e58e26" />
                    <path d="M 138 152 Q 134 168 130 178" stroke="url(#ropeGrad)" stroke-width="4.5" fill="none" stroke-linecap="round"/>
                    <path d="M 142 152 Q 146 166 148 175" stroke="url(#ropeGrad)" stroke-width="4.5" fill="none" stroke-linecap="round"/>

                    <!-- CAT PAWS (Clinging to sack rim) -->
                    <g class="anim-paws">
                        <g>
                            <ellipse cx="122" cy="133" rx="10" ry="7" fill="#191920" stroke="#0c0c10" stroke-width="1.5" />
                            <circle cx="118" cy="131" r="2" fill="#ff7675" opacity="0.7"/>
                            <circle cx="122" cy="130" r="2" fill="#ff7675" opacity="0.7"/>
                            <circle cx="126" cy="131" r="2" fill="#ff7675" opacity="0.7"/>
                        </g>
                        <g>
                            <ellipse cx="198" cy="133" rx="10" ry="7" fill="#191920" stroke="#0c0c10" stroke-width="1.5" />
                            <circle cx="194" cy="131" r="2" fill="#ff7675" opacity="0.7"/>
                            <circle cx="198" cy="130" r="2" fill="#ff7675" opacity="0.7"/>
                            <circle cx="202" cy="131" r="2" fill="#ff7675" opacity="0.7"/>
                        </g>
                    </g>
                </g>
            </svg>
        `;
    }

    function playCatMeowSound() {
        try {
            const ctx = getAudioContext();
            if (!ctx) return;
            const now = ctx.currentTime;

            const osc = ctx.createOscillator();
            const filter = ctx.createBiquadFilter();
            const gain = ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.exponentialRampToValueAtTime(780, now + 0.22);
            osc.frequency.exponentialRampToValueAtTime(340, now + 0.8);

            filter.type = 'bandpass';
            filter.Q.value = 4.0;
            filter.frequency.setValueAtTime(750, now);
            filter.frequency.exponentialRampToValueAtTime(1400, now + 0.22);
            filter.frequency.exponentialRampToValueAtTime(600, now + 0.8);

            gain.gain.setValueAtTime(0.001, now);
            gain.gain.exponentialRampToValueAtTime(0.35, now + 0.08);
            gain.gain.setValueAtTime(0.3, now + 0.35);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now);
            osc.stop(now + 0.9);
        } catch (e) {
        }
    }

    function stopFireworks() {
        if (fireworksInterval) {
            clearInterval(fireworksInterval);
            fireworksInterval = null;
        }
    }

    function triggerFireworksAnimation() {
        stopFireworks();
        playVictorySound();
        if (typeof confetti !== 'function') return;

        const duration = 5 * 1000;
        const animationEnd = Date.now() + duration;

        fireworksInterval = setInterval(() => {
            const timeLeft = animationEnd - Date.now();
            if (timeLeft <= 0) {
                return clearInterval(fireworksInterval);
            }

            const particleCount = 50 * (timeLeft / duration);
            confetti({
                particleCount,
                spread: 360,
                startVelocity: 30,
                origin: {x: Math.random(), y: Math.random() - 0.2}
            });
        }, 350);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        if (answerCountdownInterval) {
            clearInterval(answerCountdownInterval);
            answerCountdownInterval = null;
        }
    }

    function saveGameState() {
        if (isTestMode) return;
        const state = {
            teams: teams,
            gameData: gameData,
            currentRoundIndex: currentRoundIndex,
            currentTurnTeamIdx: currentTurnTeamIdx,
            gameStats: gameStats
        };
        localStorage.setItem('quiz_save_state', JSON.stringify(state));
    }

    function clearGameState() {
        localStorage.removeItem('quiz_save_state');
    }

    function checkSavedGame() {
        const saved = localStorage.getItem('quiz_save_state');
        if (saved) {
            showSystemModal(
                "💾 НАЙДЕНА СОХРАНЕННАЯ ИГРА",
                "Обнаружена незаконченная игра. Желаете продолжить или начать новую?",
                [
                    {text: "▶️ Продолжить игру", class: "btn-success", action: () => loadGameState()},
                    {
                        text: "🔄 Начать заново", class: "btn-danger", action: () => {
                            clearGameState();
                            closeSystemModal();
                            showTeamSetup();
                        }
                    }
                ]
            );
        } else {
            showTeamSetup();
        }
    }

    function loadGameState() {
        try {
            const state = JSON.parse(localStorage.getItem('quiz_save_state'));
            teams = state.teams;
            gameData = normalizeGameData(state.gameData);
            currentRoundIndex = state.currentRoundIndex;
            currentTurnTeamIdx = state.currentTurnTeamIdx || 0;
            gameStats = state.gameStats || {};

            closeSystemModal();

            const mainAppBox = document.getElementById('main-app-box');
            if (mainAppBox) mainAppBox.style.display = 'none';

            const headerBlock = document.getElementById('game-header-block');
            if (headerBlock) headerBlock.style.display = 'flex';

            const skipBtn = document.getElementById('btn-skip-round');
            if (skipBtn) skipBtn.style.display = (currentRoundIndex < gameData.length - 1) ? 'inline-block' : 'none';

            const panel = document.getElementById('main-teams-panel'),
                title = document.getElementById('teams-block-title');
            if (panel) {
                panel.style.display = 'flex';
                panel.innerHTML = '';
            }
            if (title) title.style.display = 'block';

            updateTurnDisplay();
            updateTeamsPanel();
            initBoard();
        } catch (e) {
            console.error("Ошибка загрузки сохранения:", e);
            clearGameState();
            showTeamSetup();
        }
    }

    function resetGameStats() {
        gameStats = {};
        teams.forEach((t, idx) => {
            gameStats[idx] = {correct: 0, wrong: 0, passes: 0, cats: 0, auctions: 0};
        });
    }

    let configAllowCat = localStorage.getItem('cfg_allow_cat') !== 'false';
    let configAllowAuction = localStorage.getItem('cfg_allow_auction') !== 'false';
    let configAllowAuctionLeader = localStorage.getItem('cfg_allow_auction_leader') !== 'false';

    document.getElementById('setting-type-cat').checked = configAllowCat;
    document.getElementById('setting-type-auction').checked = configAllowAuction;
    document.getElementById('setting-type-auction-leader').checked = configAllowAuctionLeader;
    document.getElementById('json-editor').value = JSON.stringify(gameData, null, 4);
    document.getElementById('setting-reading-time').value = configReadingTime;
    document.getElementById('setting-thinking-time').value = configThinkingTime;
    document.getElementById('setting-answer-time').value = configAnswerTime;

    function resolveMediaPath(url) {
        if (!url || typeof url !== 'string') return url;
        const trimmed = url.trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
            return trimmed;
        }
        if (trimmed.startsWith('assets/')) {
            return trimmed;
        }
        if (/^(music|video|q_img|a_img)\//.test(trimmed)) {
            return 'assets/' + trimmed;
        }
        return trimmed;
    }

    function stopQuestionAudio() {
        const audioElement = document.getElementById('modal-question-audio');
        if (audioElement) {
            audioElement.pause();
            audioElement.currentTime = 0;
            audioElement.src = "";
        }

        ['modal-question-video', 'modal-answer-video'].forEach(id => {
            const videoElement = document.getElementById(id);
            if (videoElement) {
                videoElement.pause();
                videoElement.currentTime = 0;
                videoElement.src = "";
                videoElement.style.display = 'none';
                videoElement.onended = null;
            }
        });

        [['modal-question-iframe', 'modal-question-iframe-container'], ['modal-answer-iframe', 'modal-answer-iframe-container']].forEach(([fId, cId]) => {
            const iframeElem = document.getElementById(fId);
            const iframeContainer = document.getElementById(cId);
            if (iframeElem && iframeContainer) {
                iframeElem.src = "";
                iframeContainer.style.display = 'none';
            }
        });
    }

    function handleQuestionVideo(question, isAnswer = false) {
        const prefix = isAnswer ? 'modal-answer' : 'modal-question';
        const videoElem = document.getElementById(`${prefix}-video`);
        const iframeElem = document.getElementById(`${prefix}-iframe`);
        const iframeContainer = document.getElementById(`${prefix}-iframe-container`);

        if (!videoElem || !iframeElem || !iframeContainer) return false;

        videoElem.style.display = 'none';
        videoElem.src = '';
        videoElem.onended = null;
        iframeContainer.style.display = 'none';
        iframeElem.src = '';

        const videoUrl = isAnswer ? question.answer_video : question.video;

        if (videoUrl && typeof videoUrl === 'string' && videoUrl.trim().length > 0) {
            const url = videoUrl.trim();

            if (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('rutube.ru')) {
                let embedUrl = url;
                if (url.includes('watch?v=')) {
                    embedUrl = url.replace('watch?v=', 'embed/');
                } else if (url.includes('youtu.be/')) {
                    embedUrl = url.replace('youtu.be/', 'youtube.com/embed/');
                }
                iframeElem.src = embedUrl;
                iframeContainer.style.display = 'block';
                return true;
            } else {
                videoElem.src = resolveMediaPath(url);
                videoElem.style.display = 'block';
                videoElem.play().catch(e => {
                });

                if (!isAnswer) {
                    videoElem.onended = () => {
                        startTimerAfterVideo();
                    };
                }
                return true;
            }
        }
        return false;
    }

    function startTimerAfterVideo() {
        const timerElem = document.getElementById('timer');
        const hintElem = document.getElementById('timer-hint');
        const btnArea = document.getElementById('modal-buttons-area');

        stopTimer();
        isReadingTime = false;
        isAnswerTimerActive = false;
        timeLeft = configThinkingTime;

        if (timerElem && hintElem) {
            timerElem.style.display = 'flex';
            timerElem.textContent = timeLeft;
            timerElem.className = "timer thinking";
            hintElem.style.display = 'block';
            hintElem.textContent = "🔥 Время пошло! Обсуждение";
            hintElem.style.color = "#ff7675";
            playStartThinkingSound();
        }

        if (btnArea) {
            btnArea.innerHTML = '<button class="btn btn-check" id="btn-show-answer" onclick="showAnswer()">Проверить ответ</button>';
        }

        startTimer();
    }

    function hideGameLayout() {
        ['game-board', 'game-header-block', 'main-teams-panel', 'teams-block-title'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }

    function showSubScreen(screenId) {
        stopFireworks();
        ['sub-menu-main', 'sub-menu-prepare-choice', 'sub-menu-packs-catalog', 'sub-menu-editor', 'sub-menu-settings', 'sub-menu-dev', 'team-setup-container', 'sub-menu-first-turn'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        // Ensure in-game teams display and title are completely hidden when navigating any menu sub-screen
        const teamsWrapper = document.getElementById('teams-block-wrapper');
        if (teamsWrapper) teamsWrapper.style.display = 'none';
        const teamsPanel = document.getElementById('main-teams-panel');
        if (teamsPanel) teamsPanel.style.display = 'none';
        const teamsTitle = document.getElementById('teams-block-title');
        if (teamsTitle) teamsTitle.style.display = 'none';

        const mainBox = document.getElementById('main-app-box');
        if (mainBox) {
            mainBox.style.display = 'flex';
            mainBox.style.maxWidth = (screenId === 'sub-menu-editor' || screenId === 'sub-menu-packs-catalog' || screenId === 'sub-menu-prepare-choice') ? '1520px' : '1050px';
        }
        const target = document.getElementById(screenId);
        if (target) target.style.display = 'block';
    }

    window.setGameData = function (newGameData) {
        window.getGameData = function () {
            return gameData;
        };
        const normalized = normalizeGameData(newGameData);
        if (normalized && normalized.length > 0) {
            gameData = JSON.parse(JSON.stringify(normalized));
            window.gameData = gameData;
            try {
                localStorage.setItem('jeopardy_pack', JSON.stringify(gameData));
            } catch (e) {}
            const editor = document.getElementById('json-editor');
            if (editor) editor.value = JSON.stringify(gameData, null, 4);
        }
    };

    function backToMainMenu() {
        showSubScreen('sub-menu-main');
    }

    function openDevMenu() {
        if (!teams || teams.length === 0) {
            teams = [{name: "Альфа-Тест", score: 0}, {name: "Омега-Сквад", score: 0}];
        }
        showSubScreen('sub-menu-dev');
    }

    function showJeopardyRules() {
        const rulesHtml = `
            <div class="rules-content-box">
                <div class="rules-card-item">
                    <div class="rules-section-title">🎯 Основная цель и ход игры</div>
                    Команды по очереди выбирают тему и стоимость вопроса на игровом поле. Чем выше номинал — тем сложнее вопрос. Побеждает команда, набравшая наибольшее количество баллов по итогам всех раундов и финала.
                </div>

                <div class="rules-card-item">
                    <div class="rules-section-title">🔄 Очередность хода и выбор вопроса</div>
                    • В верхней панели всегда отображается текущая команда: <b>👉 Выбирает вопрос</b>.<br>
                    • После ответа на вопрос ход автоматически переходит следующей по списку команде.<br>
                    • Ведущий может в любой момент нажать <b>🔄 Передать ход</b>, чтобы передать право выбора любой другой команде вручную.
                </div>

                <div class="rules-card-item">
                    <div class="rules-section-title">⏱️ Фазы таймеров и управление</div>
                    • <b>Фаза чтения (бирюзовый круг)</b>: время для диктора или команд на ознакомление с вопросом.<br>
                    • <b>Фаза обсуждения (красный круг)</b>: основное время для размышления над ответом.<br>
                    • <b>Фаза ответа (янтарный круг)</b>: включается ведущим при нажатии клавиши <b>Пробел</b> (или кнопки ответа), когда команда готова отвечать. Повторный <b>Пробел</b> ставит таймер на паузу или возобновляет его.<br>
                    • В <b>Настройках</b> можно индивидуально настроить длительность чтения, обсуждения и ответа, а также включить или отключить звуковые сигналы.
                </div>

                <div class="rules-card-item">
                    <div class="rules-section-title">🎲 Специальные типы вопросов</div>
                    <ul class="rules-list">
                        <li>🐱 <b>Кот в мешке</b> — вопрос нельзя отвечать выбравшей команде! Его обязательно нужно отдать соперникам. До выбора принимающей команды таймер находится на паузе.</li>
                        <li>💰 <b>Аукцион (Все)</b> — открытые торги: команды делают ставки от номинала вопроса до своего баланса очков (или ва-банк).</li>
                        <li>🔨 <b>Аукцион (Лидер)</b> — право ответа разыгрывается по высшей ставке: отвечает только та команда, чья ставка оказалась максимальной.</li>
                    </ul>
                </div>

                <div class="rules-card-item">
                    <div class="rules-section-title">🏆 Раунды, Финал и Подведение итогов</div>
                    • <b>Многораундовые паки</b>: игра может состоять из 1, 2 или 3 основных раундов с возрастающей стоимостью вопросов.<br>
                    • <b>Финальный раунд</b>: команды выбирают ставки втайне, после чего отвечают на решающий вопрос тура.<br>
                    • <b>⚡ Очки всем</b>: быстрая кнопка в шапке игры для начисления или списания баллов всем командам одновременно (например, за общий конкурс).<br>
                    • <b>Подиум победителей</b>: по окончании игры открывается интерактивный экран награждения с золотым сундуком, фейерверком и итоговой таблицей статистики правильных и неверных ответов.
                </div>

                <div class="rules-card-item">
                    <div class="rules-section-title">📚 Каталог паков и собственный редактор</div>
                    • В каталоге доступно более <b>200+ готовых паков</b> по 12 тематическим категориям с фильтрацией по сложности и числу раундов.<br>
                    • Вы можете создавать свои паки во встроенном <b>Редакторе вопросов</b>, экспортировать их в .json или загружать свои файлы.
                </div>
            </div>
        `;
        showSystemModal("📖 ПРАВИЛА ВИКТОРИНЫ", rulesHtml);
    }

    function testLaunchQuestion(type) {
        isTestMode = true;
        currentRoundIndex = 0;
        currentThemeIdx = 0;
        currentQuestionIdx = 0;
        currentCost = 300;
        activeTeamIdxForQuestion = null;
        auctionBets = {};

        let normalizedType = type;
        if (type === 'secret') normalizedType = 'cat';
        if (type === 'auction_all') normalizedType = 'auction';

        if (!teams || teams.length < 2) {
            teams = [
                {name: "Команда 1 (Лидер)", score: 500},
                {name: "Команда 2", score: 200}
            ];
            currentTurnTeamIdx = 0;
        }

        if (Object.keys(gameStats).length === 0) resetGameStats();

        const testQuestion = {
            q: `[ТЕСТ] Это тестовый вопрос типа: "${normalizedType.toUpperCase()}". Проверьте работу кнопок, анимаций и таймеров!`,
            a: "Это правильный тестовый ответ",
            cost: 300,
            type: normalizedType,
            used: false
        };

        openQuestion(0, 0, document.createElement('div'), null, false, testQuestion);
    }

    function testMediaQuestion(mediaType) {
        isTestMode = true;
        currentRoundIndex = 0;
        currentThemeIdx = 0;
        currentQuestionIdx = 0;
        currentCost = 500;
        activeTeamIdxForQuestion = null;
        auctionBets = {};
        if (Object.keys(gameStats).length === 0) resetGameStats();

        let qData = {
            q: `[ТЕСТ МЕДИА] Формат: ${mediaType.toUpperCase()}. Убедитесь, что контент корректно масштабируется!`,
            a: "Ответ на медиа-вопрос",
            cost: 500,
            type: 'normal',
            used: false
        };

        if (mediaType === 'image') {
            qData.img = "data:image/svg+xml;charset=UTF-8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='400' style='background:%234c3799; border-radius:20px;'><text x='50%' y='50%' fill='%23fdd835' font-size='40' font-weight='bold' font-family='sans-serif' text-anchor='middle' dominant-baseline='middle'>ОФФЛАЙН КАРТИНКА</text></svg>";
        }
        if (mediaType === 'video') {
            qData.video = "assets/video/mov_bbb.mp4";
            qData.q += " (Убедитесь, что файл test_video.mp4 лежит в одной папке с игрой)";
        }
        if (mediaType === 'audio') {
            qData.audio = "assets/music/viper.mp3";
            qData.q += " (Убедитесь, что файл test_audio.mp3 лежит в одной папке с игрой)";
        }

        const originalThemeQuestions = (gameData[0]?.themes?.[0]) ? gameData[0].themes[0].questions : null;
        if (gameData[0]?.themes?.[0]) gameData[0].themes[0].questions = [qData];

        openQuestion(0, 0, document.createElement('div'), null);
        if (originalThemeQuestions && gameData[0]?.themes?.[0]) {
            gameData[0].themes[0].questions = originalThemeQuestions;
        }
    }

    function testWinnerScreenMock() {
        let maxScore = Math.floor(Math.random() * 3000) + 1000;
        let winnerDesc = `<div style="font-size:26px; font-weight:800; color:#ffffff; margin: 20px 0;">
            Победила команда: <b style="color:var(--gold-accent); font-size:36px;">"Альфа-Тест"</b><br><br>
            С результатом: <b style="color:var(--gold-accent); font-size:36px;">${maxScore}</b> очков! 🎆
        </div>`;

        triggerFireworksAnimation();
        showSystemModal(
            "🏆 ПОБЕДИТЕЛЬ ВИКТОРИНЫ! 🏆",
            winnerDesc,
            [
                {
                    text: "🔙 Вернуться в тесты",
                    class: "btn-check",
                    action: () => {
                        stopFireworks();
                        closeSystemModal();
                        showSubScreen('sub-menu-dev');
                    }
                }
            ]
        );
    }

    function testCssOverflow() {
        const testHtml = `
            <div style="margin-bottom: 20px; font-size: 18px; color: var(--lavender-light);">
                Проверка обрезки текста многоточием. Карточки должны сохранять ровный размер (220px).
            </div>

            <div style="display: flex; gap: 18px; flex-wrap: wrap; justify-content: center; width: 100%; padding-bottom: 25px;">
                <div class="team-card active-turn" style="width: 220px;">
                    <div class="team-title">СУПЕР ДЛИННОЕ НАЗВАНИЕ КОМАНДЫ КОТОРОЕ ЛОМАЕТ ДИЗАЙН ПРИ ВЫВОДЕ</div>
                    <div class="team-points-clickable" style="max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-sizing: border-box;">
                        999999999999
                    </div>
                </div>

                <div class="team-card" style="width: 220px;">
                    <div class="team-title">Микро</div>
                    <div class="team-points-clickable" style="max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-sizing: border-box;">
                        -9999999
                    </div>
                </div>
            </div>

            <div style="font-size: 18px; font-weight: bold; color: var(--gold-accent); margin-bottom: 10px;">
                В модальном списке (строки):
            </div>

            <div class="modal-team-row" style="cursor: default;">
                <div class="modal-team-info-group">
                    <span class="modal-team-title">ЕЩЕ ОДНО ОЧЕНЬ ДЛИННОЕ НАЗВАНИЕ ДЛЯ ПРОВЕРКИ СТРОКИ</span>
                    <span class="modal-badge-score">Очки: 999999999</span>
                </div>
            </div>
        `;

        showSystemModal(
            "💥 ТЕСТ ВЁРСТКИ",
            testHtml,
            [{
                text: "🔙 Вернуться в меню", class: "btn-close-modal", action: () => {
                    closeSystemModal();
                    showSubScreen('sub-menu-dev');
                }
            }]
        );
    }

    function testHardReset() {
        clearGameState();
        showSystemModal(
            "🗑️ СОХРАНЕНИЕ ОЧИЩЕНО",
            "Локальные данные игры удалены. При нажатии кнопки 'Играть' игра начнется с нуля.",
            [{
                text: "🔙 Назад", class: "btn-close-modal", action: () => {
                    closeSystemModal();
                    showSubScreen('sub-menu-dev');
                }
            }]
        );
    }

    function testInitQuickGame() {
        isTestMode = false;
        teams = [{name: "Команда Альфа", score: 500}, {name: "Команда Бета", score: 300}];
        finalizeGameStartWithFirstTurn(0);
    }

    function saveSettings() {
        const rTime = parseInt(document.getElementById('setting-reading-time').value, 10);
        const tTime = parseInt(document.getElementById('setting-thinking-time').value, 10);
        const aTime = parseInt(document.getElementById('setting-answer-time').value, 10);

        if (isNaN(rTime) || isNaN(tTime) || isNaN(aTime) || rTime < 0 || tTime < 1 || aTime < 1) {
            showSystemModal("❌ Ошибка!", "Введите корректные числа времени!");
            return;
        }

        configReadingTime = rTime;
        configThinkingTime = tTime;
        configAnswerTime = aTime;
        localStorage.setItem('cfg_reading_time', rTime);
        localStorage.setItem('cfg_thinking_time', tTime);
        localStorage.setItem('cfg_answer_time', aTime);

        configAllowCat = document.getElementById('setting-type-cat').checked;
        configAllowAuction = document.getElementById('setting-type-auction').checked;
        configAllowAuctionLeader = document.getElementById('setting-type-auction-leader').checked;

        localStorage.setItem('cfg_allow_cat', configAllowCat);
        localStorage.setItem('cfg_allow_auction', configAllowAuction);
        localStorage.setItem('cfg_allow_auction_leader', configAllowAuctionLeader);

        showSystemModal("🏁 Готовы к игре!", "Настройки успешно сохранены!");
    }

    function showTeamSetup() {
        clearTeamInputs();
        showSubScreen('team-setup-container');
    }

    function addInputRow() {
        const container = document.getElementById('team-inputs');
        if (container.children.length >= 15) {
            showSystemModal("⚠️ Максимум 15 команд!", "Достигнут лимит команд.");
            return;
        }
        const row = document.createElement('div');
        row.className = 'team-input-row';
        row.innerHTML = `<input type="text" class="team-input" value="Команда ${container.children.length + 1}" placeholder="Название команды ${container.children.length + 1}">
            <button class="btn-remove-team" onclick="removeInputRow(this)" title="Удалить команду">❌</button>`;
        container.appendChild(row);
    }

    function removeInputRow(btn) {
        const container = document.getElementById('team-inputs');
        if (container.children.length <= 2) {
            showSystemModal("⚠️ Ограничение", "Минимум 2 команды!");
            return;
        }
        btn.parentElement.remove();
    }

    function resetQuestionsProgress() {
        const totalRounds = gameData.length;

        gameData.forEach((round, roundIdx) => {
            if (!round.themes) return;
            let allRoundQuestions = [];
            let hasPredefinedSpecialTypes = false;

            round.themes.forEach(theme => {
                if (theme.questions) {
                    theme.questions.forEach(q => {
                        q.used = false;
                        if (['cat', 'auction', 'auction_leader'].includes(q.type)) {
                            hasPredefinedSpecialTypes = true;
                        } else {
                            q.type = 'normal';
                        }
                        allRoundQuestions.push(q);
                    });
                }
            });

            const isFinalRound = (roundIdx === totalRounds - 1) ||
                (round.roundName && (round.roundName.toLowerCase().includes('финал') || round.roundName.toLowerCase().includes('final')));

            // Если в паке уже были вручную расставлены типы вопросов, не перезаписываем их
            if (hasPredefinedSpecialTypes) {
                if (isFinalRound) {
                    allRoundQuestions.forEach(q => {
                        if (q.type === 'cat' || q.type === 'auction_leader') q.type = 'normal';
                    });
                }
                return;
            }

            const totalQs = allRoundQuestions.length;
            if (totalQs > 4) {
                for (let i = allRoundQuestions.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [allRoundQuestions[i], allRoundQuestions[j]] = [allRoundQuestions[j], allRoundQuestions[i]];
                }
                let pointer = 0;

                // Кот в мешке: во всех раундах, кроме финала
                if (configAllowCat && !isFinalRound) {
                    let count = Math.max(1, Math.round(totalQs * 0.06));
                    for (let i = 0; i < count; i++) {
                        if (allRoundQuestions[pointer]) {
                            allRoundQuestions[pointer].type = 'cat';
                            pointer++;
                        }
                    }
                }

                // Вопрос со ставкой (для всех): разрешен во всех раундах
                if (configAllowAuction) {
                    let count = Math.max(1, Math.round(totalQs * 0.06));
                    for (let i = 0; i < count; i++) {
                        if (allRoundQuestions[pointer]) {
                            allRoundQuestions[pointer].type = 'auction';
                            pointer++;
                        }
                    }
                }

                // Аукцион за право ответа (ставка на лидера): во всех раундах, кроме финала
                if (configAllowAuctionLeader && !isFinalRound) {
                    let count = Math.max(1, Math.round(totalQs * 0.06));
                    for (let i = 0; i < count; i++) {
                        if (allRoundQuestions[pointer]) {
                            allRoundQuestions[pointer].type = 'auction_leader';
                            pointer++;
                        }
                    }
                }
            }
        });
        localStorage.setItem('jeopardy_pack', JSON.stringify(gameData));
    }

    function saveTeamsFromSetup() {
        const inputs = document.querySelectorAll('#team-inputs .team-input');
        let tempTeams = [];
        let hasEmptyFields = false;
        let hasDuplicates = false;
        let seenNames = [];

        inputs.forEach((input) => {
            const name = input.value.trim();
            if (name === "") {
                hasEmptyFields = true;
                input.style.borderColor = "var(--error-red)";
            } else {
                input.style.borderColor = "var(--purple-medium)";
                tempTeams.push({name: name, score: 0, element: input});
            }
        });

        if (hasEmptyFields) {
            showSystemModal("❌ ОШИБКА ЗАПУСКА", "Названия всех команд должны быть обязательно заполнены.");
            return;
        }

        tempTeams.forEach(team => {
            const lowerName = team.name.toLowerCase();
            if (seenNames.includes(lowerName)) {
                hasDuplicates = true;
                team.element.style.borderColor = "var(--error-red)";
                tempTeams.forEach(t => {
                    if (t.name.toLowerCase() === lowerName) t.element.style.borderColor = "var(--error-red)";
                });
            } else seenNames.push(lowerName);
        });

        if (hasDuplicates) {
            showSystemModal("⚠️ ПОВТОРЕНИЕ ИМЕН", "Названия команд не должны дублироваться.");
            return;
        }

        teams = tempTeams.map(t => ({name: t.name, score: 0}));

        // Render first turn selection screen
        const firstTurnContainer = document.getElementById('first-turn-teams-list');
        if (firstTurnContainer) {
            firstTurnContainer.innerHTML = '';

            const randomBtn = document.createElement('button');
            randomBtn.className = 'btn btn-check';
            randomBtn.style.background = 'linear-gradient(135deg, #a26bff, #6c5ce7)';
            randomBtn.style.color = '#ffffff';
            randomBtn.innerHTML = '🎲 Случайный выбор';
            randomBtn.onclick = () => {
                const randomIdx = Math.floor(Math.random() * teams.length);
                finalizeGameStartWithFirstTurn(randomIdx);
            };
            firstTurnContainer.appendChild(randomBtn);

            teams.forEach((team, idx) => {
                const btn = document.createElement('button');
                btn.className = 'btn btn-check';
                btn.textContent = '👉 Первыми ходят: "' + team.name + '"';
                btn.onclick = () => finalizeGameStartWithFirstTurn(idx);
                firstTurnContainer.appendChild(btn);
            });
        }

        showSubScreen('sub-menu-first-turn');
    }

    function finalizeGameStartWithFirstTurn(chosenTeamIdx) {
        stopFireworks();
        currentTurnTeamIdx = chosenTeamIdx;
        currentRoundIndex = 0;
        resetQuestionsProgress();
        resetGameStats();

        const mainAppBox = document.getElementById('main-app-box');
        if (mainAppBox) mainAppBox.style.display = 'none';

        const headerBlock = document.getElementById('game-header-block');
        if (headerBlock) headerBlock.style.display = 'flex';

        const skipBtn = document.getElementById('btn-skip-round');
        if (skipBtn) skipBtn.style.display = (currentRoundIndex < gameData.length - 1) ? 'inline-block' : 'none';

        const teamsWrapper = document.getElementById('teams-block-wrapper');
        if (teamsWrapper) teamsWrapper.style.display = 'block';
        const panel = document.getElementById('main-teams-panel'), title = document.getElementById('teams-block-title');
        if (panel) {
            panel.style.display = 'flex';
            panel.innerHTML = '';
        }
        if (title) title.style.display = 'block';

        updateTurnDisplay();
        updateTeamsPanel();
        initBoard();
        saveGameState();
    }

    function quitToMainMenuDirectly() {
        showSystemModal("🏠 ВЫХОД В МЕНЮ", "Вы уверены, что хотите выйти? Прогресс будет сохранен.",
            [{text: "Да, выйти", class: "btn-danger", action: () => executeQuitToMainMenu()}, {
                text: "Отмена",
                class: "btn-check",
                action: () => closeSystemModal()
            }]);
    }

    function executeQuitToMainMenu() {
        closeSystemModal();
        stopQuestionAudio();
        stopFireworks();
        hideGameLayout();
        clearTeamInputs();
        const mainBox = document.getElementById('main-app-box');
        if (mainBox) mainBox.style.display = 'flex';
        showSubScreen('sub-menu-main');
    }

    function applyCustomQuestions() {
        try {
            const parsed = JSON.parse(document.getElementById('json-editor').value);
            gameData = normalizeGameData(parsed);
            localStorage.setItem('jeopardy_pack', JSON.stringify(gameData));
            currentRoundIndex = 0;
            teams = [{name: "Команда 1", score: 0}, {name: "Команда 2", score: 0}];
            clearTeamInputs();
            showSubScreen('team-setup-container');
            showSystemModal("📥 ПАКЕТ ЗАГРУЖЕН", "Новый пакет вопросов успешно импортирован!");
        } catch (e) {
            showSystemModal("❌ ОШИБКА JSON КОДА", "Не удалось прочитать пакет: " + e.message);
        }
    }

    let lastLeaderNamesStr = null;

    function updateTeamsPanel() {
        const panel = document.getElementById('main-teams-panel');
        if (!panel) return;

        const maxScore = teams.length > 0 ? Math.max(...teams.map(t => t.score)) : 0;
        const hasLeader = maxScore > 0;
        const currentLeaders = hasLeader ? teams.filter(t => t.score === maxScore).map(t => t.name) : [];
        const currentLeadersStr = currentLeaders.slice().sort().join('|');

        const leaderChanged = (lastLeaderNamesStr !== null && currentLeadersStr !== '' && currentLeadersStr !== lastLeaderNamesStr);
        lastLeaderNamesStr = currentLeadersStr;

        panel.innerHTML = '';

        teams.forEach((team, originalIdx) => {
            const card = document.createElement('div');
            card.className = 'team-card';
            card.setAttribute('data-team-id', 'team-' + originalIdx);

            const isLeader = hasLeader && team.score === maxScore;
            const isActiveTurn = (originalIdx === currentTurnTeamIdx);

            if (isActiveTurn) card.classList.add('active-turn');
            if (isLeader) card.classList.add('is-leader');
            if (isLeader && leaderChanged) {
                card.classList.add('leader-flash');
            }

            const crownHtml = isLeader ? '<div class="leader-crown-badge" title="Лидер игры! 👑">👑</div>' : '';
            card.innerHTML = `${crownHtml}<div class="team-title">⭐ ${team.name}</div><div class="team-points-clickable" onclick="promptScoreDirectly(${originalIdx})" title="Нажмите, чтобы изменить счёт">${team.score}</div>`;

            panel.appendChild(card);
        });
    }

    function promptScoreDirectly(teamIdx) {
        const currentTeam = teams[teamIdx];
        showSystemModal(
            "✏️ ИЗМЕНЕНИЕ ОЧКОВ КОМАНДЕ",
            `Команда: <b style="color:var(--gold-accent)">"${currentTeam.name}"</b> (Текущий счёт: ${currentTeam.score})
             <input type="number" id="direct-score-input" class="modal-score-input-large" placeholder="Количество очков..." oninput="updateDirectScoreButtonsText()">`,
            [
                {text: "Прибавить (+0)", class: "btn-success", action: () => applyScoreChange(teamIdx, 1)},
                {text: "Вычесть (-0)", class: "btn-danger", action: () => applyScoreChange(teamIdx, -1)},
                {text: "Отмена", class: "btn-close-modal", action: () => closeSystemModal()}
            ]
        );
    }

    function updateDirectScoreButtonsText() {
        const inputElem = document.getElementById('direct-score-input'),
            btnArea = document.getElementById('modal-buttons-area');
        if (!inputElem || !btnArea) return;
        const parsedVal = parseInt(inputElem.value.trim(), 10),
            displayVal = (!isNaN(parsedVal) && parsedVal > 0) ? parsedVal : 0;
        const btns = btnArea.querySelectorAll('button');
        if (btns.length >= 2) {
            btns[0].textContent = `Прибавить (+${displayVal})`;
            btns[1].textContent = `Вычесть (-${displayVal})`;
        }
    }

    function applyScoreChange(teamIdx, multiplier) {
        const inputElem = document.getElementById('direct-score-input');
        if (!inputElem) return;
        const val = parseInt(inputElem.value, 10);
        if (isNaN(val) || val <= 0) {
            inputElem.style.borderColor = "var(--error-red)";
            return;
        }
        const delta = val * multiplier;
        teams[teamIdx].score += delta;
        updateTeamsPanel();
        saveGameState();
        showSystemModal("✅ ОЧКИ ОБНОВЛЕНЫ", `Команде "${teams[teamIdx].name}" успешно ${delta > 0 ? 'начислено' : 'списано'}: <b>${Math.abs(delta)}</b> очков!`);
    }

    function promptScoreForAll() {
        if (!teams || teams.length === 0) {
            showSystemModal("⚠️ Нет команд", "Сначала создайте или запустите игру!");
            return;
        }
        showSystemModal(
            "⚡ ИЗМЕНЕНИЕ ОЧКОВ ВСЕМ КОМАНДАМ",
            `Укажите количество очков для ВСЕХ команд:
             <input type="number" id="all-teams-score-input" class="modal-score-input-large" placeholder="Количество очков..." oninput="updateScoreForAllButtonsText()">`,
            [
                {text: "Прибавить всем (+0)", class: "btn-success", action: () => applyScoreChangeForAll(1)},
                {text: "Вычесть у всех (-0)", class: "btn-danger", action: () => applyScoreChangeForAll(-1)},
                {text: "Отмена", class: "btn-close-modal", action: () => closeSystemModal()}
            ]
        );
    }

    function updateScoreForAllButtonsText() {
        const inputElem = document.getElementById('all-teams-score-input'),
            btnArea = document.getElementById('modal-buttons-area');
        if (!inputElem || !btnArea) return;
        const parsedVal = parseInt(inputElem.value.trim(), 10),
            displayVal = (!isNaN(parsedVal) && parsedVal > 0) ? parsedVal : 0;
        const btns = btnArea.querySelectorAll('button');
        if (btns.length >= 2) {
            btns[0].textContent = `Прибавить всем (+${displayVal})`;
            btns[1].textContent = `Вычесть у всех (-${displayVal})`;
        }
    }

    function applyScoreChangeForAll(multiplier) {
        const inputElem = document.getElementById('all-teams-score-input');
        if (!inputElem) return;
        const val = parseInt(inputElem.value, 10);
        if (isNaN(val) || val <= 0) {
            inputElem.style.borderColor = "var(--error-red)";
            return;
        }
        const delta = val * multiplier;
        teams.forEach(t => t.score += delta);
        updateTeamsPanel();
        saveGameState();
        showSystemModal("✅ ОЧКИ ОБНОВЛЕНЫ", `Всем командам успешно ${delta > 0 ? 'начислено' : 'списано'}: <b>${Math.abs(delta)}</b> очков!`);
    }

    function initBoard() {
        const board = document.getElementById('game-board'), mainBox = document.getElementById('main-app-box');
        if (mainBox && mainBox.style.display !== 'none') {
            hideGameLayout();
            return;
        }
        if (board) {
            board.style.display = 'flex';
            board.style.flexDirection = '';
            board.style.alignItems = '';
            board.innerHTML = '';
        }

        const round = gameData[currentRoundIndex], skipBtn = document.getElementById('btn-skip-round');
        if (!round) {
            hideGameLayout();
            showWinnerCelebration();
            return;
        }

        if (skipBtn) skipBtn.style.display = (currentRoundIndex < gameData.length - 1) ? 'inline-block' : 'none';
        document.getElementById('round-title').textContent = round.roundName;
        updateTurnDisplay();
        updateTeamsPanel();

        const isFinalRound = (currentRoundIndex === gameData.length - 1) ||
            (round.roundName && (round.roundName.toLowerCase().includes('финал') || round.roundName.toLowerCase().includes('final')));
        if (isFinalRound) {
            round.themes.forEach(theme => {
                if (theme.questions) {
                    theme.questions.forEach(q => {
                        if (q.type === 'cat' || q.type === 'auction_leader') {
                            q.type = 'normal';
                        }
                    });
                }
            });
        }

        round.themes.forEach((theme, themeIdx) => {
            const row = document.createElement('div');
            row.classList.add('theme-row');
            row.id = `theme-row-${themeIdx}`;

            const themeNameDiv = document.createElement('div');
            themeNameDiv.classList.add('theme-name');
            themeNameDiv.id = `theme-title-${themeIdx}`;
            themeNameDiv.textContent = theme.name;

            const isAllQuestionsUsed = theme.questions && theme.questions.every(q => q.used);
            if (isAllQuestionsUsed) {
                themeNameDiv.classList.add('used');
            }

            row.appendChild(themeNameDiv);

            theme.questions.forEach((q, qIdx) => {
                const qDiv = document.createElement('div');
                qDiv.classList.add('question-cost');
                qDiv.textContent = q.cost;
                if (q.used) qDiv.classList.add('used');
                else qDiv.onclick = (event) => openQuestion(themeIdx, qIdx, qDiv, event);
                row.appendChild(qDiv);
            });
            if (board) board.appendChild(row);
        });
    }

    function openQuestion(themeIdx, qIdx, element, event, skipSplash = false, overrideQuestion = null) {
        stopTimer();
        stopQuestionAudio();
        currentThemeIdx = themeIdx;
        currentQuestionIdx = qIdx;
        activeCellOnBoard = element;
        const question = overrideQuestion || (gameData[currentRoundIndex]?.themes?.[themeIdx]?.questions?.[qIdx]);
        if (!question) return;
        currentActiveQuestion = question;

        const isFinalRound = !isTestMode && ((currentRoundIndex === gameData.length - 1) ||
            (gameData[currentRoundIndex]?.roundName && (gameData[currentRoundIndex].roundName.toLowerCase().includes('финал') || gameData[currentRoundIndex].roundName.toLowerCase().includes('final'))));
        if (isFinalRound && (question.type === 'cat' || question.type === 'auction_leader')) {
            question.type = 'normal';
        }

        if (question.type === 'cat' && !skipSplash) {
            showCatInBagSplash(() => {
                openQuestion(themeIdx, qIdx, element, event, true, overrideQuestion);
            });
            return;
        }

        if ((question.type === 'auction' || question.type === 'auction_leader') && !skipSplash) {
            showAuctionSplash(question.type, () => {
                openQuestion(themeIdx, qIdx, element, event, true, overrideQuestion);
            });
            return;
        }

        currentCost = question.cost;
        activeTeamIdxForQuestion = null;
        auctionBets = {};
        isAnswerTimerActive = false;

        const timerElem = document.getElementById('timer'), hintElem = document.getElementById('timer-hint');
        if (timerElem) timerElem.style.display = 'flex';
        if (hintElem) hintElem.style.display = 'block';

        const qTextElem = document.getElementById('modal-question-text'),
            imgElement = document.getElementById('modal-question-img');
        const audioElement = document.getElementById('modal-question-audio'),
            ansImgElement = document.getElementById('modal-answer-img');

        if (qTextElem) {
            if (question.q && question.q.trim().length > 0) {
                qTextElem.textContent = question.q;
                qTextElem.style.display = 'block';
            } else {
                qTextElem.textContent = '';
                qTextElem.style.display = 'none';
            }
        }

        document.getElementById('modal-answer-text').textContent = "Правильный ответ: " + question.a;
        if (ansImgElement) {
            ansImgElement.classList.remove('img-error');
            ansImgElement.src = "";
            ansImgElement.style.display = 'none';
        }

        let hasVideoInQuestion = false;

        if (['cat', 'auction', 'auction_leader'].includes(question.type)) {
            if (qTextElem) qTextElem.style.setProperty('display', 'none', 'important');
            if (imgElement) imgElement.style.setProperty('display', 'none', 'important');
            if (audioElement) {
                audioElement.src = "";
                audioElement.style.setProperty('display', 'none', 'important');
            }
        } else {
            question.used = true;
            saveGameState();
            if (element) {
                element.classList.add('used');
                element.onclick = null;
            }

            const currentTheme = gameData[currentRoundIndex].themes[themeIdx];
            if (currentTheme && currentTheme.questions.every(q => q.used)) {
                const themeTitleElem = document.getElementById(`theme-title-${themeIdx}`);
                if (themeTitleElem) themeTitleElem.classList.add('used');
            }

            if (imgElement) {
                imgElement.classList.remove('img-error');
                if (question.img && typeof question.img === 'string' && question.img.trim().length > 0) {
                    imgElement.src = resolveMediaPath(question.img.trim());
                    imgElement.style.display = 'block';
                } else {
                    imgElement.src = "";
                    imgElement.style.display = 'none';
                }
            }

            hasVideoInQuestion = handleQuestionVideo(question, false);

            if (question.audio && typeof question.audio === 'string' && question.audio.trim().length > 0) {
                if (audioElement) {
                    audioElement.style.display = 'block';
                    audioElement.src = resolveMediaPath(question.audio.trim());
                    audioElement.play().catch(e => {
                    });
                }
            } else if (audioElement) audioElement.style.display = 'none';
        }

        const oldBadge = document.getElementById('modal-special-badge');
        if (oldBadge) oldBadge.remove();
        const oldCatAnim = document.getElementById('modal-cat-animation');
        if (oldCatAnim) oldCatAnim.remove();

        if (question.type === 'cat') {
            const badge = document.createElement('div');
            badge.id = 'modal-special-badge';
            badge.className = 'special-question-badge badge-cat';
            badge.innerHTML = '🐱 КОТ В МЕШКЕ! 🐱<span>Вы обязаны выбрать команду-соперника!</span>';
            const modalCard = document.querySelector('#question-modal .modal-card');
            modalCard.prepend(badge);
        } else if (question.type === 'auction') {
            playAuctionFanfareSound();
            const badge = document.createElement('div');
            badge.id = 'modal-special-badge';
            badge.className = 'special-question-badge badge-auction';
            badge.innerHTML = '💰 ВОПРОС СО СТАВКОЙ ДЛЯ ВСЕХ! 💰<span>Номинал: <b>' + currentCost + '</b>. Задайте ставку для каждой команды:</span>';
            document.querySelector('#question-modal .modal-card').prepend(badge);
        } else if (question.type === 'auction_leader') {
            playAuctionFanfareSound();
            const badge = document.createElement('div');
            badge.id = 'modal-special-badge';
            badge.className = 'special-question-badge badge-auction-leader';
            badge.innerHTML = '🔨 АУКЦИОН ЗА ПРАВО ОТВЕТА! 🔨<span>Вопрос достанется <b>только самой высокой ставке</b>!</span>';
            document.querySelector('#question-modal .modal-card').prepend(badge);
        }

        document.getElementById('modal-answer-text').style.display = 'none';
        const listContainer = document.getElementById('teams-modal-list'),
            btnArea = document.getElementById('modal-buttons-area');

        if (listContainer) {
            listContainer.innerHTML = '';
            listContainer.style.display = 'flex';
            listContainer.style.flexDirection = 'column';
            listContainer.style.alignItems = 'center';
            listContainer.style.gap = '12px';
        }
        if (btnArea) {
            btnArea.style.flexDirection = 'row';
            btnArea.style.gap = '15px';
            btnArea.innerHTML = '';
        }

        if (['cat', 'auction', 'auction_leader'].includes(question.type)) {
            stopTimer();
            if (timerElem) {
                timerElem.style.display = 'flex';
                timerElem.textContent = "";
                timerElem.className = "timer paused";
            }
            if (hintElem) {
                hintElem.textContent = "⏳ Внимание! Выполните выбор ниже";
                hintElem.style.color = "var(--gold-accent)";
            }
        }

        if (question.type === 'cat') {
            playCatMeowSound();
            teams.forEach((team, idx) => {
                if (idx === currentTurnTeamIdx) return;
                const btn = document.createElement('button');
                btn.className = 'btn';
                btn.style.width = '100%';
                btn.style.maxWidth = '450px';
                btn.style.margin = '0';
                btn.style.background = 'var(--purple-medium)';
                btn.style.color = 'white';
                btn.textContent = `🎯 Отдать вопрос команде: "${team.name}"`;
                btn.onclick = () => selectTeamForCatInBag(idx);
                listContainer.appendChild(btn);
            });
            if (btnArea) btnArea.innerHTML = '<span style="color:var(--lavender-light); font-weight:bold; font-size:16px;">Выберите соперника выше!</span>';
        } else if (['auction', 'auction_leader'].includes(question.type)) {
            let auctionListContainer = document.createElement('div');
            auctionListContainer.style.width = '100%';
            auctionListContainer.style.display = 'flex';
            auctionListContainer.style.flexDirection = 'column';
            auctionListContainer.style.gap = '14px';

            teams.forEach((t, idx) => {
                let minBet = currentCost, maxBet = Math.max(currentCost, t.score);
                auctionBets[idx] = {val: minBet, isPassed: false};

                const card = document.createElement('div');
                card.className = 'auction-team-card';
                card.id = `auction-card-team-${idx}`;
                card.innerHTML = `
                    <div class="auction-team-header">
                        <span>⭐ ${t.name} (Очки: ${t.score})</span>
                        <span style="color: var(--gold-accent); font-size: 15px; font-weight: 800;">Диапазон: ${minBet} - ${maxBet}</span>
                    </div>
                    <div class="auction-controls-row">
                        <div class="auction-quick-btns">
                            <button class="btn-mini btn-check" type="button" onclick="setAuctionFieldValue(${idx}, ${minBet})">Мин (${minBet})</button>
                            <button class="btn-mini btn-success" type="button" onclick="setAuctionFieldValue(${idx}, ${maxBet})">Ва-банк (${maxBet})</button>
                            <button class="btn-mini btn-danger" type="button" onclick="toggleAuctionPass(${idx})">🚫 Пас</button>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="font-size: 16px; font-weight: 800; color: #fff;">Ставка:</span>
                            <input type="number" id="auction-input-${idx}" class="modal-auction-input" value="${minBet}" data-min="${minBet}" data-max="${maxBet}" oninput="handleAuctionInput(${idx})">
                        </div>
                    </div>`;
                auctionListContainer.appendChild(card);
            });
            if (listContainer) listContainer.appendChild(auctionListContainer);
            if (btnArea) btnArea.innerHTML = '<button class="btn btn-success" onclick="confirmAllAuctionBets()">💰 Подтвердить ставки и открыть вопрос</button>';
        } else {
            if (hasVideoInQuestion) {
                stopTimer();
                if (timerElem) {
                    timerElem.style.display = 'flex';
                    timerElem.textContent = "";
                    timerElem.className = "timer paused";
                }
                if (hintElem) {
                    hintElem.textContent = "🎬 Внимание на видео! Таймер запустится после просмотра";
                    hintElem.style.color = "#81ecec";
                }
                if (btnArea) btnArea.innerHTML = '<button class="btn btn-check" onclick="startTimerAfterVideo()">▶️ Пропустить видео и запустить таймер</button>';
            } else {
                isReadingTime = (configReadingTime > 0);
                timeLeft = isReadingTime ? configReadingTime : configThinkingTime;

                if (timerElem) timerElem.textContent = timeLeft;
                if (hintElem && timerElem) {
                    if (isReadingTime) {
                        timerElem.className = "timer reading";
                        hintElem.textContent = "⏱️ Внимание! Чтение вопроса";
                        hintElem.style.color = "#81ecec";
                    } else {
                        timerElem.className = "timer thinking";
                        hintElem.textContent = "🔥 Время пошло! Обсуждение";
                        hintElem.style.color = "#ff7675";
                        playStartThinkingSound();
                    }
                }
                if (btnArea) btnArea.innerHTML = '<button class="btn btn-check" id="btn-show-answer" onclick="showAnswer()">Проверить ответ</button>';
                startTimer();
            }
        }

        const modalElem = document.getElementById('question-modal');
        const cardElem = modalElem ? modalElem.querySelector('.modal-card') : null;
        if (modalElem && cardElem) {
            modalElem.style.display = 'flex';
            cardElem.classList.remove('zoom-in');
            modalElem.style.opacity = '1';
            modalElem.classList.add('active');
            setTimeout(() => cardElem.classList.add('zoom-in'), 10);
        }
    }

    function setAuctionFieldValue(teamIdx, val) {
        const input = document.getElementById(`auction-input-${teamIdx}`),
            card = document.getElementById(`auction-card-team-${teamIdx}`);
        if (input && card) {
            input.disabled = false;
            card.classList.remove('passed');
            if (auctionBets[teamIdx]) {
                auctionBets[teamIdx].isPassed = false;
                auctionBets[teamIdx].val = val;
            }
            input.value = val;
            input.style.borderColor = "var(--purple-medium)";
            input.style.boxShadow = "none";
        }
    }

    function handleAuctionInput(teamIdx) {
        const input = document.getElementById(`auction-input-${teamIdx}`);
        if (!input || !auctionBets[teamIdx]) return;
        let val = parseInt(input.value, 10);
        if (!isNaN(val)) auctionBets[teamIdx].val = val;
        input.style.borderColor = "var(--purple-medium)";
        input.style.boxShadow = "none";
    }

    function toggleAuctionPass(teamIdx) {
        const input = document.getElementById(`auction-input-${teamIdx}`),
            card = document.getElementById(`auction-card-team-${teamIdx}`);
        if (card && input) {
            const isPassed = card.classList.toggle('passed');
            input.disabled = isPassed;
            if (auctionBets[teamIdx]) auctionBets[teamIdx].isPassed = isPassed;
        }
    }

    function confirmAllAuctionBets() {
        let hasErrors = false;
        teams.forEach((t, idx) => {
            if (auctionBets[idx] && !auctionBets[idx].isPassed) {
                const input = document.getElementById(`auction-input-${idx}`);
                if (!input) return;
                const minBet = parseInt(input.getAttribute('data-min'), 10) || 0,
                    maxBet = parseInt(input.getAttribute('data-max'), 10) || minBet;
                let val = parseInt(input.value, 10);
                if (isNaN(val) || val < minBet || val > maxBet) {
                    hasErrors = true;
                    input.style.borderColor = "var(--error-red)";
                    input.style.boxShadow = "0 0 10px rgba(214, 48, 49, 0.8)";
                } else {
                    input.style.borderColor = "var(--purple-medium)";
                    input.style.boxShadow = "none";
                    auctionBets[idx].val = val;
                }
            } else if (auctionBets[idx] && auctionBets[idx].isPassed) {
                if (!gameStats[idx]) gameStats[idx] = {correct: 0, wrong: 0, passes: 0, cats: 0, auctions: 0};
                gameStats[idx].passes++;
            }
        });

        if (hasErrors) {
            showSystemModal("❌ Недопустимая ставка!", "Некоторые команды превысили свой лимит очков.");
            return;
        }
        const currentQuestionObj = currentActiveQuestion || (gameData[currentRoundIndex]?.themes?.[currentThemeIdx]?.questions?.[currentQuestionIdx]);

        if (currentQuestionObj && currentQuestionObj.type === 'auction_leader') {
            let maxBet = -1, leaders = [];
            teams.forEach((t, idx) => {
                if (auctionBets[idx] && !auctionBets[idx].isPassed) {
                    const betVal = auctionBets[idx].val;
                    if (betVal > maxBet) {
                        maxBet = betVal;
                        leaders = [idx];
                    } else if (betVal === maxBet && maxBet > 0) leaders.push(idx);
                }
            });

            if (maxBet === -1 || leaders.length === 0) {
                showSystemModal("❌ Все пасанули!", "Ни одна из команд не сделала ставку.");
                return;
            }
            if (leaders.length > 1) {
                showSystemModal("⚖️ НИЧЬЯ В ТОРГАХ!", `Команды ${leaders.map(i => `"${teams[i].name}"`).join(' и ')} поставили одинаковую сумму (<b>${maxBet}</b>)!`);
                return;
            }

            const winnerIdx = leaders[0];
            activeTeamIdxForQuestion = winnerIdx;

            if (!gameStats[winnerIdx]) gameStats[winnerIdx] = {correct: 0, wrong: 0, passes: 0, cats: 0, auctions: 0};
            gameStats[winnerIdx].auctions++;

            const listContainer = document.getElementById('teams-modal-list');
            if (listContainer) listContainer.innerHTML = '';
            const badge = document.getElementById('modal-special-badge');
            if (badge) badge.innerHTML = `🔨 ПЕРИОД ТОРГОВ ЗАВЕРШЁН! 🔨<span>Победитель аукциона: <b>${teams[winnerIdx].name}</b> со ставкой <b>${maxBet}</b>!</span>`;
            document.getElementById('timer-hint').textContent = `🎯 Отвечает команда: "${teams[winnerIdx].name}" (Ставка: ${maxBet})`;
        } else {
            teams.forEach((t, idx) => {
                if (auctionBets[idx] && !auctionBets[idx].isPassed) {
                    if (!gameStats[idx]) gameStats[idx] = {correct: 0, wrong: 0, passes: 0, cats: 0, auctions: 0};
                    gameStats[idx].auctions++;
                }
            });

            const listContainer = document.getElementById('teams-modal-list');
            if (listContainer) listContainer.innerHTML = '';
            const badge = document.getElementById('modal-special-badge');
            if (badge) badge.innerHTML = `💰 ВОПРОС СО СТАВКОЙ! 💰<span>Все ставки приняты! Внимание на экран...</span>`;
            document.getElementById('timer-hint').textContent = "⏳ Все ставки зафиксированы! Нажмите кнопку ниже...";
        }

        const btnArea = document.getElementById('modal-buttons-area');
        if (btnArea) {
            btnArea.style.flexDirection = 'row';
            btnArea.innerHTML = '<button class="btn btn-success" id="btn-start-paused-timer" onclick="startPausedSpecialTimer()">⏱️ Открыть вопрос и запустить таймер</button>';
        }
    }

    function selectTeamForCatInBag(teamIdx) {
        activeTeamIdxForQuestion = teamIdx;
        if (!gameStats[teamIdx]) gameStats[teamIdx] = {correct: 0, wrong: 0, passes: 0, cats: 0, auctions: 0};
        gameStats[teamIdx].cats++;

        document.getElementById('timer-hint').textContent = `🎯 Отвечает команда: "${teams[teamIdx].name}"`;
        document.getElementById('timer-hint').style.color = "#ff9f43";
        const listContainer = document.getElementById('teams-modal-list');
        if (listContainer) listContainer.innerHTML = `<div style="text-align:center; font-size:22px; font-weight:800; color:var(--gold-accent); margin-bottom:15px;">Вопрос передан команде: ${teams[teamIdx].name}!</div>`;
        const badge = document.getElementById('modal-special-badge');
        if (badge) badge.remove();
        const btnArea = document.getElementById('modal-buttons-area');
        if (btnArea) {
            btnArea.style.flexDirection = 'row';
            btnArea.innerHTML = '<button class="btn btn-success" id="btn-start-paused-timer" onclick="startPausedSpecialTimer()">⏱️ Открыть вопрос и запустить таймер</button>';
        }
    }

    function startPausedSpecialTimer() {
        const oldCatAnim = document.getElementById('modal-cat-animation');
        if (oldCatAnim) oldCatAnim.remove();
        const timerElem = document.getElementById('timer'), hintElem = document.getElementById('timer-hint'),
            btnArea = document.getElementById('modal-buttons-area');
        const question = currentActiveQuestion || (gameData[currentRoundIndex]?.themes?.[currentThemeIdx]?.questions?.[currentQuestionIdx]);

        if (question) {
            question.used = true;
            saveGameState();
        }
        if (activeCellOnBoard) {
            activeCellOnBoard.classList.add('used');
            activeCellOnBoard.onclick = null;
        }

        const currentTheme = gameData[currentRoundIndex]?.themes[currentThemeIdx];
        if (currentTheme && currentTheme.questions.every(q => q.used)) {
            const themeTitleElem = document.getElementById(`theme-title-${currentThemeIdx}`);
            if (themeTitleElem) themeTitleElem.classList.add('used');
        }

        const qTextElem = document.getElementById('modal-question-text'),
            imgElement = document.getElementById('modal-question-img'),
            audioElement = document.getElementById('modal-question-audio');

        if (qTextElem) {
            if (question && question.q && question.q.trim().length > 0) {
                qTextElem.textContent = question.q;
                qTextElem.style.display = 'block';
            } else {
                qTextElem.style.display = 'none';
            }
        }

        if (imgElement) {
            imgElement.classList.remove('img-error');
            if (question && question.img && typeof question.img === 'string' && question.img.trim().length > 0) {
                imgElement.src = resolveMediaPath(question.img.trim());
                imgElement.style.display = 'block';
            } else {
                imgElement.style.display = 'none';
            }
        }

        const hasVideo = handleQuestionVideo(question, false);

        if (question && question.audio && typeof question.audio === 'string' && question.audio.trim().length > 0) {
            if (audioElement) {
                audioElement.style.display = 'block';
                audioElement.src = resolveMediaPath(question.audio.trim());
                audioElement.play().catch(e => {
                });
            }
        }

        if (hasVideo) {
            stopTimer();
            if (timerElem) {
                timerElem.style.display = 'flex';
                timerElem.textContent = "";
                timerElem.className = "timer paused";
            }
            if (hintElem) {
                hintElem.textContent = "🎬 Внимание на видео! Таймер запустится после просмотра";
                hintElem.style.color = "#81ecec";
            }
            if (btnArea) btnArea.innerHTML = '<button class="btn btn-check" onclick="startTimerAfterVideo()">▶️ Пропустить видео и запустить таймер</button>';
        } else {
            stopTimer();
            isReadingTime = (configReadingTime > 0);
            timeLeft = isReadingTime ? configReadingTime : configThinkingTime;

            if (timerElem) {
                timerElem.textContent = timeLeft;
                if (isReadingTime) {
                    timerElem.className = "timer reading";
                    if (hintElem) {
                        hintElem.textContent = "⏱️ Внимание! Чтение вопроса";
                        hintElem.style.color = "#81ecec";
                    }
                } else {
                    timerElem.className = "timer thinking";
                    if (hintElem) {
                        hintElem.textContent = "🔥 Время пошло! Обсуждение";
                        hintElem.style.color = "#ff7675";
                        playStartThinkingSound();
                    }
                }
            }
            if (btnArea) btnArea.innerHTML = '<button class="btn btn-check" id="btn-show-answer" onclick="showAnswer()">Проверить ответ</button>';
            startTimer();
        }
    }

    function startTimer() {
        stopTimer();
        timerInterval = setInterval(() => {
            timeLeft--;
            const timerElem = document.getElementById('timer');
            if (timerElem) timerElem.textContent = timeLeft;
            if (!isReadingTime && timeLeft > 0 && timeLeft <= 10) playTickSound();

            if (timeLeft <= 0) {
                if (isReadingTime) {
                    isReadingTime = false;
                    isAnswerTimerActive = false;
                    timeLeft = configThinkingTime;
                    const timerElemInner = document.getElementById('timer'),
                        hintElemInner = document.getElementById('timer-hint');
                    if (timerElemInner && hintElemInner) {
                        timerElemInner.textContent = timeLeft;
                        timerElemInner.className = "timer thinking";
                        hintElemInner.textContent = "🔥 Время пошло! Обсуждение";
                        hintElemInner.style.color = "#ff7675";
                    }
                    playStartThinkingSound();
                } else {
                    stopTimer();
                    playTimeUpSound();
                    const hintElemInner = document.getElementById('timer-hint');
                    if (hintElemInner) {
                        hintElemInner.textContent = "⏰ Время вышло! Нажмите кнопку";
                        hintElemInner.style.color = "#ffeaa7";
                    }
                }
            }
        }, 1000);
    }

    function toggleAnswerPause() {
        const modalElem = document.getElementById('question-modal');
        if (!modalElem || !modalElem.classList.contains('active')) return;

        const answerElem = document.getElementById('modal-answer-text');
        if (answerElem && answerElem.style.display === 'block') return;

        const specialBadge = document.getElementById('modal-special-badge');
        if (specialBadge && !document.getElementById('btn-show-answer')) return;

        const timerElem = document.getElementById('timer');
        const hintElem = document.getElementById('timer-hint');

        if (!isAnswerTimerActive) {
            stopTimer();
            isAnswerTimerActive = true;
            savedThinkingTime = timeLeft;
            let currentAnswerSec = configAnswerTime;

            playStartThinkingSound();

            if (timerElem && hintElem) {
                timerElem.textContent = currentAnswerSec;
                timerElem.className = "timer answering";
                hintElem.textContent = "🎙️ Ответ команды!";
                hintElem.style.color = "#f1c40f";
            }

            answerCountdownInterval = setInterval(() => {
                currentAnswerSec--;
                if (timerElem) timerElem.textContent = currentAnswerSec;
                if (currentAnswerSec > 0 && currentAnswerSec <= 3) playTickSound();

                if (currentAnswerSec <= 0) {
                    if (answerCountdownInterval) {
                        clearInterval(answerCountdownInterval);
                        answerCountdownInterval = null;
                    }
                    playTimeUpSound();
                    if (hintElem) {
                        hintElem.textContent = "⏰ Время на ответ вышло!";
                        hintElem.style.color = "#ff7675";
                    }
                }
            }, 1000);

        } else {
            stopTimer();
            isAnswerTimerActive = false;
            timeLeft = savedThinkingTime;

            if (timerElem && hintElem) {
                timerElem.textContent = timeLeft;
                timerElem.className = isReadingTime ? "timer reading" : "timer thinking";
                hintElem.textContent = isReadingTime ? "⏱️ Внимание! Чтение вопроса" : "🔥 Время пошло! Обсуждение";
                hintElem.style.color = isReadingTime ? "#81ecec" : "#ff7675";
            }

            if (timeLeft > 0) {
                startTimer();
            } else {
                playTimeUpSound();
            }
        }
    }

    window.addEventListener('keydown', function (event) {
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag === 'input' || activeTag === 'textarea') return;

        const turnModal = document.getElementById('turn-order-modal');
        if (turnModal && turnModal.classList.contains('active')) {
            if (event.key === 'Escape' || event.code === 'Escape') {
                event.preventDefault();
                closeTurnOrderModal();
                return;
            }
        }

        const catSplash = document.getElementById('cat-splash-overlay');
        if (catSplash && catSplash.style.display !== 'none') {
            if (event.code === 'Space' || event.code === 'Enter' || event.key === ' ' || event.key === 'Escape') {
                event.preventDefault();
                dismissCatSplash();
                return;
            }
        }

        const auctionSplash = document.getElementById('auction-splash-overlay');
        if (auctionSplash && auctionSplash.style.display !== 'none') {
            if (event.code === 'Space' || event.code === 'Enter' || event.key === ' ' || event.key === 'Escape') {
                event.preventDefault();
                dismissAuctionSplash();
                return;
            }
        }

        if (event.code === 'Space' || event.key === ' ' || event.keyCode === 32) {
            const modalElem = document.getElementById('question-modal');
            if (modalElem && modalElem.classList.contains('active')) {
                event.preventDefault();
                toggleAnswerPause();
            }
        }
    });

    function renderModalTeamsList() {
        const listContainer = document.getElementById('teams-modal-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';
        listContainer.style.display = 'flex';
        listContainer.style.flexDirection = 'column';
        listContainer.style.alignItems = 'center';
        listContainer.style.gap = '12px';

        const currentQuestionObj = currentActiveQuestion || (gameData[currentRoundIndex]?.themes?.[currentThemeIdx]?.questions?.[currentQuestionIdx]);
        const qType = currentQuestionObj ? currentQuestionObj.type : 'normal';

        if (['cat', 'auction_leader'].includes(qType) && activeTeamIdxForQuestion !== null) {
            const team = teams[activeTeamIdxForQuestion];
            let betVal = (qType === 'auction_leader' && auctionBets[activeTeamIdxForQuestion])
                ? auctionBets[activeTeamIdxForQuestion].val
                : currentCost;

            const row = document.createElement('div');
            row.className = 'modal-team-row';
            row.style.border = '3px solid var(--gold-accent)';
            row.style.background = 'rgba(253, 216, 53, 0.08)';

            row.innerHTML = `
                <div class="modal-team-info-group">
                    <span class="modal-team-title">🎯 ${team.name}</span>
                    <span class="modal-badge-score">Очки: ${team.score}</span>
                    <span class="modal-badge-bet">Ставка: ${betVal}</span>
                </div>
                <div class="modal-team-actions">
                    <button class="btn-mini btn-plus" onclick="changeTeamScore(${activeTeamIdxForQuestion}, ${betVal})">+${betVal}</button>
                    <button class="btn-mini btn-minus" onclick="changeTeamScore(${activeTeamIdxForQuestion}, ${-betVal})">-${betVal}</button>
                </div>
            `;
            listContainer.appendChild(row);

        } else if (qType === 'auction') {
            teams.forEach((team, idx) => {
                const betInfo = auctionBets[idx];
                const row = document.createElement('div');
                row.className = 'modal-team-row';

                if (betInfo && betInfo.isPassed) {
                    row.style.opacity = '0.5';
                    row.innerHTML = `
                        <div class="modal-team-info-group">
                            <span class="modal-team-title">⭐ ${team.name}</span>
                            <span class="modal-badge-score">Очки: ${team.score}</span>
                            <span class="modal-badge-bet" style="border-color:var(--error-red); color:var(--error-red); background:rgba(214,48,49,0.15);">🚫 ПАС</span>
                        </div>
                    `;
                } else {
                    const teamBet = (betInfo && betInfo.val !== undefined) ? betInfo.val : currentCost;
                    row.innerHTML = `
                        <div class="modal-team-info-group">
                            <span class="modal-team-title">⭐ ${team.name}</span>
                            <span class="modal-badge-score">Очки: ${team.score}</span>
                            <span class="modal-badge-bet">Ставка: ${teamBet}</span>
                        </div>
                        <div class="modal-team-actions">
                            <button class="btn-mini btn-plus" onclick="changeTeamScore(${idx}, ${teamBet})">+${teamBet}</button>
                            <button class="btn-mini btn-minus" onclick="changeTeamScore(${idx}, ${-teamBet})">-${teamBet}</button>
                        </div>
                    `;
                }
                listContainer.appendChild(row);
            });

        } else {
            teams.forEach((team, idx) => {
                const row = document.createElement('div');
                row.className = 'modal-team-row';
                row.innerHTML = `
                    <div class="modal-team-info-group">
                        <span class="modal-team-title">⭐ ${team.name}</span>
                        <span class="modal-badge-score">Очки: ${team.score}</span>
                    </div>
                    <div class="modal-team-actions">
                        <button class="btn-mini btn-plus" onclick="changeTeamScore(${idx}, ${currentCost})">+${currentCost}</button>
                        <button class="btn-mini btn-minus" onclick="changeTeamScore(${idx}, ${-currentCost})">-${currentCost}</button>
                    </div>
                `;
                listContainer.appendChild(row);
            });
        }
    }

    function showAnswer() {
        stopTimer();
        stopQuestionAudio();
        isAnswerTimerActive = false;

        const timerElem = document.getElementById('timer');
        const hintElem = document.getElementById('timer-hint');
        if (timerElem) timerElem.style.display = 'none';
        if (hintElem) hintElem.style.display = 'none';

        document.getElementById('modal-answer-text').style.display = 'block';

        const currentQuestionObj = currentActiveQuestion || (gameData[currentRoundIndex]?.themes?.[currentThemeIdx]?.questions?.[currentQuestionIdx]);
        const ansImgElement = document.getElementById('modal-answer-img');

        if (ansImgElement) {
            ansImgElement.classList.remove('img-error');
            if (currentQuestionObj && currentQuestionObj.answer_img && typeof currentQuestionObj.answer_img === 'string' && currentQuestionObj.answer_img.trim().length > 0) {
                ansImgElement.src = resolveMediaPath(currentQuestionObj.answer_img.trim());
                ansImgElement.style.display = 'block';
            } else {
                ansImgElement.src = "";
                ansImgElement.style.display = 'none';
            }
        }

        if (currentQuestionObj) {
            handleQuestionVideo(currentQuestionObj, true);
        }

        const btnArea = document.getElementById('modal-buttons-area');
        if (btnArea) {
            btnArea.innerHTML = '';
            renderModalTeamsList();

            const closeBtn = document.createElement('button');
            closeBtn.className = 'btn btn-close-modal';
            closeBtn.textContent = 'Продолжить игру';
            closeBtn.onclick = () => {
                stopQuestionAudio();
                if (isTestMode) {
                    isTestMode = false;
                    closeSystemModal();
                    showSubScreen('sub-menu-dev');
                    return;
                }

                currentTurnTeamIdx = (currentTurnTeamIdx + 1) % teams.length;
                saveGameState();
                updateTurnDisplay();
                updateTeamsPanel();
                initBoard();
                closeSystemModal(true);
            };
            btnArea.appendChild(closeBtn);
        }
    }

    function changeTeamScore(teamIdx, amount) {
        teams[teamIdx].score += amount;
        if (!gameStats[teamIdx]) gameStats[teamIdx] = {correct: 0, wrong: 0, passes: 0, cats: 0, auctions: 0};

        if (amount > 0) gameStats[teamIdx].correct++;
        else if (amount < 0) gameStats[teamIdx].wrong++;

        updateTeamsPanel();
        renderModalTeamsList();
        saveGameState();
    }

    function skipRound() {
        showSystemModal("⏭️ ПРОПУСК РАУНДА", "Вы уверены, что хотите пропустить текущий раунд?",
            [{text: "Да, пропустить", class: "btn-danger", action: () => executeSkipRound()}, {
                text: "Отмена",
                class: "btn-check",
                action: () => closeSystemModal()
            }]);
    }

    function executeSkipRound() {
        closeSystemModal();
        stopQuestionAudio();
        currentRoundIndex++;
        currentTurnTeamIdx = (currentTurnTeamIdx + 1) % teams.length;
        if (currentRoundIndex >= gameData.length) {
            hideGameLayout();
            showWinnerCelebration();
            return;
        }
        updateTurnDisplay();
        updateTeamsPanel();
        initBoard();
        saveGameState();
    }

    function checkRoundEnd() {
        const currentRound = gameData[currentRoundIndex];
        if (!currentRound) return;
        const allUsed = currentRound.themes.every(t => t.questions.every(q => q.used));

        if (allUsed) {
            currentRoundIndex++;
            if (currentRoundIndex < gameData.length) {
                showSystemModal("🏁 РАУНД ЗАВЕРШЕН", "Все вопросы раунда разыграны!");
                currentTurnTeamIdx = (currentTurnTeamIdx + 1) % teams.length;
                initBoard();
                saveGameState();
            } else {
                hideGameLayout();
                showWinnerCelebration();
            }
        }
    }

    function showWinnerCelebration() {
        clearGameState();
        let maxScore = -Infinity;
        teams.forEach(t => {
            if (t.score > maxScore) maxScore = t.score;
        });

        let winners = teams.filter(t => t.score === maxScore);
        triggerFireworksAnimation();

        let winnerText = "";
        let winnerDesc = "";

        if (winners.length > 1) {
            let names = winners.map(w => `<b>"${w.name}"</b>`).join(', ');
            winnerText = "⚖️ БОЕВАЯ НИЧЬЯ! ⚖️";
            winnerDesc = `<div style="font-size:24px; font-weight:800; color:#ffffff; margin: 15px 0;">
                Победили команды: ${names}<br><br>
                Каждая из них набрала по <b style="color:var(--gold-accent); font-size:32px;">${maxScore}</b> очков! Поздравляем чемпионов! 🎉
            </div>`;
        } else {
            let winner = winners[0];
            winnerText = "🏆 ПОБЕДИТЕЛЬ ВИКТОРИНЫ! 🏆";
            winnerDesc = `<div style="font-size:26px; font-weight:800; color:#ffffff; margin: 20px 0;">
                Победила команда: <b style="color:var(--gold-accent); font-size:36px;">"${winner.name}"</b><br><br>
                С прекрасным результатом: <b style="color:var(--gold-accent); font-size:36px;">${winner.score}</b> очков! 🎆
            </div>`;
        }

        showSystemModal(
            winnerText,
            winnerDesc,
            [
                {
                    text: "📊 Посмотреть статистику",
                    class: "btn-check",
                    action: () => {
                        showFinalGameStats();
                    }
                },
                {
                    text: "🏠 В главное меню",
                    class: "btn-success",
                    action: () => {
                        executeQuitToMainMenu();
                    }
                }
            ]
        );
    }

    function showFinalGameStats() {
        stopFireworks();
        let maxScore = -Infinity;
        teams.forEach(t => {
            if (t.score > maxScore) maxScore = t.score;
        });

        let tableHtml = `
            <div class="stats-table-wrapper">
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th>Команда</th>
                            <th>Итоговый счёт</th>
                            <th>Правильно (✅)</th>
                            <th>Ошибок (❌)</th>
                            <th>Точность</th>
                            <th>Пасов (🚫)</th>
                            <th>«Кот» (🐱)</th>
                            <th>Аукционов (💰)</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        teams.forEach((t, idx) => {
            const st = gameStats[idx] || {correct: 0, wrong: 0, passes: 0, cats: 0, auctions: 0};
            const isWinner = (t.score === maxScore && maxScore > -Infinity);
            const totalAnswers = st.correct + st.wrong;
            const accuracy = totalAnswers > 0 ? Math.round((st.correct / totalAnswers) * 100) : 0;
            const teamIcon = isWinner ? '🏆' : '⭐';

            tableHtml += `
                <tr class="${isWinner ? 'winner-row' : ''}">
                    <td><div class="stats-team-name">${teamIcon} ${t.name}</div></td>
                    <td style="color:var(--gold-accent); font-weight:900; font-size:22px;">${t.score}</td>
                    <td style="color:var(--success-green); font-weight:900; font-size:22px;">${st.correct}</td>
                    <td style="color:var(--error-red); font-weight:900; font-size:22px;">${st.wrong}</td>
                    <td style="font-weight:800; font-size:20px;">${accuracy}%</td>
                    <td style="font-size:20px;">${st.passes}</td>
                    <td style="font-size:20px;">${st.cats}</td>
                    <td style="font-size:20px;">${st.auctions}</td>
                </tr>
            `;
        });

        tableHtml += `
                    </tbody>
                </table>
            </div>
        `;

        showSystemModal(
            "📊 ИТОГИ И СТАТИСТИКА МАТЧА 📊",
            tableHtml,
            [{
                text: "🏠 В главное меню",
                class: "btn-success",
                action: () => {
                    executeQuitToMainMenu();
                }
            }]
        );
    }

    function downloadPack() {
        const blob = new Blob([document.getElementById('json-editor').value], {type: "application/json;charset=utf-8"});
        const url = URL.createObjectURL(blob), downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", url);
        downloadAnchor.setAttribute("download", "город_ю_викторина.json");
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        URL.revokeObjectURL(url);
    }

    function uploadPack(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById('json-editor').value = e.target.result;
            applyCustomQuestions();
            event.target.value = '';
        };
        reader.readAsText(file);
    }

    function openTurnOrderModal() {
        if (!teams || teams.length === 0) {
            showSystemModal("\u26A0\uFE0F \u041D\u0435\u0442 \u043A\u043E\u043C\u0430\u043D\u0434", "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0438\u043B\u0438 \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0435 \u0438\u0433\u0440\u0443!");
            return;
        }
        renderTurnModalTeams();
        const modal = document.getElementById('turn-order-modal');
        if (modal) {
            modal.style.display = 'flex';
            modal.style.opacity = '1';
            modal.classList.add('active');
            const card = modal.querySelector('.modal-card');
            if (card) card.classList.add('zoom-in');
        }
    }

    function closeTurnOrderModal() {
        const modal = document.getElementById('turn-order-modal');
        if (modal) {
            modal.classList.remove('active');
            const card = modal.querySelector('.modal-card');
            if (card) card.classList.remove('zoom-in');
            modal.style.display = 'none';
        }
    }

    function onTurnOrderModalBackdropClick(event) {
        if (event.target && event.target.id === 'turn-order-modal') {
            closeTurnOrderModal();
        }
    }

    function selectTurnTeam(idx) {
        if (idx < 0 || idx >= teams.length) return;
        currentTurnTeamIdx = idx;
        updateTurnDisplay();
        updateTeamsPanel();
        saveGameState();
        try {
            playTickSound();
        } catch (e) {
        }
        closeTurnOrderModal();
    }

    function passTurnToNextTeam() {
        if (!teams || teams.length === 0) return;
        currentTurnTeamIdx = (currentTurnTeamIdx + 1) % teams.length;
        updateTurnDisplay();
        updateTeamsPanel();
        saveGameState();
        try {
            playTickSound();
        } catch (e) {
        }
        closeTurnOrderModal();
    }

    function renderTurnModalTeams() {
        const listContainer = document.getElementById('turn-modal-teams-list');
        if (!listContainer) return;
        listContainer.innerHTML = '';

        const maxScore = teams.length > 0 ? Math.max(...teams.map(t => t.score)) : 0;
        const hasLeader = maxScore > 0;

        teams.forEach((team, idx) => {
            const isActive = (idx === currentTurnTeamIdx);
            const isLeader = hasLeader && team.score === maxScore;

            const card = document.createElement('div');
            card.className = 'turn-team-card' + (isActive ? ' is-active-turn' : '');
            card.onclick = () => selectTurnTeam(idx);

            const crownPrefix = isLeader ? '\uD83D\uDC51 ' : '';
            const actionHtml = isActive
                ? '<span class="turn-badge-active">\uD83D\uDC49 \u0425\u043E\u0434\u0438\u0442 \u0441\u0435\u0439\u0447\u0430\u0441</span>'
                : `<button class="turn-select-btn" onclick="event.stopPropagation(); selectTurnTeam(${idx})">\u041F\u0435\u0440\u0435\u0434\u0430\u0442\u044C \u0445\u043E\u0434 \u2794</button>`;

            const cleanName = (team.name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            card.innerHTML = `
                <div class="turn-card-left">
                    <div class="turn-card-num">${idx + 1}</div>
                    <div class="turn-card-info">
                        <div class="turn-card-name">${crownPrefix}${cleanName}</div>
                        <div class="turn-card-pts">${team.score} \u043E\u0447\u043A\u043E\u0432</div>
                    </div>
                </div>
                <div class="turn-card-right">
                    ${actionHtml}
                </div>
            `;
            listContainer.appendChild(card);
        });
    }

    function updateTurnDisplay() {
        const displayElem = document.getElementById('active-turn-team-name');
        if (displayElem && teams[currentTurnTeamIdx]) {
            displayElem.textContent = teams[currentTurnTeamIdx].name;
        }
        const turnModal = document.getElementById('turn-order-modal');
        if (turnModal && turnModal.classList.contains('active')) {
            renderTurnModalTeams();
        }
    }

    showSubScreen('sub-menu-main');

    function showSystemModal(titleText, descText, customButtons = null) {
        stopTimer();
        stopQuestionAudio();

        const timerElem = document.getElementById('timer'), hintElem = document.getElementById('timer-hint');
        const qTextElem = document.getElementById('modal-question-text'),
            ansTextElem = document.getElementById('modal-answer-text');
        const imgElement = document.getElementById('modal-question-img'),
            ansImgElement = document.getElementById('modal-answer-img');
        const audioElement = document.getElementById('modal-question-audio'),
            listContainer = document.getElementById('teams-modal-list');
        const btnArea = document.getElementById('modal-buttons-area');

        if (timerElem) timerElem.style.display = 'none';
        if (hintElem) hintElem.style.display = 'none';
        if (qTextElem) {
            qTextElem.style.display = 'none';
            qTextElem.textContent = '';
        }
        if (ansTextElem) {
            ansTextElem.style.display = 'none';
            ansTextElem.textContent = '';
        }
        if (imgElement) {
            imgElement.style.display = 'none';
            imgElement.src = '';
        }
        if (ansImgElement) {
            ansImgElement.style.display = 'none';
            ansImgElement.src = '';
        }
        if (audioElement) audioElement.style.display = 'none';
        if (listContainer) {
            listContainer.innerHTML = '';
            listContainer.style.display = 'none';
        }

        const oldBadge = document.getElementById('modal-special-badge');
        if (oldBadge) oldBadge.remove();
        const oldCatAnim = document.getElementById('modal-cat-animation');
        if (oldCatAnim) oldCatAnim.remove();

        const badge = document.createElement('div');
        badge.id = 'modal-special-badge';
        badge.className = 'special-question-badge badge-system';
        badge.innerHTML = titleText + '<span>' + descText + '</span>';
        document.querySelector('#question-modal .modal-card').prepend(badge);

        if (btnArea) {
            btnArea.style.flexDirection = 'row';
            btnArea.style.flexWrap = 'wrap';
            btnArea.innerHTML = '';
            if (customButtons && Array.isArray(customButtons)) {
                customButtons.forEach(btnConfig => {
                    const btn = document.createElement('button');
                    btn.className = 'btn ' + (btnConfig.class || 'btn-check');
                    btn.textContent = btnConfig.text;
                    btn.onclick = btnConfig.action;
                    btnArea.appendChild(btn);
                });
            } else btnArea.innerHTML = '<button class="btn btn-check" onclick="closeSystemModal()">👍 Понятно</button>';
        }

        const modalElem = document.getElementById('question-modal'),
            cardElem = modalElem ? modalElem.querySelector('.modal-card') : null;
        if (modalElem && cardElem) {
            modalElem.style.display = 'flex';
            cardElem.classList.remove('zoom-in');
            modalElem.style.opacity = '1';
            modalElem.classList.add('active');
            setTimeout(() => cardElem.classList.add('zoom-in'), 10);
        }
    }

    function closeSystemModal(shouldCheckRound = false) {
        const modalElem = document.getElementById('question-modal'),
            cardElem = modalElem ? modalElem.querySelector('.modal-card') : null;
        if (cardElem && modalElem) {
            cardElem.classList.remove('zoom-in');
            modalElem.style.opacity = '0';
            modalElem.classList.remove('active');
            modalElem.style.display = 'none';
            const oldBadge = document.getElementById('modal-special-badge');
            if (oldBadge) oldBadge.remove();
            const timerElem = document.getElementById('timer'), hintElem = document.getElementById('timer-hint'),
                listContainer = document.getElementById('teams-modal-list');
            if (timerElem) timerElem.style.display = 'flex';
            if (hintElem) hintElem.style.display = 'block';
            if (listContainer) listContainer.style.display = 'flex';
            if (shouldCheckRound) checkRoundEnd();
        }
    }

    function clearTeamInputs() {
        const actionsBlock = document.querySelector('#team-setup-container .setup-actions');
        const setupHeader = document.querySelector('#team-setup-container h3');
        if (actionsBlock) actionsBlock.style.display = 'flex';
        if (setupHeader) setupHeader.textContent = "⭐ Настройка команд перед игрой";
        const inputsContainer = document.getElementById('team-inputs');
        if (inputsContainer) {
            inputsContainer.innerHTML = `
                <div class="team-input-row"><input type="text" class="team-input" value="Команда 1" placeholder="Название команды 1"><button class="btn-remove-team" onclick="removeInputRow(this)" title="Удалить команду">❌</button></div>
                <div class="team-input-row"><input type="text" class="team-input" value="Команда 2" placeholder="Название команды 2"><button class="btn-remove-team" onclick="removeInputRow(this)" title="Удалить команду">❌</button></div>`;
            inputsContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(240px, 1fr))';
            inputsContainer.style.maxWidth = '';
            inputsContainer.style.margin = '30px 0 40px 0';
        }
    }

    function generateStarrySky() {
        if (document.body.classList.contains('light-theme')) return;
        const container = document.getElementById('stars-container');
        if (!container) return;
        container.innerHTML = '';

        const starCount = Math.floor((window.innerWidth * window.innerHeight) / 14000);
        const colors = ['#ffffff', '#ffffff', '#fdd835', '#fd79a8', '#81ecec'];

        for (let i = 0; i < starCount; i++) {
            const star = document.createElement('div');
            star.className = 'star';

            const size = (Math.random() * 2 + 1).toFixed(1);
            const top = (Math.random() * 70).toFixed(1);
            const left = (Math.random() * 100).toFixed(1);
            const duration = (Math.random() * 6 + 4).toFixed(1);
            const delay = (Math.random() * 6).toFixed(1);
            const minOpacity = (Math.random() * 0.25 + 0.1).toFixed(2);
            const color = colors[Math.floor(Math.random() * colors.length)];

            star.style.width = `${size}px`;
            star.style.height = `${size}px`;
            star.style.top = `${top}%`;
            star.style.left = `${left}%`;
            star.style.backgroundColor = color;
            star.style.setProperty('--duration', `${duration}s`);
            star.style.setProperty('--delay', `${delay}s`);
            star.style.setProperty('--min-opacity', minOpacity);

            container.appendChild(star);
        }
    }

    function onAppReady() {
        initTheme();
        showSubScreen('sub-menu-main');
        generateStarrySky();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onAppReady);
    } else {
        onAppReady();
    }

    window.addEventListener('resize', generateStarrySky);
