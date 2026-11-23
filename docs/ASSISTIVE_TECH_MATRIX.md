# Assistive-technology release matrix

This checklist must be completed with **real assistive technology** and a recorded, license-cleared document corpus. A green axe-core test or PDF/UA validator is **not** a substitute for hearing the document in a screen reader. Leave untested cases marked **NOT RUN** rather than claiming they passed.

## Source corpus and evidence

Maintain one license-cleared original per scenario: selectable academic PDF, 300 DPI English+Hindi scans, two-column PDF with footnotes, STEM formulas, figures/charts needing accurate alternative text, merged-header tables, DOCX with footnotes and nested headings, PPTX with grouped objects/speaker notes, XLSX with formulas/merged cells, EPUB with spine order, and ODF presentation/spreadsheet. Record source checksum, license/provenance, input language, browser and OS, output checksum, screenshot/recording (with consent), exact observed error and reproducible steps. Do not upload student records, unpublished coursework or copyrighted restricted textbooks to public CI.

## Hands-on scenarios

| Platform | Assistive technology | Action | Required result | Status |
| --- | --- | --- | --- | --- |
| Windows / Chromium | NVDA latest supported | Keyboard-only account creation/login plus dialog dismissal and errors | Correct labels and focus, no focus trap, errors announced | NOT RUN |
| Windows / Chromium | NVDA | Navigate heading/landmarks/lists/tables in exported HTML | Correct reading order, header associations, math explanation | NOT RUN |
| Windows / Acrobat Reader | NVDA | Read generated PDF/UA sample and original complex specimen | Correct announced logical order, no duplicated/omitted content | NOT RUN |
| macOS / Safari | VoiceOver | Navigate public pages, form labels, upload, remediation editor | All controls reachable with useful accessible names | NOT RUN |
| macOS / Preview or Acrobat | VoiceOver | Read corrected STEM/figure exports | Correct focus order and mathematical descriptions | NOT RUN |
| Android / Chrome | TalkBack | Account creation, menu, local file upload, review and export | No touch target/scroll/focus blockers | NOT RUN |
| iOS / Safari | VoiceOver | Local file analysis, table editing, download and alerts | Status and keyboard announcements understandable | NOT RUN |

## Reviewer protocol

1. Record browser, OS, screen reader, version, sample ID, exact reproduction and expected semantics.
2. Start with source visual/text baseline. Compare text completeness, order, figure labels, table relationships and original design. Any lost content is a blocking defect, not a success note.
3. Repeat with screen reader enabled, screen-reader off/keyboard-only, and at 200% browser zoom. Include reduced-motion and high-contrast settings.
4. Independently inspect actual generated PDFs with veraPDF CLI and a PDF/UA-compatible viewer; zero validator failures do not prove good human-readable descriptions.
5. Classify each result as PASS, FAIL, BLOCKED, or NOT RUN. Do not merge a release claiming universal compliance while required cases are NOT RUN.
6. Keep original student data local and record only redacted findings/screenshots approved by the document owner.

## Automated coverage versus manual status

Current PR CI checks TypeScript, unit tests, Playwright, browser accessibility rules, D1 passkey/authorization integration, and independent veraPDF sample conformance. These are regression barriers, not a substitute for human testing with a screen reader. **No manual NVDA, VoiceOver or TalkBack test has been executed in this ChatGPT environment.**
