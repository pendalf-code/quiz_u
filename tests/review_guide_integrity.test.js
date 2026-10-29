const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');

test('REVIEW_GUIDE.md: File exists in docs/, is valid UTF-8, and has no replacement characters', () => {
    const reviewGuidePath = path.join(DOCS_DIR, 'REVIEW_GUIDE.md');
    assert.ok(fs.existsSync(reviewGuidePath), 'docs/REVIEW_GUIDE.md must exist in docs directory');

    const content = fs.readFileSync(reviewGuidePath, 'utf8');
    assert.ok(content.trim(), 'REVIEW_GUIDE.md must not be empty');
    assert.ok(!content.includes('\uFFFD'), 'REVIEW_GUIDE.md must not contain unicode replacement character (\uFFFD)');
});

test('REVIEW_GUIDE.md: Contains Conventional Comments standard with all prefixes', () => {
    const reviewGuidePath = path.join(DOCS_DIR, 'REVIEW_GUIDE.md');
    const content = fs.readFileSync(reviewGuidePath, 'utf8');

    const requiredPrefixes = [
        '[blocker]',
        '[should]',
        '[suggestion]',
        '[nit]',
        '[question]',
        '[praise]'
    ];

    for (const prefix of requiredPrefixes) {
        assert.ok(content.includes(prefix), `REVIEW_GUIDE.md must describe prefix: ${prefix}`);
    }
});

test('AGENTS.md: Owns Quiz U architecture invariants', () => {
    const content = fs.readFileSync(path.join(ROOT_DIR, 'AGENTS.md'), 'utf8');

    assert.ok(/zero-build/i.test(content), 'Must specify Zero-Build invariant');
    assert.ok(content.includes('feature/online-multiplayer'), 'Must specify Git branch policy');
    assert.ok(content.includes('main'), 'Must warn about protected main branch');
    assert.ok(content.includes('light-theme'), 'Must specify dual theme support');
});

test('REVIEW_GUIDE.md: Contains all 8 phases of comprehensive project review plan', () => {
    const reviewGuidePath = path.join(DOCS_DIR, 'REVIEW_GUIDE.md');
    const content = fs.readFileSync(reviewGuidePath, 'utf8');

    for (let phase = 1; phase <= 8; phase++) {
        assert.ok(content.includes(`Фаза ${phase}:`), `REVIEW_GUIDE.md must contain Phase ${phase}`);
    }

    assert.ok(content.includes('Аудит ядра') || content.includes('js/core'), 'Phase 1 must cover Core Engine');
    assert.ok(content.includes('Хост-приложение') || content.includes('Host Web UI'), 'Phase 2 must cover Host UI');
    assert.ok(content.includes('Мобильный PWA-клиент') || content.includes('mobile/'), 'Phase 3/4 must cover Mobile PWA');
    assert.ok(content.includes('Авторитарный сервер') || content.includes('WebSocket'), 'Phase 3 must cover Server/Network');
    assert.ok(content.includes('src-tauri') || content.includes('Десктоп-сборка'), 'Phase 5 must cover Desktop/Tauri');
    assert.ok(content.includes('База вопросов') || content.includes('медиа'), 'Phase 6 must cover Packs & Media');
    assert.ok(content.includes('Автоматизированное тестирование') || content.includes('tests/'), 'Phase 7 must cover Tests & QA');
    assert.ok(content.includes('документаци') || content.includes('регламент'), 'Phase 8 must cover Documentation');
});

test('.github/pull_request_template.md: File exists, valid UTF-8, contains checklist', () => {
    const prTemplatePath = path.join(ROOT_DIR, '.github', 'pull_request_template.md');
    assert.ok(fs.existsSync(prTemplatePath), '.github/pull_request_template.md must exist');

    const content = fs.readFileSync(prTemplatePath, 'utf8');
    assert.ok(!content.includes('\uFFFD'), 'PR template must not contain unicode replacement character (\uFFFD)');
    assert.ok(
        content.includes('Самопроверка автора') || content.includes('Self-Review Checklist'),
        'Must contain author checklist'
    );
    assert.ok(content.includes('Conventional Comments'), 'Must reference Conventional Comments');
    assert.ok(content.includes('REVIEW_GUIDE.md'), 'Must link to REVIEW_GUIDE.md');
});

function markdownFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(directory, entry.name);
        return entry.isDirectory() ? markdownFiles(fullPath) :
            (entry.name.endsWith('.md') ? [fullPath] : []);
    });
}

test('Project documentation: local Markdown links resolve, including archived documents', () => {
    const files = [path.join(ROOT_DIR, 'AGENTS.md'), ...markdownFiles(DOCS_DIR)];
    for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        assert.ok(!content.includes('\uFFFD'), `${file} must be valid UTF-8`);
        for (const match of content.matchAll(/\[[^\]\n]+\]\(([^)\n]+)\)/g)) {
            const target = match[1];
            if (/^(?:[a-z]+:|#)/i.test(target)) continue;
            const destination = decodeURIComponent(target.split('#')[0]);
            assert.ok(fs.existsSync(path.resolve(path.dirname(file), destination)),
                `${path.relative(ROOT_DIR, file)} has broken link: ${target}`);
        }
    }
});
