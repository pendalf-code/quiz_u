/**
 * Quiz U — стилизованный выпадающий список поверх нативного <select>.
 *
 * Нативный список у <select> рисует ОС (белый, с синей подсветкой) и не стилизуется в WebView,
 * поэтому каждый `select.catalog-sort-dropdown | .catalog-styled-select | .setting-dropdown-field`
 * получает кнопку-триггер и всплывающее меню в теме игры. Сам <select> остаётся в DOM и
 * хранит значение: game.js / catalog.js читают и пишут `.value`, слушают `change` как раньше.
 * Меню рендерится в <body> (position: fixed), чтобы его не обрезали модалки с overflow/transform.
 * Клавиатура: ↑/↓/Home/End, Enter/Space, Esc, Tab; геймпад — через GamepadManager.
 */
(function () {
    'use strict';

    const SELECTOR = 'select.catalog-sort-dropdown, select.catalog-styled-select, select.setting-dropdown-field';
    const valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    const indexDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');

    let openState = null; // { select, trigger, popup, activeIdx }
    let uid = 0;

    function optionsOf(select) {
        return Array.from(select.options || []);
    }

    function syncTrigger(select) {
        const trigger = select._qsTrigger;
        if (!trigger) return;
        const opt = select.options[select.selectedIndex];
        const label = trigger.querySelector('.qs-trigger-label');
        if (label) label.textContent = opt ? opt.textContent.trim() : '';
        trigger.disabled = Boolean(select.disabled);
        trigger.title = opt ? opt.textContent.trim() : '';
    }

    function close(focusTrigger) {
        if (!openState) return;
        const {trigger, popup} = openState;
        openState = null;
        trigger.setAttribute('aria-expanded', 'false');
        trigger.classList.remove('is-open');
        if (popup && popup.parentNode) popup.parentNode.removeChild(popup);
        window.removeEventListener('resize', onViewportChange);
        window.removeEventListener('scroll', onViewportChange, true);
        if (focusTrigger) {
            try {
                trigger.focus({preventScroll: true});
            } catch (e) {
                trigger.focus();
            }
            if (window.gamepadManager && typeof window.gamepadManager.setFocus === 'function'
                && window.gamepadManager.focusedElement) {
                window.gamepadManager.setFocus(trigger);
            }
        }
    }

    function choose(select, idx) {
        const changed = select.selectedIndex !== idx;
        indexDesc.set.call(select, idx);
        syncTrigger(select);
        close(true);
        if (changed) {
            select.dispatchEvent(new Event('input', {bubbles: true}));
            select.dispatchEvent(new Event('change', {bubbles: true}));
        }
    }

    function setActive(idx, scroll) {
        if (!openState) return;
        const items = openState.popup.querySelectorAll('.qs-option');
        if (!items.length) return;
        const next = Math.max(0, Math.min(items.length - 1, idx));
        items.forEach((el, i) => el.classList.toggle('is-active', i === next));
        openState.activeIdx = next;
        openState.trigger.setAttribute('aria-activedescendant', items[next].id);
        if (scroll) items[next].scrollIntoView({block: 'nearest'});
    }

    function position() {
        if (!openState) return;
        const {trigger, popup} = openState;
        const r = trigger.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const gap = 6;
        const margin = 8;
        const width = Math.min(Math.max(r.width, 200), vw - margin * 2);
        popup.style.width = width + 'px';
        popup.style.left = Math.max(margin, Math.min(r.left, vw - width - margin)) + 'px';
        const below = vh - r.bottom - gap - margin;
        const above = r.top - gap - margin;
        popup.style.maxHeight = '';
        const natural = popup.scrollHeight;
        const openUp = natural > below && above > below;
        const room = Math.max(120, openUp ? above : below);
        popup.style.maxHeight = Math.min(natural, room, 360) + 'px';
        popup.classList.toggle('is-up', openUp);
        if (openUp) {
            popup.style.top = '';
            popup.style.bottom = (vh - r.top + gap) + 'px';
        } else {
            popup.style.bottom = '';
            popup.style.top = (r.bottom + gap) + 'px';
        }
    }

    function onViewportChange(e) {
        if (!openState) return;
        // Scrolling inside the menu itself must not close it
        if (e && e.type === 'scroll' && openState.popup.contains(e.target)) return;
        close(false);
    }

    function open(select) {
        if (select.disabled) return;
        if (openState && openState.select === select) {
            close(true);
            return;
        }
        close(false);
        const trigger = select._qsTrigger;
        const popup = document.createElement('div');
        popup.className = 'qs-popup';
        popup.id = trigger.getAttribute('aria-controls');
        popup.setAttribute('role', 'listbox');

        optionsOf(select).forEach((opt, idx) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'qs-option';
            item.id = popup.id + '-opt-' + idx;
            item.tabIndex = -1;
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', idx === select.selectedIndex ? 'true' : 'false');
            if (idx === select.selectedIndex) item.classList.add('is-selected');
            item.disabled = Boolean(opt.disabled);
            item.innerHTML = '<span class="qs-option-check" aria-hidden="true"></span><span class="qs-option-label"></span>';
            item.querySelector('.qs-option-label').textContent = opt.textContent.trim();
            item.addEventListener('mousedown', ev => ev.preventDefault()); // keep focus on the trigger
            item.addEventListener('click', () => choose(select, idx));
            item.addEventListener('mousemove', () => {
                if (openState && openState.activeIdx !== idx) setActive(idx, false);
            });
            popup.appendChild(item);
        });

        document.body.appendChild(popup);
        openState = {select, trigger, popup, activeIdx: select.selectedIndex};
        trigger.setAttribute('aria-expanded', 'true');
        trigger.classList.add('is-open');
        position();
        setActive(Math.max(0, select.selectedIndex), true);
        window.addEventListener('resize', onViewportChange);
        window.addEventListener('scroll', onViewportChange, true);

        // Gamepad: move its focus into the menu
        const gm = window.gamepadManager;
        if (gm && gm.focusedElement && typeof gm.setFocus === 'function') {
            const sel = popup.querySelector('.qs-option.is-selected') || popup.querySelector('.qs-option');
            if (sel) gm.setFocus(sel);
        }
    }

    function onTriggerKey(e, select) {
        const isOpen = openState && openState.select === select;
        const count = select.options.length;
        switch (e.key) {
            case 'ArrowDown':
            case 'ArrowUp': {
                e.preventDefault();
                const step = e.key === 'ArrowDown' ? 1 : -1;
                if (!isOpen) {
                    open(select);
                    return;
                }
                setActive(openState.activeIdx + step, true);
                return;
            }
            case 'Home':
            case 'End':
                if (isOpen) {
                    e.preventDefault();
                    setActive(e.key === 'Home' ? 0 : count - 1, true);
                }
                return;
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (isOpen) choose(select, openState.activeIdx);
                else open(select);
                return;
            case 'Escape':
                if (isOpen) {
                    e.preventDefault();
                    e.stopPropagation();
                    close(true);
                }
                return;
            case 'Tab':
                if (isOpen) close(false);
                return;
            default:
        }
    }

    function enhance(select) {
        if (!select || select._qsTrigger || select.multiple) return;
        uid += 1;
        const wrap = document.createElement('div');
        wrap.className = 'qs-wrap';

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'qs-trigger ' + select.className;
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('aria-controls', 'qs-popup-' + uid);
        trigger.innerHTML = '<span class="qs-trigger-label"></span>';
        if (select.id) {
            const label = document.querySelector('label[for="' + select.id + '"]');
            if (label) {
                if (!label.id) label.id = 'qs-label-' + uid;
                trigger.setAttribute('aria-labelledby', label.id);
            }
        }

        select.parentNode.insertBefore(wrap, select);
        wrap.appendChild(select);
        wrap.appendChild(trigger);
        select.classList.add('qs-native');
        select.tabIndex = -1;
        select.setAttribute('aria-hidden', 'true');
        select._qsTrigger = trigger;

        trigger.addEventListener('click', () => open(select));
        trigger.addEventListener('keydown', e => onTriggerKey(e, select));
        // <label for="..."> focuses the hidden select: hand the focus to the trigger
        select.addEventListener('focus', () => trigger.focus());
        select.addEventListener('change', () => syncTrigger(select));

        // Programmatic `.value = ...` / `.selectedIndex = ...` (game.js, catalog.js) updates the trigger
        Object.defineProperty(select, 'value', {
            configurable: true,
            get() {
                return valueDesc.get.call(this);
            },
            set(v) {
                valueDesc.set.call(this, v);
                syncTrigger(this);
            }
        });
        Object.defineProperty(select, 'selectedIndex', {
            configurable: true,
            get() {
                return indexDesc.get.call(this);
            },
            set(v) {
                indexDesc.set.call(this, v);
                syncTrigger(this);
            }
        });

        // Options replaced or `disabled` toggled
        try {
            new MutationObserver(() => syncTrigger(select))
                .observe(select, {childList: true, subtree: true, attributes: true, attributeFilter: ['disabled']});
        } catch (e) {
        }
        syncTrigger(select);
    }

    function enhanceAll(root) {
        (root || document).querySelectorAll(SELECTOR).forEach(enhance);
    }

    document.addEventListener('mousedown', e => {
        if (!openState) return;
        if (openState.popup.contains(e.target) || openState.trigger.contains(e.target)) return;
        close(false);
    }, true);

    document.addEventListener('keydown', e => {
        if (openState && e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close(true);
        }
    }, true);

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => enhanceAll());
    else enhanceAll();

    window.QuizSelect = {
        enhance,
        enhanceAll,
        close: focusTrigger => close(Boolean(focusTrigger)),
        isOpen: () => Boolean(openState),
        getOptions: () => (openState ? Array.from(openState.popup.querySelectorAll('.qs-option:not([disabled])')) : [])
    };
})();
