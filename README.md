# Prata

A phone-first website for practising **reading and writing Swedish** every day. It has three parts:

- **Läs**: graded texts where you tap a word to see its meaning.
- **Öva**: spaced-repetition review with typed answers, plus tests with answer keys.
- **Skriv**: writing tasks with a grammar checklist. Missed checklist points turn into review cards.

The site holds no learning material. Content comes from a Google Sheet you publish, and all progress stays in your browser. There is no server, no account and no AI.

## Using it

1. Put your content in a Google Sheet with the tabs described below. (`scripts/import/` builds one from the Swedish Kit.)
2. In Google Sheets: **File → Share → Publish to web → Entire document → Comma-separated values → Publish**.
3. Open the site, tap **Kom igång** and paste the Sheet's normal link (`https://docs.google.com/spreadsheets/d/<id>/edit`).
4. Take the placement test or pick a level.
5. On iPhone, add the site to your Home Screen. Safari can delete a website's saved data if you don't open it for a while; Home Screen apps keep theirs.

To pick up changes to the Sheet later, use **Mer → Hämta materialet**. **Mer → Spara backup** downloads your progress as a JSON file. Restore it on the same or another phone.

The site reads each tab as CSV from `…/gviz/tq?tqx=out:csv&headers=1&sheet=<tab>`. If that ever fails, paste one "Publish to web" CSV link per tab under **Mer → Advanced**.

A published Sheet can be read by anyone who has its link. The link is long and random, so nobody can guess it, but don't post it anywhere.

## Sheet format

One tab per table. The first row holds the column names; extra columns are ignored. Lists inside a cell are separated by `|`. Levels run from 1 to 5, where 5 means "real-world Swedish".

| Tab | Columns | Notes |
| --- | --- | --- |
| `texts` | id, level, title, source, kind, part, body | Rows with the same `id` are joined in `part` order, so long texts can stay under Sheets' 50,000-character cell limit. `kind = hjälp` marks reference material; the text with id `samband` is shown as the linking-words helper in Skriv. |
| `glossary` | text_id, form, lemma, english | Used for tap-to-translate. An empty `text_id` makes the entry apply to every text. |
| `questions` | text_id, question, options, answer | `answer` is a letter (`b`) or the option text. With no options, the question is open and the answer is shown on request. |
| `cards` | id, deck, level, swedish, english, example, (alternatives) | Reviewed as English → type the Swedish. A word in the example is blanked out as a hint. The optional `alternatives` column lists other accepted answers. An `en`/`ett` article is never required in an answer. |
| `exercises` | id, level, topic, type, prompt, answer, alternatives, explanation | `type` is `cloze`, `conjugate`, `translate`, `order` or `selfcheck`. For `order`, separate the word tiles in `answer` with ` / `. |
| `tests` | test_id, title, level, section, number, question, options, answer | Tests `lund-1` and `lund-2` are used for placement. Passing a test at your level (70%) moves you up a level. For a typed answer, extra accepted answers go after `|`. |
| `prompts` | id, level, title, task, hints, checklist | With an empty `checklist`, a default grammar checklist for the level is used. |

`fixtures/sample-sheet/` has a small, complete example as CSV files.

## Development

```sh
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests (Vitest)
npm run build      # static export to out/
npm run test:e2e   # Playwright at iPhone size, against out/, with the sample Sheet
```

`npm run build` writes a fully static site to `out/`, which can be hosted anywhere. To serve it from a sub-path (for example GitHub Pages at `/prata`), build with `BASE_PATH=/prata npm run build`.

Code layout:

- `src/lib/`: Sheet reading (`sheets.ts`), progress in localStorage (`progress.ts`), the content cache in IndexedDB (`content-cache.ts`), scheduling (`srs.ts`, using FSRS), answer checking, and session logic.
- `src/app/`: one folder per screen.
- `public/sw.js`: the offline cache.

## Importing the Swedish Kit

The scripts in `scripts/import/` turn the Drive folder into a spreadsheet. Run each one with `python3 -I`. They need `curl`, poppler (`pdftotext`, `pdftoppm`), ImageMagick, `heif-convert` (with `libheif-plugin-libde265` for iPhone photos), Tesseract with Swedish data (`tesseract-ocr-swe`), and Python's `openpyxl`, `Pillow` and `numpy`.

```sh
python3 -I scripts/import/fetch_drive.py <folder-id> <data-dir>   # download everything (public folder)
python3 -I scripts/import/extract_text.py <data-dir>              # dedupe + text / OCR (re-runnable)
python3 -I scripts/import/build_sheet.py <data-dir> <out.xlsx>    # tables + <out>.report.md
```

`build_sheet.py` does the following:

- Groups the level screenshots into lessons and keeps the reference pages.
- Reads the Lund and Berlitz tests with their answer keys. The Berlitz scans are OCR'd one column at a time, and their listening part is turned into reading using the transcripts.
- Turns the Rivstart progress tests and their answer key into exercises.
- Builds word cards and a glossary from the kit's word lists, and generates verb-form drills.
- Splits the long PDFs into readable texts: the culture essays, the civics material, the easy-Swedish election guide, the novels and the scanned textbooks.
- Writes everything as plain-text cells, plus a report listing what it skipped and why.

Upload the `.xlsx` to Google Drive, open it with Google Sheets and publish it (see **Using it**).

Parts of the kit are copyrighted: textbooks, worksheets marked "kopiering förbjuden", and novels. The extracted content is for personal study only. It must never be committed here or published. `content/` and `*.xlsx` are git-ignored for that reason.
