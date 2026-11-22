# Launch checklist

- [ ] Owner reviews the PR; no merge without explicit approval.
- [ ] Typecheck, unit tests, production build and browser tests succeed.
- [ ] Inspect actual desktop and mobile screenshots, interaction and responsive layout.
- [ ] Manually test selectable-text, image-only, math, multi-column, multi-page, password-protected and corrupt PDFs.
- [ ] Inspect accessibility with keyboard and screen reader; run suitable formal validators on exported material.
- [ ] Configure verified domain and VITE_PUBLIC_ORIGIN; inspect sitemap, robots, canonical and social links.
- [ ] Add verified business contact, privacy/terms legal review, retention and support workflow.
- [ ] Test CSP and security headers with the PDF.js worker.
- [ ] Deploy only using an authorized Cloudflare account; verify successful deployment.
- [ ] Keep all premium/AI account functionality disabled until signed provider integration and server-side permission checking are implemented.

## Pre-payment completion gate — remaining accountable release tasks

- [ ] Run representative licensed real-world DOCX, PPTX, XLSX, EPUB, ODF and academic PDF source/output comparisons, including reordered slides/sheets, merged cells, figure descriptions, complex equations and low-quality scans; record pass/fail evidence.
- [ ] Inspect desktop/mobile visuals and use keyboard plus actual screen readers; automated axe/veraPDF results alone are insufficient.
- [ ] Review and activate a tested Content-Security-Policy that supports offline/local PDF and OCR runtime assets; verify all production response headers.
- [ ] Register and verify the final custom domain, canonical origin, sitemap and support contact; approve legal/privacy/retention text.
- [ ] Provision and validate D1, security-reviewed passkey authentication, account deletion, institution ownership checks and durable quota enforcement before any paid functionality is enabled.
- [ ] Confirm user-approved merge and deploy; run independent production smoke and accessible-export verification.

Payment gateway integration is intentionally **last**, but these unfinished pre-payment gates cannot be described as complete merely because code migrations and synthetic fixtures exist.
