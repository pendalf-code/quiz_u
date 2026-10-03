/**
 * CdnManager.js
 * Менеджер управления и разрешения медиаресурсов (CDN / Cloudflare R2 / Local Fallback)
 * Поддерживает работу в Browser (window.CdnManager) и Node.js (CommonJS / ES modules).
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.CdnManager = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    class CdnManager {
        /**
         * @param {Object} options
         * @param {string} [options.cdnBaseUrl] - Базовый URL CDN (например https://r2.quizu.app или https://pub-xxx.r2.dev)
         * @param {string} [options.localBaseUrl] - Базовый локальный префикс (по умолчанию 'assets/')
         * @param {boolean} [options.enabled] - Включено ли перенаправление на CDN
         * @param {boolean} [options.autoFallback] - Автоматический fallback на локальный сервер при ошибке сети
         */
        constructor(options = {}) {
            this._cdnBaseUrl = (options.cdnBaseUrl || '').replace(/\/+$/, '');
            this._localBaseUrl = (options.localBaseUrl !== undefined ? options.localBaseUrl : 'assets/').replace(/\/+$/, '') + '/';
            if (this._localBaseUrl === '/') this._localBaseUrl = '';
            
            // Если в браузере есть сохраненный конфиг в localStorage
            if (!this._cdnBaseUrl && typeof localStorage !== 'undefined') {
                try {
                    const savedCdn = localStorage.getItem('quiz_cdn_base_url');
                    if (savedCdn) {
                        this._cdnBaseUrl = savedCdn.trim().replace(/\/+$/, '');
                    }
                } catch (e) {}
            }

            this._enabled = options.enabled !== undefined ? !!options.enabled : !!this._cdnBaseUrl;
            this._autoFallback = options.autoFallback !== undefined ? !!options.autoFallback : true;
            this._failedCdnUrls = new Set();
        }

        /**
         * Установить базовый URL CDN
         * @param {string} url
         */
        setCdnBaseUrl(url) {
            this._cdnBaseUrl = (url || '').trim().replace(/\/+$/, '');
            this._enabled = !!this._cdnBaseUrl;
            if (typeof localStorage !== 'undefined') {
                try {
                    if (this._cdnBaseUrl) {
                        localStorage.setItem('quiz_cdn_base_url', this._cdnBaseUrl);
                    } else {
                        localStorage.removeItem('quiz_cdn_base_url');
                    }
                } catch (e) {}
            }
        }

        /**
         * Получить текущий URL CDN
         * @returns {string}
         */
        getCdnBaseUrl() {
            return this._cdnBaseUrl;
        }

        /**
         * Включить / выключить использование CDN
         * @param {boolean} enabled
         */
        setEnabled(enabled) {
            this._enabled = !!enabled;
        }

        /**
         * Проверить, активен ли CDN
         * @returns {boolean}
         */
        isEnabled() {
            return this._enabled && !!this._cdnBaseUrl;
        }

        /**
         * Нормализует локальный путь (добавляет префикс 'assets/' при необходимости и преобразует слэши)
         * @param {string} rawPath
         * @returns {string}
         */
        normalizeLocalPath(rawPath) {
            if (!rawPath || typeof rawPath !== 'string') return '';
            const trimmed = rawPath.trim().replace(/\\/g, '/');
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || 
                trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
                return trimmed;
            }
            if (trimmed.startsWith('assets/')) {
                return trimmed;
            }
            if (/^(music|video|q_img|a_img)\//.test(trimmed)) {
                return (this._localBaseUrl || 'assets/') + trimmed;
            }
            return trimmed;
        }

        /**
         * Разрешает путь к медиаресурсу (с приоритетом CDN при активности)
         * @param {string} rawPath - Исходный путь или URL
         * @returns {string} - Разрешенный URL
         */
        resolve(rawPath) {
            if (!rawPath || typeof rawPath !== 'string') return rawPath;
            const trimmed = rawPath.trim().replace(/\\/g, '/');

            // Если путь уже является внешним URL или inline данными - возвращаем без изменений
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || 
                trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
                return trimmed;
            }

            const localPath = this.normalizeLocalPath(trimmed);

            // Если CDN не включен или не настроен - отдаем локальный путь
            if (!this.isEnabled()) {
                return localPath;
            }

            // Если этот URL ранее выдал ошибку загрузки с CDN - используем локальный fallback
            if (this._failedCdnUrls.has(localPath)) {
                return localPath;
            }

            // Формируем CDN-ссылку
            // Удаляем возможные ведущие './' или '/'
            const cleanRelPath = localPath.replace(/^(\.\/|\/)/, '');
            return `${this._cdnBaseUrl}/${cleanRelPath}`;
        }

        /**
         * Возвращает объект с основным и резервным URL
         * @param {string} rawPath
         * @returns {{ primary: string, fallback: string, isCdn: boolean }}
         */
        resolvePair(rawPath) {
            const localPath = this.normalizeLocalPath(rawPath);
            const resolved = this.resolve(rawPath);
            const isCdn = resolved !== localPath && resolved.startsWith(this._cdnBaseUrl);

            return {
                primary: resolved,
                fallback: localPath,
                isCdn: isCdn
            };
        }

        /**
         * Привязывает автоматический обработчик fallback ошибки к HTML-элементу (img, audio, video)
         * @param {HTMLElement} mediaElement
         * @param {string} rawPath
         */
        attachFallback(mediaElement, rawPath) {
            if (!mediaElement || typeof mediaElement.addEventListener !== 'function') return;
            const pair = this.resolvePair(rawPath);
            
            mediaElement.src = pair.primary;

            if (pair.isCdn && this._autoFallback) {
                const errorHandler = () => {
                    console.warn(`[CdnManager] CDN load failed for "${pair.primary}", falling back to local: "${pair.fallback}"`);
                    this._failedCdnUrls.add(pair.fallback);
                    mediaElement.removeEventListener('error', errorHandler);
                    mediaElement.src = pair.fallback;
                };
                mediaElement.addEventListener('error', errorHandler, { once: true });
            }
        }

        /**
         * Сбросить кеш упавших ссылок
         */
        clearFailedUrls() {
            this._failedCdnUrls.clear();
        }
    }

    // Экземпляр по умолчанию
    const defaultInstance = new CdnManager();
    defaultInstance.CdnManager = CdnManager;

    return defaultInstance;
}));
