/** Безопасное хранилище настроек и сессий: недоступный localStorage заменяется памятью страницы. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(root);
    } else {
        root.QuizStorage = factory(root);
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const cache = new Map();
    // Неудавшиеся запись и удаление должны перекрывать старое значение в доступном только для чтения storage.
    const pending = new Set();

    return {
        getItem(key) {
            key = String(key);
            if (!pending.has(key)) {
                try {
                    const storage = root.localStorage;
                    if (storage) {
                        const value = storage.getItem(key);
                        if (value === null) cache.delete(key);
                        else cache.set(key, value);
                    }
                } catch (_) {}
            }
            return cache.has(key) ? cache.get(key) : null;
        },
        setItem(key, value) {
            key = String(key);
            value = String(value);
            cache.set(key, value);
            pending.add(key);
            try {
                const storage = root.localStorage;
                if (storage) {
                    storage.setItem(key, value);
                    pending.delete(key);
                }
            } catch (_) {}
        },
        removeItem(key) {
            key = String(key);
            cache.delete(key);
            pending.add(key);
            try {
                const storage = root.localStorage;
                if (storage) {
                    storage.removeItem(key);
                    pending.delete(key);
                }
            } catch (_) {}
        }
    };
}));
