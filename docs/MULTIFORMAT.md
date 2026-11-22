# Multiformat import: supported documents

| Input format | Source extraction | Reading outputs |
| --- | --- | --- |
| PDF | PDF.js extraction plus local OCR on scanned pages | Tagged PDF, semantic HTML, eligible original-layout searchable OCR PDF |
| Word DOCX | WordprocessingML paragraphs, heading styles, lists, tables, image counts | Tagged PDF, HTML |
| PowerPoint PPTX | PresentationML slide text, titles, tables and image descriptions | Tagged PDF, HTML |
| Excel XLSX | SpreadsheetML sheet names, cells, cached formulas and row tables | Tagged PDF, HTML |
| ODT, ODP, ODS | OpenDocument text, headings, lists, tables, slides and sheets | Tagged PDF, HTML |
| EPUB | XHTML chapters, headings and basic text tables | Tagged PDF, HTML |
| HTML | Parsed inertly into headings, lists, tables, paragraphs | Tagged PDF, HTML |
| Markdown, TXT, RTF | Local text/heading/list extraction | Tagged PDF, HTML |
| CSV and TSV | Quoted delimited data into structured tables | Tagged PDF, HTML |
| PNG, JPG/JPEG, WebP | Image decode and optional local Tesseract OCR | Tagged PDF, HTML |

## What the product preserves

Source files stay unchanged. Modern Office and EPUB files are processed in the browser without sending document bytes to CourseAccess servers. Output is a NEW tagged PDF reading copy or semantic HTML, not an in-place modification of Word, Excel, PowerPoint or their layout. Word/PowerPoint/XLSX and other zip formats are validated and bounded. The original-layout OCR PDF is limited to actual eligible scanned PDFs.

Non-PDF previews are extracted-content references, not pixel-perfect Office renders. Original embedded charts, complex formulas, image alt accuracy, merged table cells and page geometry may require checking in the editor. Legacy binary DOC/PPT/XLS, encrypted documents and arbitrary macro-enabled files are not parsed; save them as modern XML formats first.

## Safety limits

- Input max 20 MB.
- Office archive at most 2500 entries, 64 MB uncompressed and 12 MB per XML member.
- Maximum 80 logical sections, sheets, slides or PDF pages; oversized files fail instead of silently converting only the first part.
- External HTML scripts, macros and embed code are not executed.
- OCR model assets and local PDF fonts can be downloaded, but private document bytes remain in the browser.

## QA

Playwright imports actual ZIP fixtures for DOCX, PPTX, XLSX, ODT, ODP, ODS and EPUB. Additional CSV, Markdown and DOCX-to-tagged-PDF round-trip tests exercise extraction and export. A production live test processes DOCX through Cloudflare-hosted app.

## Data-integrity and explicit limits

CSV/TSV accepts UTF-8 BOM, quoted line breaks, escaped quotations, CRLF and CR line endings; malformed quoting is rejected rather than guessed. Large CSV and XLSX tables are split into bounded reading sections without silently clipping at the 12,000-character text-block limit. Delimited data is limited to 16,000 rows and 128 columns, and the current XLSX importer supports the first 128 columns only: data past that limit now causes an error rather than an incomplete export. A single table row or long paragraph that cannot fit the 12,000-character reading-block limit is rejected with guidance to split the source; it is never silently shortened. HTML tables over 200 rows or 16 columns and OpenDocument tables over 200 explicit rows similarly fail closed.

These protections check **unsupported size conditions**, not semantic correctness: source-vs-export comparisons are still required for complex Office tables, repeated/merged ODF cells, charts and mathematical content. Do not market reading-copy outputs as source-layout-preserving or universally compliant.

## Source order and continuation tables

Modern PPTX imports use presentation.xml and its slide relationship file when supplied, instead of blindly sorting slide filenames. XLSX imports use workbook sheet IDs and worksheet relationships, preserving worksheet labels with the correct data. EPUB imports use the OPF manifest and reading spine, so alphabetical file paths cannot silently reorder chapters. Legacy incomplete synthetic packages still use a conservative file-order fallback; an invalid explicit relationship fails rather than making up a new reading order.

Long CSV and XLSX tabular sections reproduce the original first-row column labels for every continuation table. Unique data rows are preserved in source order; continuation tables intentionally repeat headers for semantic accessibility. Unsupported overlong rows/individual paragraphs reject import with an actionable error rather than truncating content. Unmanageable OpenDocument repeated column counts are rejected instead of dropping cells.
