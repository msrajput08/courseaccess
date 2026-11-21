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
