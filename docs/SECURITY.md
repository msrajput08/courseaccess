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

## Optional account service security (not deployed)

The Phase 3 feature branch includes WebAuthn passwordless registration/login using maintained signature verifiers, RP-ID and exact origin checks, user verification, five-minute single-use D1 challenges, 14-day opaque hashed-session cookies (`__Host-`, Secure, HttpOnly, SameSite=Lax), server-side same-origin JSON mutations, size caps, rate limits, revocation, backup credential enrollment and deletion. Organization endpoints require membership on every request. Roles are selected from server-side D1 records; the client cannot assert paid entitlements. D1 uniqueness protects the one-owner invariant. Account recovery after all passkeys are lost is not implemented; users must enroll more than one credential.

**Production safety:** the service requires a real D1 binding, exact `COURSEACCESS_AUTH_ORIGIN` and `COURSEACCESS_ACCOUNTS_ENABLED=true`, all absent in the default deployed Wrangler config. Unprovisioned account routes return 503; no guest is silently granted a premium tier. No payment gateway or cloud document storage exists.

This is application code and automated checks, *not* a third-party penetration test or proof of production-grade IAM. Before activation, independently review threat models, Cloudflare WAF/rate-limit settings, D1 transactions, backup and recovery, account deletion obligations, security headers, session expiry and passkey device compatibility.

## High-impact account actions and bounded API input

Account deletion, organization ownership transfers, and organization deletion require a **passkey-authenticated session issued within the previous 10 minutes**. All other membership actions are server-authorized against current D1 roles. The auth API uses a streaming 16-KiB JSON ceiling: declared Content-Length is not trusted to validate actual body size. A too-large request is cancelled early rather than buffered in memory; UTF-8 decoding is strict. Credential-signature counters are updated monotonically. Rate-limit buckets expire opportunistically after a 48-hour retention window (subject to future application traffic). Cloudflare account activation remains off unless explicitly configured with a trusted origin and migrated D1.

These controls reduce common threats; they are **not** a substitute for a production penetration test, origin-specific mobile/passkey verification, Cloudflare WAF review, incident-response planning, independent data-protection review, or operator-controlled D1 backup/restore.
