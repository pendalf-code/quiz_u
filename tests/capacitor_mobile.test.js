const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

test('Capacitor Mobile Setup: capacitor.config.json integrity', () => {
    const configPath = path.join(ROOT_DIR, 'capacitor.config.json');
    assert.ok(fs.existsSync(configPath), 'capacitor.config.json exists');

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(config.appId, 'com.quizu.app');
    assert.equal(config.appName, 'Quiz U');
    assert.equal(config.webDir, 'mobile');
    assert.ok(config.server, 'server config exists');
    assert.equal(config.server.cleartext, true, 'cleartext traffic allowed for local dev');
});

test('Capacitor Mobile Setup: mobile/manifest.json for PWA and Mobile shell', () => {
    const manifestPath = path.join(ROOT_DIR, 'mobile', 'manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'mobile/manifest.json exists');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.ok(manifest.name.includes('Quiz U'));
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.orientation, 'portrait');
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);

    const icon192 = path.join(ROOT_DIR, 'mobile', 'icon-192.svg');
    const icon512 = path.join(ROOT_DIR, 'mobile', 'icon-512.svg');
    assert.ok(fs.existsSync(icon192), 'icon-192.svg exists');
    assert.ok(fs.existsSync(icon512), 'icon-512.svg exists');
});

test('Capacitor Mobile Setup: package.json dependencies and scripts', () => {
    const pkgPath = path.join(ROOT_DIR, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    assert.ok(pkg.scripts['cap:sync'], 'cap:sync script exists');
    assert.ok(pkg.scripts['cap:open:android'], 'cap:open:android script exists');
    assert.ok(pkg.scripts['build:mobile'], 'build:mobile script exists');
    assert.ok(pkg.scripts['optimize:media'], 'optimize:media script exists');
    assert.ok(pkg.scripts['test:load'], 'test:load script exists');

    assert.ok(pkg.dependencies['@capacitor/android'], '@capacitor/android is in dependencies');
    assert.ok(pkg.dependencies['@capacitor/core'], '@capacitor/core is in dependencies');
    assert.ok(pkg.dependencies['@capacitor/ios'], '@capacitor/ios is in dependencies');
    assert.ok(pkg.devDependencies['@capacitor/cli'], '@capacitor/cli is in devDependencies');
});

test('Capacitor Mobile Setup: Android Studio project scaffolding', () => {
    const androidDir = path.join(ROOT_DIR, 'android');
    assert.ok(fs.existsSync(path.join(androidDir, 'build.gradle')), 'android/build.gradle exists');
    assert.ok(fs.existsSync(path.join(androidDir, 'settings.gradle')), 'android/settings.gradle exists');
    assert.ok(fs.existsSync(path.join(androidDir, 'gradle.properties')), 'android/gradle.properties exists');
    assert.ok(fs.existsSync(path.join(androidDir, 'app', 'build.gradle')), 'android/app/build.gradle exists');

    const manifestXmlPath = path.join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml');
    assert.ok(fs.existsSync(manifestXmlPath), 'AndroidManifest.xml exists');
    const manifestXml = fs.readFileSync(manifestXmlPath, 'utf8');
    assert.ok(manifestXml.includes('android.permission.INTERNET'), 'INTERNET permission defined');
    assert.ok(manifestXml.includes('android.permission.VIBRATE'), 'VIBRATE permission defined');
    assert.ok(manifestXml.includes('MainActivity'), 'MainActivity declared');

    const mainActivityPath = path.join(androidDir, 'app', 'src', 'main', 'java', 'com', 'quizu', 'app', 'MainActivity.java');
    assert.ok(fs.existsSync(mainActivityPath), 'MainActivity.java exists');
    const mainActivity = fs.readFileSync(mainActivityPath, 'utf8');
    assert.ok(mainActivity.includes('BridgeActivity'), 'MainActivity extends BridgeActivity');

    const stringsPath = path.join(androidDir, 'app', 'src', 'main', 'res', 'values', 'strings.xml');
    assert.ok(fs.existsSync(stringsPath), 'strings.xml exists');
    const stringsXml = fs.readFileSync(stringsPath, 'utf8');
    assert.ok(stringsXml.includes('Quiz U'), 'app_name is Quiz U');
});
