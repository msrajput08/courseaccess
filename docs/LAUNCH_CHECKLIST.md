# Launch checklist

- [ ] Owner reviews the PR; no merge without explicit approval.
- [ ] Typecheck, unit tests, production build and browser tests succeed.
- [ ] Inspect actual desktop and mobile screenshots, interaction and responsive layout.
- [ ] Manually test selectable-text, image-only, math, multi-column, multi-page, password-protected and corrupt PDFs.
- [ ] Inspect accessibility with keyboard and screen reader; run suitable formal validators on exported material.
- [ ] Configure verified domain and VITE_PUBLIC_ORIGIN; inspect sitemap, robots, canonical and social links.
- [ ] Add verified business contact, privacy/terms legal review, retention and support workflow.
- [ ] Confirm real local Wrangler CSP regression passes and inspect deployed CSP/security headers after an authorized release.
- [ ] Deploy only using an authorized Cloudflare account; verify successful deployment.
- [ ] Keep all premium/AI account functionality disabled until signed provider integration and server-side permission checking are implemented.

## Pre-payment completion gate — remaining accountable release tasks

- [ ] Run representative licensed real-world DOCX, PPTX, XLSX, EPUB, ODF and academic PDF source/output comparisons, including reordered slides/sheets, merged cells, figure descriptions, complex equations and low-quality scans; record pass/fail evidence.
- [ ] Inspect desktop/mobile visuals and use keyboard plus actual screen readers; automated axe/veraPDF results alone are insufficient.
- [ ] Verify deployed Content-Security-Policy and same-origin PDF/OCR processing in a real browser; review CSP before adding any future payment provider origins.
- [ ] Register and verify the final custom domain, canonical origin, sitemap and support contact; approve legal/privacy/retention text.
- [ ] Provision and validate D1, security-reviewed passkey authentication, account deletion, institution ownership checks and durable quota enforcement before any paid functionality is enabled.
- [ ] Confirm user-approved merge and deploy; run independent production smoke and accessible-export verification.

Payment gateway integration is intentionally **last**, but these unfinished pre-payment gates cannot be described as complete merely because code migrations and synthetic fixtures exist.

### Optional account implementation status (22 November 2026)

- [x] Code for origin-validated passkey register/login, backup keys, hashed sessions, logout and account deletion in a feature PR.
- [x] Server-owned organization roles, member-scoped reads and mutations, ownership transfer and delete endpoints.
- [x] Default production service fails closed without D1, exact verified origin and explicit enable flag.
- [ ] Real owner-controlled Cloudflare D1 created/bound/migrated with independently verified backup.
- [ ] Independent security review and real-device passkey/account recovery usability validation.
- [ ] NVDA, VoiceOver, TalkBack and keyboard walkthrough evidence; see `docs/ASSISTIVE_TECH_MATRIX.md`.
- [ ] A license-cleared source/output corpus across PDF, DOCX, XLSX, PPTX, EPUB and OpenDocument with tracked findings.
- [ ] Independent production deployment verification on final canonical domain and operator approval.

All payment/provider/billing activation remains deferred.
