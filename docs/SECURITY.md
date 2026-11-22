# Privacy and security

- Academic PDFs stay in browser memory. No document bytes go to a CourseAccess API.
- Local validation limits PDF to 20 MB, 80 pages and 2.5 million preview canvas pixels. PDF.js disables evaluation of dynamic functions.
- Exported HTML escapes extracted text, educator edits, filenames and approved notes; do not insert PDF content directly as raw HTML.
- The optional local workspace stores only filename, date, page count and issue count. It has an explicit delete option. Browser localStorage remains accessible to scripts served by the same origin.
- API exposes only public health, plan and anonymous entitlements. Premium mutations fail closed. No remotely processed documents or expensive endpoints are enabled, so future server-side rate limiting must be built when authentication and cloud processing exist.
- AI is disabled. Never send student data to external services without user disclosure and explicit consent.
- Production requires a deployed and tested CSP compatible with the PDF/OCR workers, secure session design, scoped ownership checks, rate limits for server-side workloads, signed future payment-provider webhooks and a data-retention policy.
- Privacy and terms pages describe current behavior, not legal approval, GDPR, FERPA, WCAG or PDF/UA certification.
- Website UI fonts (DM Sans and DM Serif Display) are bundled and served locally. The OCR Worker, WASM core and supported English/Hindi/Spanish/French/German language packs are staged as first-party static assets at build time; document pixels and recognized text remain in the browser. Models are downloaded by the end user's browser on demand from CourseAccess's own origin.

### Client-side OCR

Tesseract.js worker and recognition models are fetched as executable/static resources on demand. Documents and page pixels are processed locally; no OCR API receives the document. Fonts are packaged from an open-source Noto Sans dependency for tagged PDF generation. OCR status is scoped to the current in-memory inspection. Evaluate CSP and third-party dependency updates before institutional rollout.

### Phase 3 hardening

The Worker now applies a first-party Content-Security-Policy alongside X-Frame-Options: DENY, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy restrictions, X-Content-Type-Options: nosniff and Cross-Origin-Resource-Policy: same-origin. CSP restricts executable code, external connections and embedding, while explicitly allowing same-origin workers and WebAssembly compilation. Local Wrangler CSP/browser tests run in PR CI; a real deployed production smoke/assistive-technology review remains required before release. Future payment integrations must explicitly review any provider-specific CSP origins.

No authenticated sessions, credentials, organizations or usage records are persisted by the public app. D1 SQL migration files exist only as a prospective schema. Security validation for future passkeys, CSRF/rate limits, organization authorization, account deletion and webhook integrity must happen before enabling paid offerings.

## First-party OCR asset boundary

`scripts/vendor-ocr.mjs` copies Tesseract.js core variants, the browser Worker and a fixed set of `.traineddata.gz` language models into `public/ocr/` during `npm run build` or `npm run dev`. Files are built from installed npm packages, and build fails if a package or file is missing or an asset exceeds Cloudflare's 25 MiB individual static-file limit. These static files are served directly by Cloudflare Workers Static Assets (not the paid Worker handler). Inspect third-party npm license and model terms before production distribution. Model downloads are still network requests on first use, but now use only the application's own domain. No remote OCR inference service receives document content.
