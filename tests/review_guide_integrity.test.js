const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

test('REVIEW_GUIDE.md: File exists, is valid UTF-8, and has no replacement characters', () => {
    const reviewGuidePath = path.join(ROOT_DIR, 'REVIEW_GUIDE.md');
    assert.ok(fs.existsSync(reviewGuidePath), 'REVIEW_GUIDE.md must exist in project root');

    const content = fs.readFileSync(reviewGuidePath, 'utf8');
    assert.ok(content.length > 5000, 'REVIEW_GUIDE.md should contain detailed instructions');
    assert.ok(!content.includes('\uFFFD'), 'REVIEW_GUIDE.md must not contain unicode replacement character (\uFFFD)');
});

test('REVIEW_GUIDE.md: Contains Conventional Comments standard with all prefixes', () => {
    const reviewGuidePath = path.join(ROOT_DIR, 'REVIEW_GUIDE.md');
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

test('REVIEW_GUIDE.md: Contains Quiz U Quality Gates & Architecture Invariants', () => {
    const reviewGuidePath = path.join(ROOT_DIR, 'REVIEW_GUIDE.md');
    const content = fs.readFileSync(reviewGuidePath, 'utf8');

    assert.ok(content.includes('Zero-Build'), 'Must specify Zero-Build invariant');
    assert.ok(content.includes('feature/online-multiplayer'), 'Must specify Git branch policy');
    assert.ok(content.includes('main'), 'Must warn about protected main branch');
    assert.ok(content.includes('light-theme'), 'Must specify dual theme support');
});

test('REVIEW_GUIDE.md: Contains all 8 phases of comprehensive project review plan', () => {
    const reviewGuidePath = path.join(ROOT_DIR, 'REVIEW_GUIDE.md');
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

test('Project documentation cross-linking integrity', () => {
    const filesToTest = [
        'DEV_GUIDE.md',
        'README.md',
        'TASKS.md',
        'ROADMAP.md',
        path.join('.aiassistant', 'rules', 'code style rules.md')
    ];

    for (const relPath of filesToTest) {
        const fullPath = path.join(ROOT_DIR, relPath);
        assert.ok(fs.existsSync(fullPath), `${relPath} must exist`);
        const content = fs.readFileSync(fullPath, 'utf8');
        assert.ok(
            content.includes('REVIEW_GUIDE.md'),
            `${relPath} must contain a reference to REVIEW_GUIDE.md`
        );
        assert.ok(!content.includes('\uFFFD'), `${relPath} must not contain \uFFFD characters`);
    }
});
