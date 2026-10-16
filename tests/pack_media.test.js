const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const packsDir = path.join(rootDir, 'паки вопросов');
const MEDIA_KEYS = ['img', 'music', 'video', 'a_img', 'a_video', 'answer_img', 'answer_video'];

function forEachQuestion(cb) {
    for (const folder of fs.readdirSync(packsDir)) {
        const folderPath = path.join(packsDir, folder);
        if (!fs.statSync(folderPath).isDirectory()) continue;
        for (const file of fs.readdirSync(folderPath).filter(f => f.endsWith('.json'))) {
            const raw = fs.readFileSync(path.join(folderPath, file), 'utf8').replace(/^﻿/, '');
            const data = JSON.parse(raw);
            const rounds = Array.isArray(data) ? data : (data.rounds || [data]);
            for (const round of rounds) {
                for (const theme of round.themes || []) {
                    for (const q of theme.questions || []) cb(q, `${folder}/${file}`);
                }
            }
        }
    }
}

test('PC answer screen shows a_img (pack format) as well as legacy answer_img', () => {
    const src = fs.readFileSync(path.join(rootDir, 'js', 'game.js'), 'utf8');
    assert.ok(src.includes('currentQuestionObj.a_img || currentQuestionObj.answer_img'));
    assert.ok(src.includes('question.a_video || question.answer_video'));
});

test('every media file referenced by packs exists; no unsupported "audio" key', () => {
    const missing = [];
    const badKeys = [];
    forEachQuestion((q, where) => {
        if (q.audio) badKeys.push(where);
        for (const key of MEDIA_KEYS) {
            const val = q[key];
            if (typeof val !== 'string' || val.startsWith('data:') || /^https?:/.test(val)) continue;
            if (!fs.existsSync(path.join(rootDir, val))) missing.push(`${where}: ${key}=${val}`);
        }
    });
    assert.deepEqual(badKeys, [], 'use "music" instead of "audio"');
    assert.deepEqual(missing.slice(0, 20), []);
});

test('every pack question ends with a question mark', () => {
    const bad = [];
    forEachQuestion((q, where) => {
        if (!/\?\s*$/.test(String(q.q || ''))) bad.push(`${where}: ${q.q}`);
    });
    assert.deepEqual(bad.slice(0, 20), []);
});
