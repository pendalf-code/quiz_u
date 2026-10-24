/**
 * Медиа-вопросы с Wikimedia Commons (TASK-56): поиск, загрузка, проверка лицензии, сжатие, кредиты.
 *
 *   node tools/commons_media.js search "<запрос>" [--audio] [--limit 10]
 *       Файлы Commons с лицензией, размером и разрешением.
 *   node tools/commons_media.js fetch "File:<имя>" [--audio] [--start S] [--dur D] [--width W]
 *       Качает превью (картинка, ≤ 1024 px, JPG ≤ 200 КБ) или отрезок аудио (MP3 ≤ 20 с, ≤ 300 КБ),
 *       кладёт в assets/q_img/w2m_q_NNN.jpg или assets/music/w2m_m_NNN.mp3,
 *       дописывает строку в assets/credits/mixed-packs-2.md и печатает путь для пака.
 *
 * Нужны curl и ffmpeg в PATH. Загрузки только в foreground, таймаут curl 60 с.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'QuizU-packs/1.0 (offline quiz game content tool)';
const CREDITS = path.join(ROOT, 'assets', 'credits', 'mixed-packs-2.md');
const PREFIX = 'w2m_';
const MAX_IMG = 200 * 1024;
const MAX_AUDIO = 300 * 1024;
const FREE_LICENSE = /^(public domain|pd|cc0|cc[ -]by(-sa)?[ -]?\d|cc by(-sa)? \d)/i;

function parseArgs(argv) {
    const args = { cmd: argv[0], target: argv[1], audio: false, start: 0, dur: 15, width: 800, limit: 10 };
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--audio') args.audio = true;
        else if (argv[i] === '--start') args.start = parseFloat(argv[++i]);
        else if (argv[i] === '--dur') args.dur = Math.min(20, parseFloat(argv[++i]));
        else if (argv[i] === '--width') args.width = Math.min(1024, parseInt(argv[++i], 10));
        else if (argv[i] === '--limit') args.limit = parseInt(argv[++i], 10);
    }
    return args;
}

function curl(url, outFile) {
    const base = ['-s', '-L', '--fail', '--max-time', '60', '--retry', '2', '--retry-delay', '10', '-A', UA];
    if (outFile) {
        execFileSync('curl', base.concat(['-o', outFile, url]));
        return null;
    }
    return execFileSync('curl', base.concat([url]), { maxBuffer: 16 * 1024 * 1024 }).toString('utf8');
}

function api(params) {
    const qs = Object.entries(Object.assign({ format: 'json', formatversion: '2' }, params))
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    return JSON.parse(curl(`${API}?${qs}`));
}

function stripHtml(s) {
    return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function meta(info, key) {
    const m = info.extmetadata && info.extmetadata[key];
    return m ? stripHtml(m.value) : '';
}

function cmdSearch(args) {
    const type = args.audio ? 'filetype:audio' : 'filetype:bitmap';
    const res = api({
        action: 'query', generator: 'search', gsrnamespace: '6', gsrlimit: String(args.limit),
        gsrsearch: `${args.target} ${type}`, prop: 'imageinfo',
        iiprop: 'size|mime|extmetadata', iiextmetadatafilter: 'LicenseShortName|Artist'
    });
    const pages = (res.query && res.query.pages) || [];
    pages.sort((a, b) => a.index - b.index).forEach(p => {
        const ii = (p.imageinfo || [])[0] || {};
        const lic = meta(ii, 'LicenseShortName');
        const ok = FREE_LICENSE.test(lic) ? 'OK ' : 'NO ';
        const dims = args.audio ? `${Math.round(ii.duration || 0)}s` : `${ii.width}x${ii.height}`;
        console.log(`${ok}${p.title} | ${dims} | ${Math.round((ii.size || 0) / 1024)}KB | ${lic}`);
    });
    if (!pages.length) console.log('nothing found');
}

function nextFile(dir, kind, ext) {
    fs.mkdirSync(dir, { recursive: true });
    const re = new RegExp(`^${PREFIX}${kind}_(\\d{3})\\.`);
    let max = 0;
    fs.readdirSync(dir).forEach(f => {
        const m = f.match(re);
        if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return path.join(dir, `${PREFIX}${kind}_${String(max + 1).padStart(3, '0')}.${ext}`);
}

function appendCredit(rel, title, author, license) {
    if (!fs.existsSync(CREDITS)) {
        fs.writeFileSync(CREDITS, [
            '# Медиа волны 2 (TASK-56, сессия mixed-packs-2)',
            '',
            'Все файлы — с Wikimedia Commons, свободные лицензии (PD / CC0 / CC BY / CC BY-SA). Картинки — превью ≤ 1024 px, JPG ≤ 200 КБ; аудио обрезано до ≤ 20 с (MP3 96 кбит/с, моно).',
            '',
            '| Файл | Источник | Автор | Лицензия |',
            '|:---|:---|:---|:---|',
            ''
        ].join('\r\n'), 'utf8');
    }
    const name = title.replace(/^File:/, '');
    const url = 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(name.replace(/ /g, '_')).replace(/%2C/g, ',');
    const cell = s => String(s || '—').replace(/\|/g, '/').slice(0, 120);
    fs.appendFileSync(CREDITS, `| \`${rel}\` | [${cell(name)}](${url}) | ${cell(author)} | ${cell(license)} |\r\n`, 'utf8');
}

function cmdFetch(args) {
    const title = args.target.startsWith('File:') ? args.target : 'File:' + args.target;
    const params = {
        action: 'query', titles: title, prop: 'imageinfo',
        iiprop: 'url|size|mime|extmetadata', iiextmetadatafilter: 'LicenseShortName|Artist'
    };
    if (!args.audio) params.iiurlwidth = String(args.width);
    const page = (api(params).query.pages || [])[0];
    if (!page || page.missing || !page.imageinfo) throw new Error(`not found: ${title}`);
    const ii = page.imageinfo[0];
    const license = meta(ii, 'LicenseShortName');
    if (!FREE_LICENSE.test(license)) throw new Error(`license not allowed: "${license}"`);
    const author = meta(ii, 'Artist') || '—';
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'w2m-'));
    const src = path.join(tmpDir, 'src');
    let out;
    if (args.audio) {
        curl(ii.url, src);
        out = nextFile(path.join(ROOT, 'assets', 'music'), 'm', 'mp3');
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(args.start), '-t', String(args.dur), '-i', src,
            '-ac', '1', '-b:a', '96k', '-af', 'afade=t=out:st=' + Math.max(0, args.dur - 1) + ':d=1', out]);
        if (fs.statSync(out).size > MAX_AUDIO) throw new Error(`audio too big: ${out}`);
    } else {
        curl(ii.thumburl || ii.url, src);
        out = nextFile(path.join(ROOT, 'assets', 'q_img'), 'q', 'jpg');
        let q = 4;
        let width = Math.min(args.width, ii.thumbwidth || ii.width || args.width);
        for (;;) {
            execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', `scale='min(${width},iw)':-2`, '-q:v', String(q), '-frames:v', '1', out]);
            if (fs.statSync(out).size <= MAX_IMG) break;
            if (q < 10) q += 2;
            else if (width > 400) width -= 160;
            else throw new Error(`image too big: ${out}`);
        }
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const rel = path.relative(ROOT, out).replace(/\\/g, '/');
    appendCredit(rel, title, author, license);
    console.log(`${rel} | ${Math.round(fs.statSync(out).size / 1024)}KB | ${license} | ${author}`);
}

const args = parseArgs(process.argv.slice(2));
try {
    if (args.cmd === 'search' && args.target) cmdSearch(args);
    else if (args.cmd === 'fetch' && args.target) cmdFetch(args);
    else {
        console.log('Usage: node tools/commons_media.js search "<query>" [--audio] | fetch "File:<name>" [--audio] [--start S] [--dur D] [--width W]');
        process.exitCode = 2;
    }
} catch (e) {
    console.error('ERROR: ' + e.message);
    process.exitCode = 1;
}
