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
