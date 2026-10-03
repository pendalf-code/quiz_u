#!/usr/bin/env node
/**
 * optimize_media.js
 * Скрипт аудита, валидации и оптимизации медиаресурсов викторины для CDN (Cloudflare R2).
 *
 * Возможности:
 * 1. Сканирование папки assets/ (аудио, видео, изображения вопросов/ответов).
 * 2. Проверка размеров файлов и выявление тяжелых ассетов (> 2 МБ для аудио/фото, > 8 МБ для видео).
 * 3. Генерация манифеста ассетов assets/cdn_manifest.json для пакетной выгрузки в Cloudflare R2 / S3.
 * 4. Предоставление рекомендаций по сжатию (ffmpeg для mp3/mp4, cwebp для изображений).
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');
const MANIFEST_PATH = path.join(ASSETS_DIR, 'cdn_manifest.json');

const THRESHOLDS = {
    audioWarningBytes: 2 * 1024 * 1024,      // 2 MB
    imageWarningBytes: 1.5 * 1024 * 1024,    // 1.5 MB
    videoWarningBytes: 8 * 1024 * 1024       // 8 MB
};

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function scanDirRecursive(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            scanDirRecursive(fullPath, fileList);
        } else if (entry.isFile()) {
            fileList.push(fullPath);
        }
    }
    return fileList;
}

function auditMediaFiles(options = {}) {
    const files = scanDirRecursive(ASSETS_DIR);
    const mediaFiles = [];
    let totalSizeBytes = 0;
    const warnings = [];

    const extTypes = {
        '.mp3': 'audio', '.wav': 'audio', '.ogg': 'audio', '.m4a': 'audio',
        '.mp4': 'video', '.webm': 'video', '.mov': 'video',
        '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.svg': 'image', '.gif': 'image'
    };

    for (const filePath of files) {
        if (filePath.endsWith('cdn_manifest.json')) continue;
        const ext = path.extname(filePath).toLowerCase();
        const type = extTypes[ext] || 'other';
        const stats = fs.statSync(filePath);
        const relPath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
        const sizeBytes = stats.size;
        totalSizeBytes += sizeBytes;

        const info = {
            relPath,
            type,
            ext,
            sizeBytes,
            sizeFormatted: formatBytes(sizeBytes)
        };

        if (type === 'audio' && sizeBytes > THRESHOLDS.audioWarningBytes) {
            warnings.push({ ...info, reason: `Аудио превышает ${formatBytes(THRESHOLDS.audioWarningBytes)}. Рекомендуется 128 kbps MP3.` });
        } else if (type === 'video' && sizeBytes > THRESHOLDS.videoWarningBytes) {
            warnings.push({ ...info, reason: `Видео превышает ${formatBytes(THRESHOLDS.videoWarningBytes)}. Рекомендуется сжатие H.264/AAC в 720p.` });
        } else if (type === 'image' && sizeBytes > THRESHOLDS.imageWarningBytes) {
            warnings.push({ ...info, reason: `Изображение превышает ${formatBytes(THRESHOLDS.imageWarningBytes)}. Рекомендуется конвертация в WebP.` });
        }

        mediaFiles.push(info);
    }

    return {
        totalFiles: mediaFiles.length,
        totalSizeBytes,
        totalSizeFormatted: formatBytes(totalSizeBytes),
        mediaFiles,
        warnings
    };
}

function generateCdnManifest(cdnBaseUrl = 'https://cdn.quizu.app', saveToFile = true) {
    const report = auditMediaFiles();
    const manifest = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        cdnBaseUrl: cdnBaseUrl.replace(/\/+$/, ''),
        totalFiles: report.totalFiles,
        totalSizeBytes: report.totalSizeBytes,
        totalSizeFormatted: report.totalSizeFormatted,
        assets: {}
    };

    for (const file of report.mediaFiles) {
        // e.g. "assets/video/mov_bbb.mp4" => "https://cdn.quizu.app/assets/video/mov_bbb.mp4"
        manifest.assets[file.relPath] = {
            cdnUrl: `${manifest.cdnBaseUrl}/${file.relPath}`,
            sizeBytes: file.sizeBytes,
            type: file.type,
            ext: file.ext
        };
    }

    if (saveToFile) {
        fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
    }
    return manifest;
}

if (require.main === module) {
    console.log('🔍 Запуск медиа-аудитора Quiz U...');
    const report = auditMediaFiles();
    console.log(`📁 Найдено медиа-файлов: ${report.totalFiles}`);
    console.log(`💾 Общий объем ресурсов: ${report.totalSizeFormatted}`);

    if (report.warnings.length > 0) {
        console.log(`⚠️ Предупреждений по тяжелым файлам: ${report.warnings.length}`);
        report.warnings.forEach(w => {
            console.log(`   - [${w.type.toUpperCase()}] ${w.relPath} (${w.sizeFormatted}) -> ${w.reason}`);
        });
    } else {
        console.log('✅ Все медиаресурсы соответствуют нормам веб-производительности.');
    }

    const manifest = generateCdnManifest();
    console.log(`📄 Манифест для CDN сгенерирован: ${path.relative(ROOT_DIR, MANIFEST_PATH)} (${Object.keys(manifest.assets).length} записей)`);
}

module.exports = {
    auditMediaFiles,
    generateCdnManifest,
    formatBytes,
    THRESHOLDS
};
