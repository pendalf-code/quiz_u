const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const CdnManager = require('../js/core/CdnManager');
const { auditMediaFiles, generateCdnManifest, formatBytes } = require('../scripts/optimize_media');

test('CdnManager: Default local resolution when disabled', () => {
    const cdn = new CdnManager.CdnManager({ enabled: false });
    assert.equal(cdn.isEnabled(), false);

    assert.equal(cdn.resolve('video/cat.mp4'), 'assets/video/cat.mp4');
    assert.equal(cdn.resolve('music/intro.mp3'), 'assets/music/intro.mp3');
    assert.equal(cdn.resolve('q_img/test.jpg'), 'assets/q_img/test.jpg');
    assert.equal(cdn.resolve('assets/video/cat.mp4'), 'assets/video/cat.mp4');
    assert.equal(cdn.resolve('https://external.com/video.mp4'), 'https://external.com/video.mp4');
    assert.equal(cdn.resolve('data:image/png;base64,...'), 'data:image/png;base64,...');
});

test('CdnManager: Remote resolution when CDN base URL is configured', () => {
    const cdn = new CdnManager.CdnManager({
        cdnBaseUrl: 'https://r2.quizu.app',
        enabled: true
    });
    assert.equal(cdn.isEnabled(), true);
    assert.equal(cdn.getCdnBaseUrl(), 'https://r2.quizu.app');

    assert.equal(cdn.resolve('video/cat.mp4'), 'https://r2.quizu.app/assets/video/cat.mp4');
    assert.equal(cdn.resolve('assets/music/track.mp3'), 'https://r2.quizu.app/assets/music/track.mp3');
    assert.equal(cdn.resolve('https://other.com/media.mp4'), 'https://other.com/media.mp4');
});

test('CdnManager: Fallback mechanism when CDN resource fails', () => {
    const cdn = new CdnManager.CdnManager({
        cdnBaseUrl: 'https://cdn.test.com',
        enabled: true,
        autoFallback: true
    });

    const pair = cdn.resolvePair('video/mov.mp4');
    assert.equal(pair.primary, 'https://cdn.test.com/assets/video/mov.mp4');
    assert.equal(pair.fallback, 'assets/video/mov.mp4');
    assert.equal(pair.isCdn, true);

    // Mock HTML media element
    let registeredErrorHandler = null;
    const mockAudio = {
        src: '',
        addEventListener: (event, handler) => {
            if (event === 'error') registeredErrorHandler = handler;
        },
        removeEventListener: (event, handler) => {
            if (event === 'error' && registeredErrorHandler === handler) {
                registeredErrorHandler = null;
            }
        }
    };

    cdn.attachFallback(mockAudio, 'video/mov.mp4');
    assert.equal(mockAudio.src, 'https://cdn.test.com/assets/video/mov.mp4');
    assert.ok(registeredErrorHandler !== null);

    // Trigger error event -> should fallback to local
    registeredErrorHandler();
    assert.equal(mockAudio.src, 'assets/video/mov.mp4');

    // Next time resolve is called for this URL, it should automatically use fallback
    assert.equal(cdn.resolve('video/mov.mp4'), 'assets/video/mov.mp4');

    // Clear failed cache
    cdn.clearFailedUrls();
    assert.equal(cdn.resolve('video/mov.mp4'), 'https://cdn.test.com/assets/video/mov.mp4');
});

test('optimize_media script: auditMediaFiles and manifest generation', () => {
    const report = auditMediaFiles();
    assert.ok(typeof report.totalFiles === 'number');
    assert.ok(report.totalFiles > 0, 'Finds assets in assets/ folder');
    assert.ok(report.totalSizeBytes > 0);
    assert.ok(typeof report.totalSizeFormatted === 'string');
    assert.ok(Array.isArray(report.warnings));

    const manifest = generateCdnManifest('https://test-cdn.quizu.app');
    assert.equal(manifest.cdnBaseUrl, 'https://test-cdn.quizu.app');
    assert.equal(manifest.totalFiles, report.totalFiles);
    assert.ok(Object.keys(manifest.assets).length > 0);

    const firstAssetKey = Object.keys(manifest.assets)[0];
    assert.ok(manifest.assets[firstAssetKey].cdnUrl.startsWith('https://test-cdn.quizu.app/'));

    assert.equal(formatBytes(500), '500 B');
    assert.equal(formatBytes(2048), '2.0 KB');
    assert.equal(formatBytes(2 * 1024 * 1024), '2.00 MB');
});
