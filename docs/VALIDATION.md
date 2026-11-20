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
