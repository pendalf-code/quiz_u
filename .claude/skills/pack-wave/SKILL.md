---
name: pack-wave
description: Create, review or rework question packs in "паки вопросов/" (difficulty by cost, media questions, mixed packs, dedupe, catalog rebuild). Use for any batch edit of pack JSON files, TASK-5x style waves, or "add/fix packs".
---

# Pack wave

Source of truth for rules: `docs/OVERHAUL_2026-10.md` (wave 1 + wave 2). Read it first if a rule below looks stale.

## Pack rules

1. Question ends with `?` (imperatives "Назовите…" are rewritten into a question).
2. No answer leak: not literally, not by a same-root word, not by a transparent hint. Wording is unambiguous.
3. "What is shown / who is in the photo / whose voice / what melody" only with media (`img`, `music`, `video`). Otherwise rewrite as text.
4. Answer better shown than named (painting, flag, animal, logo, character) gets `a_img`. Video answer is `a_video`. Never the key `audio`, only `music`. PC also reads legacy `answer_img`.
5. **Difficulty grows with cost** in every theme: cheapest question easiest, priciest hardest, costs ascending. First reorder questions inside the theme (whole question moves: `q`, `a`, media, `type`; cost stays with the cell). If spread is not enough, rewrite 1-2 questions.
6. **Media budget:** 1-2 media questions per pack (not per round), ~1.5 average. Exception: folder `16` (art), pictures are the point. Session budget per folder group: up to 200 files / 20 MB.
7. Media sizes: image ≤ 200 KB (JPG/WebP, ≤ 1024 px); audio ≤ 20 s and ≤ 300 KB (MP3 96-128 kbit/s); video ≤ 15 s, 480p, ≤ 1.5 MB, only where unavoidable. Latin file names. Dirs: `assets/q_img/`, `assets/a_img/`, `assets/music/`, `assets/video/`.
8. Licenses: Wikimedia Commons (PD / CC BY / CC BY-SA), NASA, Openverse, Freesound (CC0). Media must not hint the answer by caption or watermark. Source, author, license go to `assets/credits/<session>.md` (one file per session, so branches do not conflict).
9. Final round: `roundName` is exactly `ФИНАЛ`, final theme named by meaning (not "Финальный вопрос").
10. Pack JSON is CRLF. Keep it.

## Tools (root of repo)

```bash
node tools/commons_media.js search "<query>" [--audio] [--limit 10]
node tools/commons_media.js fetch "File:<name>" [--audio] [--start S] [--dur D] [--width W]   # needs curl + ffmpeg; foreground only, curl timeout 60 s
node tools/mixed_packs.js normalize [--from N] [--to M]   # metadata, rename to NNN_Name.json, CRLF
node tools/mixed_packs.js check [--from N] [--to M]       # structure, rules, spoilers; exit 1 on errors
node tools/validate_spoiler_answers.js                    # answer leak scan, all packs
node tools/dedupe_questions.js [--folder F] [--from N] [--to M] [--threshold 0.6]   # exact + near duplicates, exit 1 if found
node tools/sync_all_catalog.js                            # rebuilds js/packs_catalog.json + js/packs_data.js
```

Background downloads died silently once (TASK-52). Always foreground with timeout.

## Workflow

1. Add a tracker block to `docs/OVERHAUL_2026-10.md` (parts table + log line) before starting.
2. Slice by folder group or pack range. One session = one slice = own worktree/branch off `feature/online-multiplayer`. Run slices one at a time if usage limits bite.
3. Slice session edits only its pack files, `assets/*`, `assets/credits/<session>.md`. **Never** `js/packs_catalog.json` or `js/packs_data.js`.
4. Commit per folder or pack batch: `fix(packs): 05 science — difficulty by cost, 43 media questions (TASK-NN)`, `feat(packs): mixed packs 422–431 (TASK-NN)`.
5. Integration (coordinator, not slice sessions):
   - merge slice branches into `feature/online-multiplayer` (no push);
   - `node tools/dedupe_questions.js` — fix exact duplicates, then near duplicates;
   - `node tools/validate_spoiler_answers.js`;
   - `node tools/sync_all_catalog.js`, commit `chore(catalog): rebuild after ...`;
   - drop unreferenced assets;
   - `npm test` and `cd server && npm test`, both green.
6. Close the task with the `task-close` skill.

## Tests that guard packs

`tests/packs_integrity.test.js`, `tests/pack_media.test.js`, `tests/mixed_packs.test.js`, `tests/catalog_logic.test.js`. Static checks: read them before renaming files or fields. A new rule means a new test there.
