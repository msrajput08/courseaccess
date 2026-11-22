# Privacy and security

- Academic PDFs stay in browser memory. No document bytes go to a CourseAccess API.
- Local validation limits PDF to 20 MB, 80 pages and 2.5 million preview canvas pixels. PDF.js disables evaluation of dynamic functions.
- Exported HTML escapes extracted text, educator edits, filenames and approved notes; do not insert PDF content directly as raw HTML.
- The optional local workspace stores only filename, date, page count and issue count. It has an explicit delete option. Browser localStorage remains accessible to scripts served by the same origin.
- API exposes only public health, plan and anonymous entitlements. Premium mutations fail closed. No remotely processed documents or expensive endpoints are enabled, so future server-side rate limiting must be built when authentication and cloud processing exist.
- AI is disabled. Never send student data to external services without user disclosure and explicit consent.
- Production requires reviewed CSP compatible with the PDF worker, secure session design, scoped ownership checks, rate limits for server-side workloads, signed Stripe webhooks and a data-retention policy.
- Privacy and terms pages describe current behavior, not legal approval, GDPR, FERPA, WCAG or PDF/UA certification.
- Website UI fonts (DM Sans and DM Serif Display) are bundled and served locally. OCR worker/core/language resources may still download externally on demand; source document pixels and text remain in the browser.

### Client-side OCR

Tesseract.js worker and recognition models are fetched as executable/static resources on demand. Documents and page pixels are processed locally; no OCR API receives the document. Fonts are packaged from an open-source Noto Sans dependency for tagged PDF generation. OCR status is scoped to the current in-memory inspection. Evaluate CSP and third-party dependency updates before institutional rollout.

### Phase 3 hardening

The Worker applies X-Frame-Options: DENY, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy restrictions, X-Content-Type-Options: nosniff and Cross-Origin-Resource-Policy: same-origin to its owned responses. A production Content-Security-Policy still requires testing against local PDF workers and on-demand OCR model loading, and must not be turned on blindly.

No authenticated sessions, credentials, organizations or usage records are persisted by the public app. D1 SQL migration files exist only as a prospective schema. Security validation for future passkeys, CSRF/rate limits, organization authorization, account deletion and webhook integrity must happen before enabling paid offerings.
