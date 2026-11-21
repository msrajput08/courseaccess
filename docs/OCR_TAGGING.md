# OCR and tagged reading copies

## What is implemented

**OCR:** PDF.js identifies pages without original selectable text and with image-paint operations. Tesseract.js (lazy loaded) renders each such page at higher resolution and recognizes words on the device. One worker is reused across affected pages and then terminated. It supports English, Hindi, Spanish, French and German models chosen before upload. OCR text is stored only in the current browser session, separately marked from original PDF text, with confidence and failure provenance. It is immediately editable in the same workflow as extracted text.

Tesseract.js loads runtime assets and language data from the internet on first use, with subsequent caching. Document pixels are not uploaded to the CourseAccess server or an AI inference provider. Do not promise fully offline operation on a first scan.

**Tagged PDF reading output:** The user can generate a fresh PDF with PDFKit; it includes an actual logical structure tree, ordered headings/paragraphs/lists and document-language metadata, using embedded Noto Sans fonts. The generated document includes user-edited blocks and approved notes. It is a **new reflowed text-based reading copy**; it does **not** mutate, directly repair or replace the original PDF's internal structure.

If OCR yields no text, the user can add recovered text manually. If PDF font or generation fails, the app reports the failure rather than claiming export success. The source PDF remains intact.

## What it does NOT do

- Fully retag arbitrary existing PDF content streams **in place** (in particular vector diagrams, link annotations, multi-column text, tables with merged headers, forms or spatially complex mathematics).
- Guarantee OCR character-level correctness on low-resolution, handwritten or mixed-language material.
- Generate reliable alternative text for figures or mathematical semantics from visual appearance.
- Supply PDF/UA certification. **Tagged** and **PDF/UA conformant** are different claims. A PDF/UA assertion requires validator results and meaningful semantics for *all* original content.

## How to test

1. In the browser choose the OCR language, leave automatic OCR enabled and upload a real scanned multi-page lecture PDF. Check the "OCR text recovered" evidence and edit errors.
2. Use "Download tagged PDF"; check that a PDF is downloaded and the original file remains untouched.
3. Reopen the generated PDF in the checker or PDF.js and verify that text is selectable and the structure tree is exposed. Test reading order with a screen reader.
4. Run local unit tests, Playwright integration tests for an actual image-only JPEG XObject and tagged-PDF export, and production browser smoke tests.
5. Validate the generated file separately with a current PDF/UA checker before asserting conformance. Tag presence alone is insufficient.

## Privacy and resource boundaries

OCR is CPU and RAM intensive on the user's device. The app processes pages sequentially, limits render pixel count and reuses one Tesseract worker. Browser tab memory, model-download failures and large scanned documents can still exceed local resource capacity. Document bytes do not leave the browser as part of this workflow. Language models/fonts may be fetched as public static resources; never send private page images to a third party without separate consent.

External technical references: Tesseract.js documentation, PDFKit accessibility guide, W3C tagged PDF accessibility guidance.
