/**
 * Question Packs Catalog Module
 * Provides rich UI for browsing, filtering, searching, previewing, and loading
 * ready-to-play Jeopardy question packs directly from JSON files.
 */

const CATALOG_PAGE_SIZE = 10;
let currentCatalogPage = 1;
let currentCatalogCategory = 'all';
let currentCatalogDifficulty = 'all';
let currentCatalogRounds = 'all';
let currentCatalogSort = 'default';
let currentCatalogSearch = '';

function openPrepareQuestionsChoice() {
    if (typeof showSubScreen === 'function') {
        showSubScreen('sub-menu-prepare-choice');
    }
}

function openCustomPackEditor() {
    if (typeof showSubScreen === 'function') {
        showSubScreen('sub-menu-editor');
    }
}

async function ensureCatalogLoaded() {
    if (window.AVAILABLE_PACKS && Array.isArray(window.AVAILABLE_PACKS) && window.AVAILABLE_PACKS.length > 0) {
        return window.AVAILABLE_PACKS;
    }
    try {
        const resp = await fetch('js/packs_catalog.json');
        if (resp.ok) {
            window.AVAILABLE_PACKS = await resp.json();
            return window.AVAILABLE_PACKS;
        }
    } catch (e) {
        console.warn('Could not fetch packs_catalog.json:', e);
    }
    return window.AVAILABLE_PACKS || [];
}

async function openPacksCatalog() {
    if (typeof showSubScreen === 'function') {
        showSubScreen('sub-menu-packs-catalog');
    }
    initCatalogFilters();
    if (!window.AVAILABLE_PACKS || window.AVAILABLE_PACKS.length === 0) {
        await ensureCatalogLoaded();
    }
    renderCatalogPacks();
}

function initCatalogFilters() {
    const searchInput = document.getElementById('catalog-search-input');
    if (searchInput && !searchInput.dataset.initialized) {
        searchInput.dataset.initialized = 'true';
        searchInput.addEventListener('input', () => {
            handleCatalogFiltersChanged();
        });
    }

    const sortSelect = document.getElementById('catalog-sort-select');
    if (sortSelect && !sortSelect.dataset.initialized) {
        sortSelect.dataset.initialized = 'true';
        sortSelect.addEventListener('change', () => {
            handleCatalogFiltersChanged();
        });
    }

    const catSelect = document.getElementById('catalog-category-select');
    if (catSelect && !catSelect.dataset.initialized) {
        catSelect.dataset.initialized = 'true';
        catSelect.addEventListener('change', () => {
            handleCatalogFiltersChanged();
        });
    }

    // Modal click-outside backdrop listener
    const previewModal = document.getElementById('pack-preview-modal');
    if (previewModal && !previewModal.dataset.backdropBound) {
        previewModal.dataset.backdropBound = 'true';
        previewModal.addEventListener('click', (e) => {
            if (e.target === previewModal) {
                closePackPreviewModal();
            }
        });
    }
}

// Global Escape listener for preview modal
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modal = document.getElementById('pack-preview-modal');
        if (modal && modal.classList.contains('active')) {
            closePackPreviewModal();
        }
    }
});

function handleCatalogFiltersChanged() {
    const searchInput = document.getElementById('catalog-search-input');
    const clearBtn = document.getElementById('catalog-search-clear');
    if (searchInput) {
        currentCatalogSearch = searchInput.value.trim().toLowerCase();
        if (clearBtn) {
            clearBtn.classList.toggle('is-visible', searchInput.value.trim().length > 0);
        }
    }
    const catSelect = document.getElementById('catalog-category-select');
    if (catSelect) {
        currentCatalogCategory = catSelect.value;
    }
    const sortSelect = document.getElementById('catalog-sort-select');
    if (sortSelect) {
        currentCatalogSort = sortSelect.value;
    }

    currentCatalogPage = 1;
    renderCatalogPacks();
}

function clearCatalogSearch() {
    const searchInput = document.getElementById('catalog-search-input');
    const clearBtn = document.getElementById('catalog-search-clear');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
    if (clearBtn) {
        clearBtn.classList.remove('is-visible');
    }
    currentCatalogSearch = '';
    currentCatalogPage = 1;
    renderCatalogPacks();
}

function setCatalogCategory(cat) {
    currentCatalogCategory = cat;
    currentCatalogPage = 1;
    const catSelect = document.getElementById('catalog-category-select');
    if (catSelect && catSelect.value !== cat) {
        catSelect.value = cat;
    }
    renderCatalogPacks();
}

function setCatalogDiff(diff) {
    currentCatalogDifficulty = diff;
    currentCatalogPage = 1;

    // Support both data-diff and data-diff-filter attributes
    document.querySelectorAll('#catalog-diff-chips [data-diff], [data-diff-filter]').forEach(el => {
        const val = el.dataset.diff || el.dataset.diffFilter;
        if (val === diff) {
            el.classList.add('is-active');
        } else {
            el.classList.remove('is-active');
        }
    });

    renderCatalogPacks();
}

function setCatalogDifficulty(diff) {
    setCatalogDiff(diff);
}

function setCatalogRounds(rounds) {
    currentCatalogRounds = rounds;
    currentCatalogPage = 1;

    // Support both data-rounds and data-rounds-filter attributes
    document.querySelectorAll('#catalog-rounds-chips [data-rounds], [data-rounds-filter]').forEach(el => {
        const val = el.dataset.rounds || el.dataset.roundsFilter;
        if (val === rounds) {
            el.classList.add('is-active');
        } else {
            el.classList.remove('is-active');
        }
    });

    renderCatalogPacks();
}

function resetAllCatalogFilters() {
    currentCatalogCategory = 'all';
    currentCatalogDifficulty = 'all';
    currentCatalogRounds = 'all';
    currentCatalogSort = 'default';
    currentCatalogSearch = '';
    currentCatalogPage = 1;

    const searchInput = document.getElementById('catalog-search-input');
    if (searchInput) searchInput.value = '';

    const catSelect = document.getElementById('catalog-category-select');
    if (catSelect) catSelect.value = 'all';

    const sortSelect = document.getElementById('catalog-sort-select');
    if (sortSelect) sortSelect.value = 'default';

    document.querySelectorAll('#catalog-diff-chips [data-diff], [data-diff-filter]').forEach(el => {
        const val = el.dataset.diff || el.dataset.diffFilter;
        el.classList.toggle('is-active', val === 'all');
    });

    document.querySelectorAll('#catalog-rounds-chips [data-rounds], [data-rounds-filter]').forEach(el => {
        const val = el.dataset.rounds || el.dataset.roundsFilter;
        el.classList.toggle('is-active', val === 'all');
    });

    renderCatalogPacks();
}

function getFilteredPacks() {
    const packs = window.AVAILABLE_PACKS || [];
    return packs.filter(pack => {
        // Search filter
        if (currentCatalogSearch) {
            const t = (pack.title || '').toLowerCase();
            const d = (pack.description || '').toLowerCase();
            const c = (pack.category || pack.categoryName || '').toLowerCase();
            const tags = (pack.tags || []).join(' ').toLowerCase();
            const th = (pack.themesList || pack.themeNames || []).join(' ').toLowerCase();
            const match = t.includes(currentCatalogSearch) ||
                          d.includes(currentCatalogSearch) ||
                          c.includes(currentCatalogSearch) ||
                          tags.includes(currentCatalogSearch) ||
                          th.includes(currentCatalogSearch);
            if (!match) return false;
        }

        // Category filter
        if (currentCatalogCategory !== 'all') {
            const folder = pack.categoryFolder || '';
            const cat = pack.category || pack.categoryName || '';
            if (!folder.includes(currentCatalogCategory) && !cat.includes(currentCatalogCategory)) {
                return false;
            }
        }

        // Difficulty filter
        if (currentCatalogDifficulty !== 'all') {
            if (pack.difficulty !== currentCatalogDifficulty) {
                return false;
            }
        }

        // Rounds filter
        if (currentCatalogRounds !== 'all') {
            if (currentCatalogRounds === '1' && pack.roundsCount !== 1) return false;
            if (currentCatalogRounds === '2' && pack.roundsCount !== 2) return false;
            if (currentCatalogRounds === '3' && pack.roundsCount !== 3) return false;
            if (currentCatalogRounds === 'final' && !pack.hasFinal) return false;
            if ((currentCatalogRounds === 'nofinal' || currentCatalogRounds === 'no-final') && pack.hasFinal) return false;
        }

        return true;
    }).sort((a, b) => {
        if (currentCatalogSort === 'title_asc' || currentCatalogSort === 'title-asc') {
            return (a.title || '').localeCompare(b.title || '', 'ru');
        } else if (currentCatalogSort === 'title_desc' || currentCatalogSort === 'title-desc') {
            return (b.title || '').localeCompare(a.title || '', 'ru');
        } else if (currentCatalogSort === 'rounds_asc' || currentCatalogSort === 'rounds-asc') {
            return (a.roundsCount || 0) - (b.roundsCount || 0);
        } else if (currentCatalogSort === 'rounds_desc' || currentCatalogSort === 'rounds-desc') {
            return (b.roundsCount || 0) - (a.roundsCount || 0);
        } else if (currentCatalogSort === 'diff_asc' || currentCatalogSort === 'diff-asc') {
            const rank = { easy: 1, medium: 2, hard: 3, expert: 4 };
            return (rank[a.difficulty] || 2) - (rank[b.difficulty] || 2);
        } else if (currentCatalogSort === 'diff_desc' || currentCatalogSort === 'diff-desc') {
            const rank = { easy: 1, medium: 2, hard: 3, expert: 4 };
            return (rank[b.difficulty] || 2) - (rank[a.difficulty] || 2);
        }
        return 0; // default order
    });
}

function goToCatalogPage(pageNum) {
    currentCatalogPage = pageNum;
    renderCatalogPacks();

    // Smooth scroll up to top of catalog
    const topAnchor = document.getElementById('catalog-top-anchor') || document.getElementById('sub-menu-packs-catalog');
    if (topAnchor) {
        topAnchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function buildPaginationHtml(totalItems, totalPages) {
    if (totalPages <= 1) {
        return `
            <div class="catalog-pagination-bar">
                <div class="pagination-info-text">
                    Показаны все <b>${totalItems}</b> паков
                </div>
            </div>
        `;
    }

    const startItem = (currentCatalogPage - 1) * CATALOG_PAGE_SIZE + 1;
    const endItem = Math.min(totalItems, currentCatalogPage * CATALOG_PAGE_SIZE);

    let buttonsHtml = '';

    // First & Prev buttons
    buttonsHtml += `<button type="button" class="page-btn" ${currentCatalogPage === 1 ? 'disabled' : ''} onclick="goToCatalogPage(1)" title="В начало">⏮️</button>`;
    buttonsHtml += `<button type="button" class="page-btn" ${currentCatalogPage === 1 ? 'disabled' : ''} onclick="goToCatalogPage(${currentCatalogPage - 1})" title="Назад">◀️</button>`;

    // Page numbers range
    const maxVisible = 5;
    let startPage = Math.max(1, currentCatalogPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
        buttonsHtml += `<button type="button" class="page-btn" onclick="goToCatalogPage(1)">1</button>`;
        if (startPage > 2) buttonsHtml += `<span style="color: rgba(255,255,255,0.4); padding: 0 4px;">...</span>`;
    }

    for (let p = startPage; p <= endPage; p++) {
        const isActive = p === currentCatalogPage ? 'is-active-page' : '';
        buttonsHtml += `<button type="button" class="page-btn ${isActive}" onclick="goToCatalogPage(${p})">${p}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) buttonsHtml += `<span style="color: rgba(255,255,255,0.4); padding: 0 4px;">...</span>`;
        buttonsHtml += `<button type="button" class="page-btn" onclick="goToCatalogPage(${totalPages})">${totalPages}</button>`;
    }

    // Next & Last buttons
    buttonsHtml += `<button type="button" class="page-btn" ${currentCatalogPage === totalPages ? 'disabled' : ''} onclick="goToCatalogPage(${currentCatalogPage + 1})" title="Вперёд">▶️</button>`;
    buttonsHtml += `<button type="button" class="page-btn" ${currentCatalogPage === totalPages ? 'disabled' : ''} onclick="goToCatalogPage(${totalPages})" title="В конец">⏭️</button>`;

    return `
        <div class="catalog-pagination-bar">
            <div class="pagination-info-text">
                Показаны <b>${startItem}–${endItem}</b> из <b>${totalItems}</b> паков • Страница <b>${currentCatalogPage}</b> из <b>${totalPages}</b>
            </div>
            <div class="pagination-nav-group">
                ${buttonsHtml}
            </div>
        </div>
    `;
}

function renderCatalogPacks() {
    const grid = document.getElementById('catalog-packs-grid');
    const countNum = document.getElementById('catalog-count-num');
    if (!grid) return;

    const filtered = getFilteredPacks();
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / CATALOG_PAGE_SIZE));

    if (currentCatalogPage > totalPages) {
        currentCatalogPage = totalPages;
    }

    if (countNum) {
        countNum.textContent = totalItems;
    }

    if (totalItems === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 60px 24px; background: rgba(0,0,0,0.25); border-radius: 24px; border: 2px dashed rgba(255,255,255,0.2);">
                <div style="font-size: 60px; margin-bottom: 16px;">🔍</div>
                <h3 style="color: #ffffff; font-size: 24px; margin-bottom: 12px; font-weight: 800;">Паки не найдены</h3>
                <p style="color: var(--lavender-light); font-size: 17px; margin-bottom: 24px; line-height: 1.5;">Попробуйте смягчить фильтры или очистить поисковый запрос</p>
                <button type="button" class="btn btn-check" onclick="resetAllCatalogFilters()" style="font-size: 16px; padding: 12px 28px;">🔄 Сбросить все фильтры</button>
            </div>
        `;
        const oldPaginTop = document.getElementById('catalog-pagination-top');
        if (oldPaginTop) oldPaginTop.remove();
        const oldPaginBottom = document.getElementById('catalog-pagination-bottom');
        if (oldPaginBottom) oldPaginBottom.remove();
        return;
    }

    // Slice 10 items for current page
    const pagePacks = filtered.slice((currentCatalogPage - 1) * CATALOG_PAGE_SIZE, currentCatalogPage * CATALOG_PAGE_SIZE);

    const diffNames = {
        easy: '🟢 Просто',
        medium: '🔵 Средне',
        hard: '🟠 Сложно',
        expert: '🔴 Очень сложно'
    };

    let cardsHtml = '';
    pagePacks.forEach(pack => {
        const diffClass = 'diff-' + (pack.difficulty || 'medium');
        const diffText = diffNames[pack.difficulty] || '🔵 Средне';

        let roundsBadgeText = pack.roundsCount + ' раунда';
        if (pack.roundsCount === 1) roundsBadgeText = '1 раунд';
        if (pack.roundsCount === 5) roundsBadgeText = '5 раундов';

        // Extract real unique themes
        const themesArr = (pack.themesList && pack.themesList.length > 0) ? pack.themesList : (pack.themeNames || []);
        const uniqueThemes = Array.from(new Set(themesArr));
        const visibleThemes = uniqueThemes.slice(0, 4);

        let themesChipsHtml = visibleThemes.map(th => `<span class="pack-theme-chip" title="${th}">🎯 ${th}</span>`).join('');
        if (uniqueThemes.length > 4) {
            themesChipsHtml += `<span class="pack-theme-chip chip-more" title="Ещё ${uniqueThemes.length - 4} тем">+ ещё ${uniqueThemes.length - 4}</span>`;
        }

        cardsHtml += `
            <div class="pack-catalog-card" id="card-${pack.id}">
                <div class="pack-card-top-row">
                    <span class="pack-category-badge" title="${pack.category || pack.categoryName || 'Викторина'}">${pack.category || pack.categoryName || 'Викторина'}</span>
                    <span class="pack-diff-badge ${diffClass}">${diffText}</span>
                </div>

                <h3 class="pack-card-title">${pack.title}</h3>

                <div class="pack-card-badges-row">
                    <span class="pack-mini-pill">⏱️ ${roundsBadgeText}</span>
                    ${pack.hasFinal ? '<span class="pack-mini-pill pill-final">🏆 С финалом</span>' : ''}
                    ${pack.hasMedia ? '<span class="pack-mini-pill pill-media">🎬 Аудио/Видео</span>' : ''}
                    ${pack.hasCatInBag || pack.hasCat ? '<span class="pack-mini-pill pill-cat">🐱 Кот</span>' : ''}
                    ${pack.hasAuction ? '<span class="pack-mini-pill pill-auction">💰 Аукцион</span>' : ''}
                </div>

                <div class="pack-card-desc">${pack.description}</div>

                <div class="pack-card-themes-box">
                    <div class="pack-themes-title">📌 Темы вопросов:</div>
                    <div class="pack-themes-chips-list">${themesChipsHtml}</div>
                </div>

                <div class="pack-card-actions">
                    <button type="button" class="btn btn-pack-play" onclick="selectPackToPlay('${pack.id}')" title="Начать викторину с этим паком">▶️ Играть</button>
                    <button type="button" class="btn btn-pack-preview" onclick="previewPack('${pack.id}')" title="Посмотреть темы и структуру вопросов">👁️ Темы</button>
                    <button type="button" class="btn btn-pack-download" onclick="downloadPackById('${pack.id}')" title="Скачать пак">📥 Скачать пак</button>
                </div>
            </div>
        `;
    });

    grid.innerHTML = cardsHtml;

    // Handle Top and Bottom Pagination Bars
    const paginationMarkup = buildPaginationHtml(totalItems, totalPages);

    let paginTop = document.getElementById('catalog-pagination-top');
    if (!paginTop) {
        paginTop = document.createElement('div');
        paginTop.id = 'catalog-pagination-top';
        grid.parentNode.insertBefore(paginTop, grid);
    }
    paginTop.innerHTML = paginationMarkup;

    let paginBottom = document.getElementById('catalog-pagination-bottom');
    if (!paginBottom) {
        paginBottom = document.createElement('div');
        paginBottom.id = 'catalog-pagination-bottom';
        grid.parentNode.insertBefore(paginBottom, grid.nextSibling);
    }
    paginBottom.innerHTML = paginationMarkup;
}

function getPackRoundsArray(pack) {
    if (!pack) return [];
    if (pack.rounds && Array.isArray(pack.rounds)) return pack.rounds;
    if (typeof pack.rounds === 'object') {
        if (Array.isArray(pack.rounds.value)) return pack.rounds.value;
        if (Array.isArray(pack.rounds.rounds)) return pack.rounds.rounds;
        if (pack.rounds.themes && Array.isArray(pack.rounds.themes)) return [pack.rounds];
    }
    return [];
}

/**
 * Loads pack data directly from the individual JSON file in 'паки вопросов/'
 */
async function loadPackJsonData(pack) {
    if (!pack) throw new Error('Данные пака не переданы');

    // If rounds are already loaded into memory
    if (pack.rounds && Array.isArray(pack.rounds) && pack.rounds.length > 0) {
        return pack.rounds;
    }

    const filePath = pack.filePath || pack.path;
    if (!filePath) {
        throw new Error('Путь к файлу пака не указан в метаданных');
    }

    try {
        const response = await fetch(encodeURI(filePath));
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        let raw = await response.text();
        if (raw.charCodeAt(0) === 0xFEFF) {
            raw = raw.slice(1);
        }
        const parsed = JSON.parse(raw);
        const normalized = (typeof normalizeGameData === 'function')
            ? normalizeGameData(parsed)
            : (Array.isArray(parsed) ? parsed : [parsed]);

        pack.rounds = normalized;
        return normalized;
    } catch (err) {
        console.error('Ошибка загрузки JSON файла пака:', err);
        if (window.location && window.location.protocol === 'file:') {
            throw new Error(
                `Браузер заблокировал доступ к файлу '${filePath}' из-за ограничений протокола file://.\n\n` +
                `Чтобы играть:\n` +
                `1. Откройте проект через локальный веб-сервер (например, в IntelliJ IDEA нажмите иконку браузера в index.html, либо запустите любой локальный HTTP-сервер).\n` +
                `2. Либо перейдите в меню «Свой пакет» и загрузите этот файл через кнопку «Загрузить свой пак (.json)».`
            );
        }
        throw new Error(`Не удалось загрузить пак из файла: ${err.message}`);
    }
}

async function selectPackToPlay(packId) {
    const packs = window.AVAILABLE_PACKS || [];
    const pack = packs.find(p => p.id === packId);
    if (!pack) {
        if (typeof showSystemModal === 'function') {
            showSystemModal('Ошибка', 'Выбранный пак не найден.');
        }
        return;
    }

    try {
        // Close preview modal if open
        closePackPreviewModal();

        // Load pack questions directly from JSON file
        const roundsData = await loadPackJsonData(pack);
        if (!roundsData || roundsData.length === 0) {
            throw new Error('Файл пака не содержит раундов с вопросами');
        }

        window.currentPackTitle = pack.title;
        window.isPackSelected = true;

        // Clear previous in-progress game save
        if (typeof clearGameState === 'function') {
            clearGameState();
        } else {
            localStorage.removeItem('quiz_save_state');
        }

        // Set game data into game engine
        if (typeof window.setGameData === 'function') {
            window.setGameData(roundsData);
        } else {
            localStorage.setItem('jeopardy_pack', JSON.stringify(roundsData));
            const editor = document.getElementById('json-editor');
            if (editor) editor.value = JSON.stringify(roundsData, null, 4);
        }

        if (typeof currentRoundIndex !== 'undefined') {
            currentRoundIndex = 0;
        }

        const isOnline = (typeof window.isOnlineGame === 'function' && window.isOnlineGame());
        if (isOnline) {
            const hostClient = (typeof window.getHostNetworkClient === 'function') ? window.getHostNetworkClient() : null;
            if (hostClient && hostClient.isConnected) {
                hostClient.setPack(roundsData);
            }
            if (typeof window.updateLobbyPackDisplay === 'function') {
                window.updateLobbyPackDisplay();
            }
            if (typeof showSubScreen === 'function') {
                showSubScreen('sub-menu-online-lobby');
            }
            if (typeof showSystemModal === 'function') {
                showSystemModal('Пак загружен! 🎉', `Пак «${pack.title}» успешно выбран для сетевой игры!\nВсе подключенные игроки получат обновленную информацию.`);
            }
        } else {
            if (typeof showTeamSetup === 'function') {
                showTeamSetup();
            } else if (typeof showSubScreen === 'function') {
                showSubScreen('team-setup-container');
            }

            if (typeof showSystemModal === 'function') {
                showSystemModal('Пак загружен! 🎉', `Пак «${pack.title}» успешно загружен из JSON-файла!\nВыберите команды и приступайте к игре.`);
            }
        }
    } catch (err) {
        console.error('Error loading pack:', err);
        if (typeof showSystemModal === 'function') {
            showSystemModal('Ошибка загрузки JSON', err.message);
        } else {
            alert('Ошибка загрузки: ' + err.message);
        }
    }
}

async function previewPack(packId) {
    const packs = window.AVAILABLE_PACKS || [];
    const pack = packs.find(p => p.id === packId);
    if (!pack) return;

    const modal = document.getElementById('pack-preview-modal');
    if (!modal) return;

    const titleEl = document.getElementById('preview-pack-title');
    if (titleEl) titleEl.textContent = pack.title;

    const descEl = document.getElementById('preview-pack-desc');
    if (descEl) descEl.textContent = pack.description;

    const catEl = document.getElementById('preview-pack-category');
    if (catEl) catEl.textContent = pack.category || pack.categoryName || 'Викторина';

    const diffNames = {
        easy: '🟢 Просто',
        medium: '🔵 Средне',
        hard: '🟠 Сложно',
        expert: '🔴 Очень сложно'
    };
    const diffEl = document.getElementById('preview-pack-difficulty');
    if (diffEl) {
        diffEl.textContent = diffNames[pack.difficulty] || '🔵 Средне';
        diffEl.className = 'pack-diff-badge diff-' + (pack.difficulty || 'medium');
    }

    const roundsInfoEl = document.getElementById('preview-pack-rounds-info');
    if (roundsInfoEl) {
        roundsInfoEl.textContent = '⏱️ ' + pack.roundsCount + (pack.roundsCount === 1 ? ' раунд' : ' раунда') + (pack.hasFinal ? ' + 🏆 Финал' : '');
    }

    const roundsContainer = document.getElementById('preview-rounds-container');
    if (roundsContainer) {
        // Immediately render themes from manifest metadata
        const fallbackThemes = (pack.themeNames || pack.themesList || []);
        let initialThemesHtml = fallbackThemes.map(th => `
            <div class="preview-theme-item">
                <span class="preview-theme-item-name">📌 ${th}</span>
                <span class="preview-theme-costs">Вопросы по номиналу</span>
            </div>
        `).join('');

        roundsContainer.innerHTML = `
            <div class="preview-round-box">
                <div class="preview-round-name">📁 Темы викторины</div>
                <div class="preview-themes-grid">${initialThemesHtml || '<p style="color: rgba(255,255,255,0.6)">Загрузка структуры пака...</p>'}</div>
            </div>
        `;

        // Asynchronously load detailed questions from the JSON file
        loadPackJsonData(pack).then(packRounds => {
            if (!packRounds || packRounds.length === 0) return;
            roundsContainer.innerHTML = '';
            packRounds.forEach((round, rIdx) => {
                const roundBox = document.createElement('div');
                roundBox.className = 'preview-round-box';

                let themesHtml = '';
                (round.themes || []).forEach(theme => {
                    const costs = (theme.questions || []).map(q => q.cost).filter(Boolean).join(', ');
                    const countQ = (theme.questions || []).length;
                    themesHtml += `
                        <div class="preview-theme-item">
                            <span class="preview-theme-item-name">📌 ${theme.name}</span>
                            <span class="preview-theme-costs">Вопросы (${countQ} шт.): <b>${costs || 'по номиналу'}</b> баллов</span>
                        </div>
                    `;
                });

                roundBox.innerHTML = `
                    <div class="preview-round-name">📁 ${round.roundName || round.name || ('Раунд ' + (rIdx + 1))}</div>
                    <div class="preview-themes-grid">${themesHtml}</div>
                `;
                roundsContainer.appendChild(roundBox);
            });
        }).catch(err => {
            console.warn('Could not load detailed questions from JSON:', err.message);
        });
    }

    const playBtn = document.getElementById('preview-btn-play');
    if (playBtn) {
        playBtn.onclick = () => {
            closePackPreviewModal();
            selectPackToPlay(pack.id);
        };
    }

    const dlBtn = document.getElementById('preview-btn-download');
    if (dlBtn) {
        dlBtn.onclick = () => {
            downloadPackById(pack.id);
        };
    }

    // ACTIVATE MODAL
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
        modal.classList.add('active');
    });
}

function closePackPreviewModal() {
    const modal = document.getElementById('pack-preview-modal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => {
            if (!modal.classList.contains('active')) {
                modal.style.display = 'none';
            }
        }, 250);
    }
}

/**
 * Generates an interactive, standalone HTML document for viewing questions and answers of a pack.
 * @param {Object} pack - Pack metadata
 * @param {Array} rounds - Array of rounds with themes and questions
 * @returns {string} - Complete HTML page markup
 */
function generatePackHtmlDocument(pack, rounds) {
    function esc(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    const p = pack || {};
    const title = p.title || 'Пак вопросов Quiz U';
    const description = p.description || '';
    const category = p.category || 'Викторина';
    const categoryIcon = p.categoryIcon || '📁';
    const difficulty = p.difficulty || 'medium';
    const diffMap = {
        easy: 'Лёгкая',
        medium: 'Средняя',
        hard: 'Сложная',
        expert: 'Экспертная'
    };
    const difficultyLabel = diffMap[difficulty] || difficulty;

    const normalizedRounds = Array.isArray(rounds) ? rounds : (rounds ? [rounds] : []);
    let totalQuestions = 0;
    let totalThemes = 0;

    normalizedRounds.forEach(r => {
        (r.themes || []).forEach(t => {
            totalThemes++;
            totalQuestions += (t.questions || []).length;
        });
    });

    const roundsHtml = normalizedRounds.map((round, rIdx) => {
        const roundTitle = round.roundName || round.name || ('Раунд ' + (rIdx + 1));
        const themes = round.themes || [];
        let roundQuestionsCount = 0;
        themes.forEach(t => { roundQuestionsCount += (t.questions || []).length; });

        const themesHtml = themes.map((theme, tIdx) => {
            const themeName = theme.name || ('Тема ' + (tIdx + 1));
            const questions = theme.questions || [];

            const questionsHtml = questions.map((q, qIdx) => {
                const cost = q.cost != null ? q.cost : (qIdx + 1) * 100;
                const audioBadge = q.audio ? '<div class="q-audio-badge">🎵 Аудио-вопрос</div>' : '';
                const qText = esc(q.q || '');
                const aText = esc(q.a || '');

                return `
                <div class="question-card" data-q-text="${esc((q.q || '') + ' ' + (q.a || '') + ' ' + themeName).toLowerCase()}">
                  <div class="q-top-row">
                    <span class="q-cost-badge">💰 ${esc(String(cost))} очков</span>
                    <span class="q-num-label">Вопрос #${qIdx + 1}</span>
                  </div>
                  ${audioBadge}
                  <div class="q-text">${qText}</div>
                  <button type="button" class="answer-spoiler-btn" onclick="revealSpoiler(this)">👁️ Показать ответ</button>
                  <div class="answer-box">
                    <span class="answer-label">✅ Ответ:</span>
                    <span class="answer-text">${aText}</span>
                  </div>
                </div>`;
            }).join('\n');

            return `
            <div class="theme-box" data-theme-name="${esc(themeName).toLowerCase()}">
              <div class="theme-header">
                <span class="theme-title">🏷️ ${esc(themeName)}</span>
                <span class="theme-count">${questions.length} вопр.</span>
              </div>
              <div class="questions-grid">
                ${questionsHtml}
              </div>
            </div>`;
        }).join('\n');

        return `
        <section class="round-section" id="round-${rIdx + 1}">
          <div class="round-header">
            <span class="round-title">🏆 ${esc(roundTitle)}</span>
            <span class="round-meta">${roundQuestionsCount} вопр. • ${themes.length} тем</span>
          </div>
          ${themesHtml}
        </section>`;
    }).join('\n');

    const tocHtml = normalizedRounds.length > 1 ? `
    <div class="round-nav">
      <span class="round-nav-title">Раунды:</span>
      ${normalizedRounds.map((r, idx) => {
        const name = r.roundName || ('Раунд ' + (idx + 1));
        return `<a class="round-nav-link" href="#round-${idx + 1}">${esc(name)}</a>`;
      }).join(' ')}
    </div>` : '';

    const safeJsonString = JSON.stringify(normalizedRounds).replace(/<\/script/gi, '<\\/script');

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} — Вопросы и ответы (Quiz U)</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: rgba(30, 41, 59, 0.7);
      --card-border: rgba(255, 255, 255, 0.12);
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #8b5cf6;
      --success: #10b981;
      --success-bg: rgba(16, 185, 129, 0.12);
      --amber: #f59e0b;
      --amber-bg: rgba(245, 158, 11, 0.15);
      --toolbar-bg: rgba(15, 23, 42, 0.85);
      --round-bg: rgba(255, 255, 255, 0.04);
      --theme-bg: rgba(255, 255, 255, 0.03);
    }
    body.light-theme {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --card-border: #e2e8f0;
      --text: #0f172a;
      --text-muted: #64748b;
      --primary: #6d28d9;
      --success: #059669;
      --success-bg: rgba(5, 150, 105, 0.1);
      --amber: #d97706;
      --amber-bg: rgba(217, 119, 6, 0.12);
      --toolbar-bg: rgba(255, 255, 255, 0.95);
      --round-bg: #f1f5f9;
      --theme-bg: #f8fafc;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding-bottom: 60px;
      transition: background 0.2s ease, color 0.2s ease;
    }
    .container {
      max-width: 1040px;
      margin: 0 auto;
      padding: 24px 20px;
    }
    .pack-header {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 26px 24px;
      margin-bottom: 20px;
      backdrop-filter: blur(12px);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
    }
    .brand-row {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--primary);
      margin-bottom: 12px;
    }
    .pack-title {
      font-size: 28px;
      font-weight: 900;
      line-height: 1.25;
      margin-bottom: 10px;
      color: var(--text);
    }
    .pack-desc {
      font-size: 15px;
      color: var(--text-muted);
      line-height: 1.55;
      margin-bottom: 18px;
    }
    .badges-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--card-border);
      color: var(--text);
    }
    body.light-theme .badge {
      background: #f1f5f9;
      border-color: #cbd5e1;
    }
    .badge-diff-easy { background: rgba(16, 185, 129, 0.15); border-color: rgba(16, 185, 129, 0.4); color: #34d399; }
    .badge-diff-medium { background: rgba(59, 130, 246, 0.15); border-color: rgba(59, 130, 246, 0.4); color: #60a5fa; }
    .badge-diff-hard { background: rgba(245, 158, 11, 0.15); border-color: rgba(245, 158, 11, 0.4); color: #fbbf24; }
    .badge-diff-expert { background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.4); color: #f87171; }

    .toolbar-sticky {
      position: sticky;
      top: 12px;
      z-index: 100;
      background: var(--toolbar-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 12px 16px;
      margin-bottom: 24px;
      backdrop-filter: blur(14px);
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
    }
    .search-box {
      flex: 1 1 240px;
      position: relative;
    }
    .search-input {
      width: 100%;
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid var(--card-border);
      color: var(--text);
      font-size: 14.5px;
      padding: 9px 14px 9px 36px;
      border-radius: 10px;
      outline: none;
      transition: border-color 0.15s ease;
    }
    body.light-theme .search-input {
      background: #ffffff;
      border-color: #cbd5e1;
    }
    .search-input:focus {
      border-color: var(--primary);
    }
    .search-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 14px;
      opacity: 0.6;
      pointer-events: none;
    }
    .btn-group {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--card-border);
      color: var(--text);
      font-size: 13.5px;
      font-weight: 600;
      padding: 8px 14px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
      user-select: none;
    }
    body.light-theme .btn {
      background: #ffffff;
      border-color: #cbd5e1;
    }
    .btn:hover {
      background: rgba(255, 255, 255, 0.16);
      transform: translateY(-1px);
    }
    body.light-theme .btn:hover {
      background: #f1f5f9;
    }

    .round-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 24px;
      align-items: center;
    }
    .round-nav-title {
      font-size: 13px;
      color: var(--text-muted);
      font-weight: 700;
      text-transform: uppercase;
      margin-right: 4px;
    }
    .round-nav-link {
      color: var(--text);
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 8px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      transition: all 0.15s ease;
    }
    .round-nav-link:hover {
      background: var(--primary);
      color: #ffffff;
      border-color: var(--primary);
    }

    .round-section {
      background: var(--round-bg);
      border: 1px solid var(--card-border);
      border-radius: 18px;
      padding: 22px 20px;
      margin-bottom: 28px;
    }
    .round-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--card-border);
    }
    .round-title {
      font-size: 21px;
      font-weight: 800;
      color: var(--text);
    }
    .round-meta {
      font-size: 13.5px;
      color: var(--text-muted);
      font-weight: 600;
    }

    .theme-box {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 18px;
      margin-bottom: 16px;
    }
    .theme-box:last-child {
      margin-bottom: 0;
    }
    .theme-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
      padding-bottom: 10px;
      border-bottom: 1px dashed var(--card-border);
    }
    .theme-title {
      font-size: 17px;
      font-weight: 700;
      color: var(--primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .theme-count {
      font-size: 12.5px;
      color: var(--text-muted);
      font-weight: 600;
    }

    .questions-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
    }
    .question-card {
      background: var(--theme-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 14px 16px;
      transition: all 0.15s ease;
    }
    .question-card:hover {
      border-color: rgba(255, 255, 255, 0.25);
    }
    body.light-theme .question-card:hover {
      border-color: #cbd5e1;
    }
    .q-top-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .q-cost-badge {
      display: inline-flex;
      align-items: center;
      font-size: 13px;
      font-weight: 800;
      color: var(--amber);
      background: var(--amber-bg);
      border: 1px solid rgba(245, 158, 11, 0.35);
      padding: 3px 10px;
      border-radius: 8px;
    }
    .q-num-label {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 600;
    }
    .q-text {
      font-size: 16px;
      font-weight: 600;
      color: var(--text);
      line-height: 1.5;
      margin-bottom: 10px;
      white-space: pre-wrap;
    }
    .q-audio-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: var(--primary);
      margin-bottom: 8px;
      font-weight: 600;
    }

    .answer-box {
      background: var(--success-bg);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-left: 4px solid var(--success);
      border-radius: 8px;
      padding: 10px 14px;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      transition: all 0.2s ease;
    }
    .answer-label {
      font-size: 12.5px;
      font-weight: 800;
      color: var(--success);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      white-space: nowrap;
      margin-top: 1px;
    }
    .answer-text {
      font-size: 15.5px;
      font-weight: 600;
      color: var(--text);
      line-height: 1.45;
    }

    body.answers-hidden .answer-box {
      display: none;
    }
    body.answers-hidden .answer-spoiler-btn {
      display: inline-flex;
    }
    .answer-spoiler-btn {
      display: none;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 700;
      color: var(--success);
      background: var(--success-bg);
      border: 1px dashed var(--success);
      border-radius: 8px;
      padding: 6px 12px;
      cursor: pointer;
      user-select: none;
      transition: all 0.15s ease;
    }
    .answer-spoiler-btn:hover {
      background: rgba(16, 185, 129, 0.2);
    }
    .answer-box.spoiler-revealed {
      display: flex !important;
      margin-top: 8px;
      animation: fadeIn 0.2s ease;
    }
    .answer-spoiler-btn.spoiler-revealed-btn {
      display: none !important;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .question-card.search-hidden,
    .theme-box.search-hidden,
    .round-section.search-hidden {
      display: none !important;
    }
    .search-stats-bar {
      width: 100%;
      font-size: 13px;
      color: var(--text-muted);
      font-weight: 600;
      display: none;
      margin-top: 4px;
    }

    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: #1e293b;
      border: 1px solid var(--success);
      color: #ffffff;
      padding: 12px 24px;
      border-radius: 12px;
      font-size: 14.5px;
      font-weight: 600;
      box-shadow: 0 10px 30px rgba(0,0,0,0.4);
      z-index: 1000;
      opacity: 0;
      pointer-events: none;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }

    @media print {
      body {
        background: #ffffff !important;
        color: #000000 !important;
        padding: 0 !important;
      }
      .container {
        max-width: 100% !important;
        padding: 0 !important;
      }
      .toolbar-sticky, .round-nav, .toast, .answer-spoiler-btn {
        display: none !important;
      }
      .pack-header {
        box-shadow: none !important;
        border: 1px solid #ccc !important;
        background: #ffffff !important;
        padding: 16px !important;
        margin-bottom: 16px !important;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .round-section {
        background: #ffffff !important;
        border: 1px solid #ddd !important;
        margin-bottom: 20px !important;
        padding: 14px !important;
      }
      .theme-box {
        background: #ffffff !important;
        border: 1px solid #eee !important;
        padding: 12px !important;
        margin-bottom: 12px !important;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .question-card {
        background: #ffffff !important;
        border: 1px solid #eee !important;
        margin-bottom: 8px !important;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .answer-box {
        display: flex !important;
        background: #f0fdf4 !important;
        border-color: #86efac !important;
        border-left: 3px solid #16a34a !important;
        color: #000000 !important;
      }
      .answer-text, .q-text, .pack-title {
        color: #000000 !important;
      }
      .badge {
        background: #f3f4f6 !important;
        color: #111827 !important;
        border-color: #d1d5db !important;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="pack-header">
      <div class="brand-row">
        <span>🎮 Quiz U</span>
        <span>•</span>
        <span>Просмотр вопросов и ответов</span>
      </div>
      <h1 class="pack-title">${esc(title)}</h1>
      ${description ? `<p class="pack-desc">${esc(description)}</p>` : ''}
      <div class="badges-row">
        <span class="badge">${esc(categoryIcon)} ${esc(category)}</span>
        <span class="badge badge-diff-${esc(difficulty)}">⭐ ${esc(difficultyLabel)}</span>
        <span class="badge">⏱️ ${normalizedRounds.length} ${normalizedRounds.length === 1 ? 'раунд' : 'раунда'}</span>
        <span class="badge">❓ ${totalQuestions} вопросов</span>
        <span class="badge">🏷️ ${totalThemes} тем</span>
        ${p.hasCat ? '<span class="badge">🐱 Кот в мешке</span>' : ''}
        ${p.hasAuction ? '<span class="badge">💰 Аукцион</span>' : ''}
      </div>
    </header>

    <div class="toolbar-sticky">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input type="search" class="search-input" id="search-input" placeholder="Поиск по вопросам, ответам и темам..." oninput="filterQuestions(this.value)">
      </div>
      <div class="btn-group">
        <button type="button" class="btn" id="btn-toggle-answers" onclick="toggleAnswers()">👁️ <span id="toggle-answers-text">Скрыть ответы</span></button>
        <button type="button" class="btn" onclick="window.print()">🖨️ Печать / PDF</button>
        <button type="button" class="btn" onclick="toggleTheme()">🌓 Тема</button>
        <button type="button" class="btn" onclick="copyPlainQa()">📋 Копировать текст</button>
        <button type="button" class="btn" onclick="downloadRawJson()">💾 JSON</button>
      </div>
      <div class="search-stats-bar" id="search-stats-bar"></div>
    </div>

    ${tocHtml}

    <main id="pack-content">
      ${roundsHtml}
    </main>
  </div>

  <div class="toast" id="toast"></div>

  <script type="application/json" id="pack-raw-json">
${safeJsonString}
  </script>

  <script>
    let areAnswersHidden = false;

    function toggleAnswers() {
      areAnswersHidden = !areAnswersHidden;
      document.body.classList.toggle('answers-hidden', areAnswersHidden);
      const label = document.getElementById('toggle-answers-text');
      if (label) {
        label.textContent = areAnswersHidden ? 'Показать все ответы' : 'Скрыть ответы';
      }
      if (!areAnswersHidden) {
        document.querySelectorAll('.spoiler-revealed').forEach(el => el.classList.remove('spoiler-revealed'));
        document.querySelectorAll('.spoiler-revealed-btn').forEach(el => el.classList.remove('spoiler-revealed-btn'));
      }
    }

    function revealSpoiler(btn) {
      const card = btn.closest('.question-card');
      if (!card) return;
      const box = card.querySelector('.answer-box');
      if (box) {
        box.classList.add('spoiler-revealed');
        btn.classList.add('spoiler-revealed-btn');
      }
    }

    function toggleTheme() {
      document.body.classList.toggle('light-theme');
    }

    function filterQuestions(rawQuery) {
      const query = (rawQuery || '').trim().toLowerCase();
      const statsBar = document.getElementById('search-stats-bar');
      const cards = document.querySelectorAll('.question-card');
      const themes = document.querySelectorAll('.theme-box');
      const rounds = document.querySelectorAll('.round-section');

      if (!query) {
        cards.forEach(c => c.classList.remove('search-hidden'));
        themes.forEach(t => t.classList.remove('search-hidden'));
        rounds.forEach(r => r.classList.remove('search-hidden'));
        if (statsBar) statsBar.style.display = 'none';
        return;
      }

      let matches = 0;
      cards.forEach(card => {
        const text = card.getAttribute('data-q-text') || '';
        const isMatch = text.includes(query);
        if (isMatch) matches++;
        card.classList.toggle('search-hidden', !isMatch);
      });

      themes.forEach(theme => {
        const hasVisible = theme.querySelectorAll('.question-card:not(.search-hidden)').length > 0;
        theme.classList.toggle('search-hidden', !hasVisible);
      });

      rounds.forEach(round => {
        const hasVisible = round.querySelectorAll('.theme-box:not(.search-hidden)').length > 0;
        round.classList.toggle('search-hidden', !hasVisible);
      });

      if (statsBar) {
        statsBar.style.display = 'block';
        statsBar.textContent = 'Найдено вопросов: ' + matches + ' из ' + cards.length;
      }
    }

    function showToast(text) {
      const toast = document.getElementById('toast');
      if (!toast) return;
      toast.textContent = text;
      toast.classList.add('show');
      setTimeout(() => { toast.classList.remove('show'); }, 2500);
    }

    function copyPlainQa() {
      let output = '${esc(title).replace(/'/g, "\\'")}\\n\\n';
      const rounds = document.querySelectorAll('.round-section');
      rounds.forEach(r => {
        const rTitle = r.querySelector('.round-title')?.textContent?.trim() || '';
        output += '=== ' + rTitle + ' ===\\n\\n';
        const themes = r.querySelectorAll('.theme-box');
        themes.forEach(t => {
          const tTitle = t.querySelector('.theme-title')?.textContent?.trim() || '';
          output += '-- ' + tTitle + ' --\\n';
          const cards = t.querySelectorAll('.question-card');
          cards.forEach((c, idx) => {
            const cost = c.querySelector('.q-cost-badge')?.textContent?.trim() || '';
            const q = c.querySelector('.q-text')?.textContent?.trim() || '';
            const a = c.querySelector('.answer-text')?.textContent?.trim() || '';
            output += (idx + 1) + '. [' + cost + '] ' + q + '\\n   Ответ: ' + a + '\\n\\n';
          });
        });
      });

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(output).then(() => {
          showToast('✅ Список вопросов и ответов скопирован!');
        }).catch(() => {
          fallbackCopy(output);
        });
      } else {
        fallbackCopy(output);
      }
    }

    function fallbackCopy(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        showToast('✅ Список вопросов и ответов скопирован!');
      } catch (e) {
        showToast('Не удалось скопировать в буфер');
      }
      document.body.removeChild(ta);
    }

    function downloadRawJson() {
      const script = document.getElementById('pack-raw-json');
      if (!script) return;
      const blob = new Blob([script.textContent.trim()], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '${esc(title).replace(/'/g, "\\'")}.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  </script>
</body>
</html>`;
}


async function downloadPackById(packId) {
    const packs = window.AVAILABLE_PACKS || [];
    const pack = packs.find(p => p.id === packId);
    if (!pack) return;

    try {
        let rounds = pack.rounds;
        if (!rounds || rounds.length === 0) {
            rounds = await loadPackJsonData(pack);
        }
        const htmlDoc = generatePackHtmlDocument(pack, rounds);
        const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeTitle = (pack.title || 'quiz_pack').replace(/[\\/:*?"<>|]/g, '_').trim();
        a.download = safeTitle + '.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        if (typeof showSystemModal === 'function') {
            showSystemModal('Файл пака', `Файл пака расположен на диске по пути:\n${pack.filePath || 'паки вопросов/'}`);
        } else {
            alert('Файл пака: ' + (pack.filePath || pack.title));
        }
    }
}

// Global exports on window
window.openPrepareQuestionsChoice = openPrepareQuestionsChoice;
window.openCustomPackEditor = openCustomPackEditor;
window.openPacksCatalog = openPacksCatalog;
window.handleCatalogFiltersChanged = handleCatalogFiltersChanged;
window.clearCatalogSearch = clearCatalogSearch;
window.setCatalogCategory = setCatalogCategory;
window.setCatalogDiff = setCatalogDiff;
window.setCatalogDifficulty = setCatalogDifficulty;
window.setCatalogRounds = setCatalogRounds;
window.resetAllCatalogFilters = resetAllCatalogFilters;
window.goToCatalogPage = goToCatalogPage;
window.renderCatalogPacks = renderCatalogPacks;
window.selectPackToPlay = selectPackToPlay;
window.previewPack = previewPack;
window.closePackPreviewModal = closePackPreviewModal;
window.downloadPackById = downloadPackById;
window.generatePackHtmlDocument = generatePackHtmlDocument;
window.loadPackJsonData = loadPackJsonData;
window.ensureCatalogLoaded = ensureCatalogLoaded;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generatePackHtmlDocument,
        downloadPackById,
        loadPackJsonData
    };
}
