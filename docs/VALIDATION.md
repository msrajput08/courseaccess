# Verification plan and coverage

## Automated

- TypeScript strict type check and production build.
- Unit tests: parser-evidence classification, no false scan claim, figure/math cues, HTML escaping and PDF file validation, entitlement checks.
- Playwright Chromium desktop and mobile tests: marketing navigation and clearly disabled checkout; real generated two-page PDF with text and empty page; HTML download; corrupt file rejection; empty local workspace.
- GitHub Actions uploads screenshots and traces when the browser job executes.

**Do not claim a test passed until CI or a local run actually reports success.** Browser screenshots also need human inspection.

## Release manual matrix

| Scenario | Expected check |
| --- | --- |
| Selectable-text PDF | text extraction, matching original, useful edits and HTML |
| Image-only scan | missing text observation and manual OCR advice |
| Multi-page academic PDF | correct page counts, preview and findings |
| Equations/complex layouts | review markers and manual notation comparison |
| Tables, figures and alt text | manual-review prompts, not fabricated alt checks |
| Corrupt/password PDFs | helpful error and recovery |
| Empty, wrong extension, oversized | validation before parse |
| Mobile/keyboard/screen reader | focus visibility, navigation, status announcements and no overflow |

Production verification is incomplete until real-world academic PDFs, accessibility tooling, visual screenshots, and deployment checks are carried out.

## OCR and tagged PDF regression gate

Verify a real image-only PDF generated from JPEG pixels (not a fake PDF text fixture), confirm OCR text and confidence, then export tagged reading PDF, assert a real `/StructTreeRoot` and `/MarkInfo`, reopen it and confirm selectable text. Separate source PDF/UA conformance validation is not performed by these tests.

## Phase 3: import-integrity regression gate

- Unit cases verify UTF-8 BOM handling, CRLF and CR-delimited files, escaped and multiline CSV quotations, strict malformed-quote errors, row/column limits, and exact reconstruction of text-heavy table chunks.
- Browser cases use genuine ZIP-based DOCX/XLSX fixtures: a long XLSX worksheet must retain its first and last data rows through HTML export, invalid CSV must show an error, and a Word paragraph exceeding the supported block size must be rejected rather than clipped.
- Source extraction is **not** proven pixel-perfect or lossless for every file. Structural fidelity of graphs, formulas, cell merges, text-boxes, pagination and reading order still requires representative original-document reviews.
- A passing synthetic-fixture gate is not equivalent to independent PDF/UA certification, screen-reader usability testing or a real-world multi-format release audit.

## Phase 3 expanded CI coverage

- Real ZIP-based ordering tests verify PowerPoint presentation relationships, Excel workbook worksheet relationships and EPUB OPF spine order, plus a fail-closed missing slide reference.
- Reflowed long tabular sources preserve the true header on every continuation chunk while retaining all data rows. Unit and browser tests check malformed quoted CSV, XLSX tail rows, and oversized DOCX rejection.
- PDF inspection and OCR avoid a successful-looking but incomplete export when source line thresholds are exceeded. Positioned OCR exports fail closed rather than exporting an arbitrary first subset.
- Automated WCAG axe audits now include the **populated editing workspace** on desktop and mobile, not only public routes. Color-contrast fixes are included. This is not a replacement for actual NVDA, JAWS, VoiceOver or TalkBack testing.
- The D1-compatible migration is covered using native SQLite in scripts/test_prebilling_schema.py: schema integrity, idempotency, quotas, cascades and organization roles. The database is not enabled in production.
- Typography assets are bundled locally and tests reject accidental third-party UI font requests. Cloudflare navigation, API and asset mock responses are tested for security/privacy headers.

Passing synthetic fixtures does not prove that arbitrary real-world files, scanned handwriting, documents with macros, complicated multi-column layouts or source-format round trips are complete. Real-world review and screen-reader signoff remain release requirements.

## Local OCR runtime regression

Browser OCR exercises a real JPEG-based image-only PDF; the test now checks that the generated first-party Worker and English model are served from `/ocr/` and that the scan does not request the known external Tesseract model/worker CDNs. The staging script runs automatically before dev and production builds and refuses missing dependencies or any OCR asset larger than Cloudflare's 25 MiB per-file static asset cap. Browser tests on a feature branch do not verify deployed Cloudflare asset routing until a fresh owner-approved deployment and live smoke test.

## Real Cloudflare Worker and CSP gate

`playwright.worker.config.ts` starts `wrangler dev --local` against built static assets, rather than relying on Vite's unprotected development shell. `e2e/worker-security.spec.ts` then checks the actual Worker CSP/security headers, non-HTML OCR asset routes, successful client-side PDF import/HTML export, and real scanned-image OCR under the restrictive CSP without contacting known external Tesseract CDNs. The CI workflow exercises this test separately after the two-browser Vite suite. The release automation additionally requires production CSP and local OCR assets during post-deployment smoke verification. These gates verify technical functionality, not a formal security penetration test.

## Original authored academic corpus gate

`scripts/generate_real_corpus.py` generates a completely original, license-clear integration corpus on each PR: actual `python-docx` DOCX with styled headings, table and a descriptive embedded figure; actual `python-pptx` slides; actual `reportlab` multipage/vector-figure PDF; and valid package-based XLSX, EPUB and ODS samples with workbook relationships, EPUB spine order and compressed repeated spreadsheet rows. `e2e/real-corpus.spec.ts` imports all six, checks expected source text, exported HTML table headings, no mutation of the original input, ordered chapter content, source figure descriptions, PDF diagram review cues, and a tagged DOCX-to-PDF reopened reading copy. Generated originals and SHA-256 hashes are stored as a CI evidence artifact.

These files are *authoring-library-generated controls*, not a statistically representative sample of arbitrary third-party institutional originals. Before public accessibility claims, complete the separate license-cleared field corpus plus manual NVDA, VoiceOver, and TalkBack release matrix. Do not describe a generated PDF reading copy as original-layout tagging repair.

## Additional no-silent-data-loss security gates

- XLSX formula expressions and cached results must both survive import; nonexistent shared string references and incomplete shared-formula XML fail closed.
- DOCX Word footnotes and endnotes are positioned after their references; unresolved note references, merged/nested tables and unsupported Office Math must fail rather than create deceptively complete exports.
- Quoted multiline CSV fields stay a single accessible table cell, without extra row/column breaks.
- Passkey API uses a bounded streaming JSON reader (including no-length or dishonest-length requests), strict UTF-8, and fresh authenticated sessions before institution ownership takeover/deletion. Unit and virtual-authenticator browser suites cover account security.
