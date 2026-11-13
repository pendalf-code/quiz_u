---
name: pack-wave
description: 'Create, review or rework question packs in "паки вопросов/" (difficulty by cost, media questions, mixed packs, dedupe, catalog rebuild). Use for any batch edit of pack JSON files, TASK-5x style waves, or "add/fix packs".'
---

# Pack wave

Resolve repository paths below from the project root. User instructions take precedence over this workflow. Current pack rules are maintained below. Track work only in `docs/TASKS.md`; completed wave history is in `docs/archive/2026-10/OVERHAUL_2026-10.md` and is not current guidance.

## Pack rules

1. Question ends with `?` (imperatives "Назовите…" are rewritten into a question).
2. No answer leak: not literally, not by a same-root word, not by a transparent hint. Wording is unambiguous.
3. "What is shown / who is in the photo / whose voice / what melody" only with media (`img`, `music`, `video`). Otherwise rewrite as text.
4. Answer better shown than named (painting, flag, animal, logo, character) gets `a_img`. Video answer is `a_video`. Never the key `audio`, only `music`. PC also reads legacy `answer_img`.
5. **Difficulty grows with cost** in every theme: cheapest question easiest, priciest hardest, costs ascending. First reorder questions inside the theme (whole question moves: `q`, `a`, media, `type`; cost stays with the cell). If spread is not enough, rewrite 1-2 questions.
6. **Media budget:** 1-2 media questions per pack (not per round), ~1.5 average. Exceptions: folder `16` (art) and mixed packs 492–891, whose existing contract requires `img`, `music` and `video` in each pack. Session budget per folder group: up to 200 files / 20 MB.
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

For a wave that restructures existing mixed packs, see the editorial workflow below.

1. Add a task and any slice statuses to `docs/TASKS.md` before starting. Record results there; do not update completed archives.
2. Slice by folder group or pack range. For large batches, use slices by folder or pack range. Reuse a suitable checkout; create a worktree only when isolation is needed. Base new branches on `feature/online-multiplayer`. Do not launch other agents or chats without authorization.
3. Slice session edits only its pack files, `assets/*`, `assets/credits/<session>.md`. **Never** `js/packs_catalog.json` or `js/packs_data.js`.
4. If committing was requested, commit per folder or pack batch: `fix(packs): 05 science — difficulty by cost, 43 media questions (TASK-NN)`, `feat(packs): mixed packs 422–431 (TASK-NN)`.
5. Integration (coordinator, not slice sessions):
   - merge slice branches into `feature/online-multiplayer` (no push);
   - `node tools/dedupe_questions.js` — fix exact duplicates, then near duplicates;
   - `node tools/validate_spoiler_answers.js`;
   - `node tools/sync_all_catalog.js`, if committing was requested, use `chore(catalog): rebuild after ...`;
   - drop unreferenced assets;
   - `npm test` and `cd server && npm test`, both green.
6. Close the task using the sibling `task-close` skill at `../task-close/SKILL.md`.

## Tests that guard packs

`tests/packs_integrity.test.js`, `tests/pack_media.test.js`, `tests/mixed_packs.test.js`, `tests/catalog_logic.test.js`. Static checks: read them before renaming files or fields. A new rule means a new test there.

## Редактура существующих микс-паков

1. Сохраните исходники всей волны до первой правки. Для TASK-78 `wave-before/` содержит версии после пилота, `pilot-before/` нужен для сравнения самого пилота. Предварительные карточки помогают навигации, их хеши сверяйте с исходниками.
2. Раздавайте непересекающиеся партии по 10–15 паков. Прочитайте все вопросы и ответы, включая финал. Для каждой темы сформулируйте общий принцип, проверьте по нему каждую ячейку, затем выберите название. Уберите подсказки между ячейками и повтор одного факта. Решение по паку обоснуйте содержанием.
3. Сопоставьте предмет, механику и порядок тем соседних и похожих паков по всему диапазону. В 492–691 проверьте первые три слота на повтор связки «свет, звук, сосуды». Смотрите на содержание ячеек: переименование при тех же вопросах и порядке сохраняет структуру. При содержательном повторе измените принцип темы, её место или набор фактов. Общий формат табло и повторное использование файла допустимы. Сохраняйте ID, раунды, финал, размеры табло и цены ячеек.
4. Проверьте, какой дополнительный шаг оправдывает верхнюю цену. Перемещайте вопрос, ответ и медиа вместе, сохраняя цену ячейки. Для видео выбирайте действие, результат или наблюдение, нужное для ответа и связанное с темой. Случайный цвет, положение предмета или деталь фона редко оправдывают ролик. Просмотрите изменённые изображения и видео, прослушайте изменённое аудио. Слабое медиа можно заменить. Зафиксируйте объём фактической проверки.
5. Независимый ревьюер читает итоговый пак и снимок, сверяет конкретные ячейки с похожими паками. Проверяет охват темы, содержательность перестройки, подсказки, повторы, сложность верхней ячейки и связь медиа с ответом. Сначала фиксирует собственные замечания по ID, раунду, теме и цене, затем сверяет вывод с автором. Координатор проверяет исправления по итоговому файлу.

### Команды и итоговый отчёт

Запускайте из корня. Папка артефактов должна существовать. Повторный прогон требует нового пути вывода.

```text
node tools/mixed_pack_wave.js snapshot "<артефакты>/before.json"
node tools/mixed_pack_wave.js report "<артефакты>/before.json" "<артефакты>/final.json" --review "<артефакты>/final-reviews.json"
node tools/mixed_packs.js check --from 407 --to 891
node tools/dedupe_questions.js --folder 19_Микс_и_Эрудиция --from 407 --to 891 --threshold 0.25
```

Вместо снимка можно передать папку исходных JSON. Для партии используйте `--from N --to M`, для альтернативного источника текущих файлов — `--source DIR`. Снимок хранит исходный UTF-8 текст и SHA-256. Итоговый отчёт строится по исходным и текущим файлам. Он содержит изменённые ячейки, темы и метаданные до и после, перестановки целых вопросов и изменения медиа. Координаты ячейки идут в порядке «раунд:тема:позиция» с 1. Журналы промежуточных правок служат для справки.

Для промежуточного прогона можно опустить `--review`. Для итогового передайте один или несколько файлов `--review` с массивами или объектами `{"records":[...]}`. Каждая запись содержит `num`, `title`, `sourceSha256` прочитанного итогового JSON, `coverage: "full_question_text"` и `decision`. Добавьте `rationale`, `factCheck`, `media`, `unresolved` с обоснованием, источниками новых и спорных фактов, проверкой медиа и открытыми вопросами. Нужна одна актуальная запись на ID. После исправлений ревьюер перечитывает затронутый пак и обновляет запись и хеш.

`technicalOk` охватывает проверку файлов, инвариантов и предоставленных записей. `editorialReviewState` показывает, переданы ли актуальные записи. Полноту чтения заявляет ревьюер. Замена медиа видна в отчёте. Отсутствующий файл или обязательный тип — ошибка. Сравните вывод `mixed_packs.js check` с исходным прогоном и разберите спорные срабатывания.

Сопоставьте `candidates` до и после по повторам заголовков, раскладкам медиа, лексическим признакам первых тем, одинаковым ответам внутри темы и парам медиа с ответом между паками. Для текстовых совпадений по всему банку используйте `dedupe_questions.js`. Низкий порог расширяет список кандидатов. Оценивайте факты и ход решения вручную. В итоговом отчёте укажите фактическое покрытие, изменения, результаты проверок и ограничения внешней фактологии, воспроизведения медиа и игровых проб. Интересность и реальную сложность проверяйте в игре.

`crossCellAnswerLeaks` показывает координаты ответа и соседнего вопроса в одной теме, совпавшие слова и основание сигнала. Проверяйте, раскрывает ли совпадение ответ в контексте. Поиск охватывает буквальное совпадение и отдельные формы вроде «рулевой» и «рулевым».

`titleAnswerLeaks` показывает заголовок темы, ожидаемый ответ, совпавший фрагмент и координаты ячейки. Одно содержательное слово из имени в вопросе на узнавание даёт сигнал с низкой уверенностью. Проверьте, подсказывает ли заголовок ответ или лишь обозначает предмет темы.
