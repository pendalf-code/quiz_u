const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('Desktop & Tauri Configuration Tests (Stage 5.1)', () => {
    const rootDir = path.join(__dirname, '..');
    const tauriDir = path.join(rootDir, 'src-tauri');
    const cargoTomlPath = path.join(tauriDir, 'Cargo.toml');
    const tauriConfPath = path.join(tauriDir, 'tauri.conf.json');
    const mainRsPath = path.join(tauriDir, 'src', 'main.rs');
    const workflowPath = path.join(rootDir, '.github', 'workflows', 'desktop-build.yml');
    const pkgJsonPath = path.join(rootDir, 'package.json');

    it('src-tauri/Cargo.toml exists and defines package metadata', () => {
        assert.ok(fs.existsSync(cargoTomlPath), 'Cargo.toml must exist');
        const cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
        assert.ok(cargoToml.includes('name = "quiz-u-desktop"'), 'Cargo.toml must define quiz-u-desktop');
        assert.ok(cargoToml.includes('tauri'), 'Cargo.toml must include tauri dependency');
        assert.ok(cargoToml.includes('tauri-plugin-shell'), 'Cargo.toml must include tauri-plugin-shell dependency');
    });

    it('src-tauri/tauri.conf.json is valid JSON with Steam Deck 1280x800 resolution', () => {
        assert.ok(fs.existsSync(tauriConfPath), 'tauri.conf.json must exist');
        const raw = fs.readFileSync(tauriConfPath, 'utf8');
        let conf;
        assert.doesNotThrow(() => {
            conf = JSON.parse(raw);
        }, 'tauri.conf.json must be valid JSON');

        assert.strictEqual(conf.productName, 'Quiz U');
        assert.strictEqual(conf.build.frontendDist, '../');

        const windowConf = conf.app.windows[0];
        assert.ok(windowConf, 'Must define at least one window');
        assert.strictEqual(windowConf.width, 1280, 'Default window width should match Steam Deck native width (1280)');
        assert.strictEqual(windowConf.height, 800, 'Default window height should match Steam Deck native height (800)');
        assert.strictEqual(windowConf.resizable, true, 'Window should be resizable');

        assert.ok(Array.isArray(conf.bundle.icon), 'Bundle icons must be configured');
        assert.ok(conf.bundle.icon.length >= 3, 'Bundle must reference icons');
    });

    it('src-tauri/src/main.rs defines required desktop commands', () => {
        assert.ok(fs.existsSync(mainRsPath), 'src/main.rs must exist');
        const mainRs = fs.readFileSync(mainRsPath, 'utf8');
        assert.ok(mainRs.includes('fn toggle_fullscreen'), 'main.rs must implement toggle_fullscreen');
        assert.ok(mainRs.includes('fn is_steam_deck'), 'main.rs must implement is_steam_deck');
        assert.ok(mainRs.includes('fn get_system_info'), 'main.rs must implement get_system_info');
    });

    it('src-tauri/icons directory contains required desktop icon files', () => {
        const requiredIcons = ['32x32.png', '128x128.png', '128x128@2x.png', 'icon.ico', 'icon.icns'];
        for (const icon of requiredIcons) {
            const iconPath = path.join(tauriDir, 'icons', icon);
            assert.ok(fs.existsSync(iconPath), `Icon asset ${icon} must exist in src-tauri/icons/`);
            const stat = fs.statSync(iconPath);
            assert.ok(stat.size > 0, `Icon asset ${icon} must not be empty`);
        }
    });

    it('.github/workflows/desktop-build.yml defines CI builds for Windows and Linux/SteamOS', () => {
        assert.ok(fs.existsSync(workflowPath), 'desktop-build.yml workflow must exist');
        const workflow = fs.readFileSync(workflowPath, 'utf8');
        assert.ok(workflow.includes('windows-latest'), 'Workflow must target Windows');
        assert.ok(workflow.includes('ubuntu-22.04'), 'Workflow must target Linux/SteamOS');
        assert.ok(workflow.includes('tauri build') || workflow.includes('cargo tauri build'), 'Workflow must run tauri build');
    });

    it('package.json includes desktop scripts', () => {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        assert.ok(pkg.scripts['build:desktop'], 'package.json must contain build:desktop script');
        assert.ok(pkg.scripts['dev:desktop'], 'package.json must contain dev:desktop script');
    });
});
