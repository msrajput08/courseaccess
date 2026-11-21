# Privacy and security

- Academic PDFs stay in browser memory. No document bytes go to a CourseAccess API.
- Local validation limits PDF to 20 MB, 80 pages and 2.5 million preview canvas pixels. PDF.js disables evaluation of dynamic functions.
- Exported HTML escapes extracted text, educator edits, filenames and approved notes; do not insert PDF content directly as raw HTML.
- The optional local workspace stores only filename, date, page count and issue count. It has an explicit delete option. Browser localStorage remains accessible to scripts served by the same origin.
- API exposes only public health, plan and anonymous entitlements. Premium mutations fail closed. No remotely processed documents or expensive endpoints are enabled, so future server-side rate limiting must be built when authentication and cloud processing exist.
- AI is disabled. Never send student data to external services without user disclosure and explicit consent.
- Production requires reviewed CSP compatible with the PDF worker, secure session design, scoped ownership checks, rate limits for server-side workloads, signed Stripe webhooks and a data-retention policy.
- Privacy and terms pages describe current behavior, not legal approval, GDPR, FERPA, WCAG or PDF/UA certification.
- Fonts currently load from Google Fonts; self-host before launch if a stricter no-third-party request policy is required.

### Client-side OCR

Tesseract.js worker and recognition models are fetched as executable/static resources on demand. Documents and page pixels are processed locally; no OCR API receives the document. Fonts are packaged from an open-source Noto Sans dependency for tagged PDF generation. OCR status is scoped to the current in-memory inspection. Evaluate CSP and third-party dependency updates before institutional rollout.
