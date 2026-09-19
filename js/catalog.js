/**
 * Question Packs Catalog Module
 * Provides rich UI for browsing, filtering, searching, previewing, and loading
 * over 200 ready-to-play Jeopardy question packs.
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

function openPacksCatalog() {
    if (typeof showSubScreen === 'function') {
        showSubScreen('sub-menu-packs-catalog');
    }
    initCatalogFilters();
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
                    ${pack.hasCatInBag ? '<span class="pack-mini-pill pill-cat">🐱 Кот</span>' : ''}
                    ${pack.hasAuction ? '<span class="pack-mini-pill pill-auction">💰 Аукцион</span>' : ''}
                </div>

                <div class="pack-card-desc">${pack.description}</div>

                <div class="pack-card-themes-box">
                    <div class="pack-themes-title">📌 Темы вопросов:</div>
                    <div class="pack-themes-chips-list">${themesChipsHtml}</div>
                </div>

                <div class="pack-card-actions">
                    <button type="button" class="btn btn-pack-play" onclick="selectPackToPlay('${pack.id}')" title="Начать викторину с этим паком">▶️ Играть</button>
                    <button type="button" class="btn btn-pack-preview" onclick="previewPack('${pack.id}')" title="Посмотреть темы и вопросы">👁️ Темы</button>
                    <button type="button" class="btn btn-pack-download" onclick="downloadPackById('${pack.id}')" title="Скачать файл пака (.json)">📥 .JSON</button>
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
    if (!pack || !pack.rounds) return [];
    if (Array.isArray(pack.rounds)) return pack.rounds;
    if (typeof pack.rounds === 'object') {
        if (Array.isArray(pack.rounds.value)) return pack.rounds.value;
        if (Array.isArray(pack.rounds.rounds)) return pack.rounds.rounds;
        if (pack.rounds.themes && Array.isArray(pack.rounds.themes)) return [pack.rounds];
    }
    return [];
}

function selectPackToPlay(packId) {
    const packs = window.AVAILABLE_PACKS || [];
    const pack = packs.find(p => p.id === packId);
    if (!pack) {
        if (typeof showSystemModal === 'function') {
            showSystemModal('Ошибка', 'Выбранный пак не найден.');
        }
        return;
    }

    try {
        // Close modal if open
        closePackPreviewModal();

        // Clear previous in-progress game save
        if (typeof clearGameState === 'function') {
            clearGameState();
        } else {
            localStorage.removeItem('quiz_save_state');
        }

        // Set game data
        if (typeof window.setGameData === 'function') {
            const roundsData = getPackRoundsArray(pack);
            window.setGameData(roundsData);
        } else {
            const roundsData = getPackRoundsArray(pack);
            localStorage.setItem('jeopardy_pack', JSON.stringify(roundsData));
            const editor = document.getElementById('json-editor');
            if (editor) editor.value = JSON.stringify(roundsData, null, 4);
        }

        if (typeof currentRoundIndex !== 'undefined') {
            currentRoundIndex = 0;
        }

        if (typeof showTeamSetup === 'function') {
            showTeamSetup();
        } else if (typeof showSubScreen === 'function') {
            showSubScreen('team-setup-container');
        }

        if (typeof showSystemModal === 'function') {
            showSystemModal('Пак загружен! 🎉', `Пак «${pack.title}» готов к игре! Выберите команды и приступайте к викторине.`);
        }
    } catch (err) {
        console.error('Error loading pack:', err);
        if (typeof showSystemModal === 'function') {
            showSystemModal('Ошибка', 'Не удалось загрузить пак: ' + err.message);
        }
    }
}

function previewPack(packId) {
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
        roundsContainer.innerHTML = '';

        const packRounds = getPackRoundsArray(pack);
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

function downloadPackById(packId) {
    const packs = window.AVAILABLE_PACKS || [];
    const pack = packs.find(p => p.id === packId);
    if (!pack || !pack.rounds) {
        if (typeof showSystemModal === 'function') {
            showSystemModal('Ошибка', 'Данные пака недоступны для скачивания.');
        }
        return;
    }

    const jsonStr = JSON.stringify(pack.rounds, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (pack.title || 'pack').replace(/[^a-zA-Zа-яА-Я0-9_-]/g, '_') + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
