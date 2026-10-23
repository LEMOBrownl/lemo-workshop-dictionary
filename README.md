# LEMO workshop dictionary

A searchable German, English and French reference for machines, packaging and spare parts, based on the supplied 165-page LEMO dictionary.

## Features

- 2,276 imported entries, with categories and machine context.
- Search in any of the three languages, including accents and similar spellings.
- Phone and desktop layouts.
- Favourites, personal notes, additional terms and editable wording.
- Links to the original scanned pages, plus search across all 165 pages.
- Spreadsheet-friendly CSV export and JSON backup / restore.

Favourites, notes and personal edits are saved in each visitor's browser. They are not shared with other visitors and do not automatically sync between devices.

## Publish with GitHub Pages

1. Create a GitHub repository named `lemo-workshop-dictionary`.
2. Upload or push the contents of this folder to its `main` branch. Keep the `docs`, `scripts` and `source-data` directories intact; do not upload only the ZIP archive.
3. In the repository, open **Settings → Pages**.
4. Choose **Deploy from a branch**, then select **main** and **/docs**. Save.
5. Wait for GitHub to finish deploying and use the website link shown in Pages settings to share the dictionary.

No build command, package installation, API key or custom workflow is required. All application links are relative and support a GitHub project subdirectory.

GitHub Pages normally publishes a public website, including the dictionary data and scans. A private repository by itself does not make its Pages website private. GitHub Free supports Pages from public repositories; private-repository Pages requires an eligible paid plan. If access must be limited to colleagues, keep the repository private and use hosting with access control.

## Run locally

From this folder, run:

```bash
python3 -m http.server 8000 --directory docs
```

Then open `http://localhost:8000`. Opening `index.html` directly as a file may prevent the dictionary data from loading.

## Source and import quality

The German-led sections form the main glossary. Exact readings in the English and French reverse indexes add supporting page locations. All reverse-index pages remain available through Source pages. Different translations and machine contexts have been preserved.

This is an OCR import, not a fully corrected dictionary. Low-confidence or incomplete readings are flagged. An unflagged reading is still unverified unless explicitly marked as checked. Thirteen initial rows on printed page 10 were compared visually. Always check the original scan when a reading is uncertain. Personal edits do not alter the source scans.

## Project files

- `docs/`: complete static website, glossary data and source-page images.
- `source-data/Lemo_Woerterbuch.pdf`: unchanged original PDF.
- `scripts/extract_pages.py`: renders and recognises the scan using PyMuPDF, Pillow and Tesseract.
- `scripts/build_dictionary.py`: groups OCR columns into records and applies the documented visual checks.

To rebuild the import, run the extraction script, then the dictionary builder. Intermediate files are kept in the ignored `.work/` directory. Python extraction dependencies and Tesseract are only needed for rebuilding the data; the website itself needs none of them.

## Reference documentation

- [GitHub Pages overview](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Configure a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
