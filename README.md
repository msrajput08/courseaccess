# CourseAccess

**Every lesson. Accessible to everyone.**

CourseAccess is a privacy-conscious, educator-first PDF accessibility review product. React + TypeScript + Vite, PDF.js and Cloudflare Workers.

## What works

- Custom responsive educational marketing website, labeled interactive example, free checker, pricing, resources and legal pages.
- PDF inspection **and automatic image-backed-page OCR** in the browser; no document uploads, account or checkout.
- File validation: PDF extension and header, maximum 20 MB and 80 pages.
- Text extraction and page-by-page PDF canvas preview; verified observations, potential issues and manual review reminders.
- Editable semantic text blocks and manually approved separate figure-description notes.
- Downloadable inspection JSON, semantic HTML, and **new semantically tagged PDF reading copies** generated from extracted or OCR text and user-approved edits. Original PDF bytes are not modified. This is not a PDF/UA conformance certificate.
- Optional localStorage of **metadata only**, with deletion from the local workspace.
- Deny-by-default Worker APIs with configurable provisional plan data.
- Unit tests and Chromium desktop/mobile browser workflows in GitHub Actions.

## Run

Requires Node 20.19 or newer.

    npm install
    npm run dev

To run automated checks:

    npm run check
    npx playwright install chromium
    npm run test:e2e

Do not consider the above tests successful without checking actual local or GitHub Actions results.

## Cloudflare deployment

The Wrangler configuration combines built static assets and the server-side API entry points.

    npm install
    npm run build
    npx wrangler login
    npx wrangler deploy

Deploy only after owner approval. Configure a verified production domain and build-time VITE_PUBLIC_ORIGIN so runtime canonical tags are correct. Worker-generated sitemap.xml and robots.txt derive their canonical host dynamically. If using a static host without the Worker, replace courseaccess.example in the public files first. No payment integration, AI or D1/R2 binding is enabled.

Environment: VITE_PUBLIC_ORIGIN (canonical site origin); COURSEACCESS_PLANS_JSON (optional Worker JSON plan price and quota override, paid availability stays false). No API secrets are needed for the current local PDF checker.

## What is not implemented

No password login, PDF/UA certification or **in-place repair of arbitrary original PDF tag trees**, external generative AI, team collaboration, Stripe checkout, account-wide quota enforcement or hosted document storage. The source PDF is not rewritten. Automated OCR supports English, Hindi, Spanish, French and German selectable recognition models and may need corrections. New reading PDFs have true structure tags but are **not a guarantee of PDF/UA conformance**. Paid plans are clearly **planned**, not active. These require separate secure systems.

See [Architecture](docs/ARCHITECTURE.md), [Validation](docs/VALIDATION.md), [Security](docs/SECURITY.md), and [Launch checklist](docs/LAUNCH_CHECKLIST.md).

No license has been granted by the repository owner.

## OCR and tagged reading PDF

The checker enables **automatic OCR** by default for pages with embedded images but no original PDF text items. Pick the language before upload (English, Hindi, Spanish, French or German). The first OCR task downloads the necessary Tesseract.js worker/model assets; the pixels stay in the browser. OCR confidence and failure status appear per page. If a page has no image or model download is blocked, an editable transcription fallback remains available.

Use **Download tagged PDF** in the workspace to generate a new reading copy with an actual PDF logical structure tree, semantic H1/H2/H3/P/L tags, document language and embedded Noto Sans fonts. It reflects your edited blocks and approved figure descriptions. The output reflows text and does not preserve/retag every figure, form, annotation, complex table or mathematical layout in the original PDF. Formal PDF/UA claims require validation (e.g. PAC/veraPDF plus assistive technology). The original source stays unchanged.

See [OCR and tagged reading export engineering notes](docs/OCR_TAGGING.md) for accuracy limitations and test protocol.

## Phase 2: original-layout searchable PDF

For image-only scanned PDFs, CourseAccess can now produce a **third download**: *Keep layout + searchable OCR*. It loads a copy of the original PDF, retains the page images and places invisible recognized words at their scanned positions, enabling PDF search and text selection without reflowing the visible pages. This is deliberately separate from the existing **new tagged reading PDF**, which provides semantic headings and lists but reflows the page layout. The source file is never overwritten.

The searchable source-layout PDF **is not a fully accessible or PDF/UA compliant PDF**. It contains an OCR text layer, not repaired semantic tags. Its positioned OCR is taken from the automatic recognition results; manual text edits affect the tagged reading copy and HTML, not the original-layout OCR layer. Rotated, signed, form, tagged or unsupported PDFs are refused rather than risking loss of semantics or incorrect word placement. Runtime download only appears when valid OCR word locations exist. See docs/OCR_TAGGING.md.

## Professional remediation studio

The browser workspace now supports structured tables (first row becomes real column headings), edited LaTeX converted to native MathML for semantic HTML, equation explanations, configurable heading levels and manual reading-order rearrangement. The same corrected blocks feed the tagged PDF reading-copy generator, which writes Table/TR/TH/TD and Formula structure tags. Page-level approved figure descriptions are kept separate from images not reproduced. A live quality panel performs checks on **the edited content**, flagging empty pages, low OCR confidence, malformed tables, invalid formula syntax, absent spoken math explanations, unreviewed figures and heading-level jumps. JSON evidence can be exported.

The audit is a document-content quality gate, **not PDF/UA certification**. No claim is made that all original content can be safely retagged in place. For accurate PDF/UA validation use an independent verifier such as veraPDF, assistive technology and a representative course-content test corpus. No AI vision provider runs on private page images without user consent.
