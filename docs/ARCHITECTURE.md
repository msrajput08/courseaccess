# Architecture and implementation boundaries

## Core choices

- All PDFs are parsed locally in PDF.js; no file upload endpoint or document persistence.
- Pure inspection engine in src/lib/inspection.ts separates verified parser observations from inferred potential issues and manual-review prompts.
- src/lib/pdf.ts validates signature, extension, size and page limits. Text items, approximate transform size, page dimensions, image operators and exposed structure tree are examined.
- src/components/Workspace.tsx draws the original PDF and provides text editing, semantic-role assignment, reviewed figure-description notes and manual checklist.
- src/lib/export.ts escapes untrusted extracted text and creates standalone HTML or JSON.
- src/lib/history.ts stores only explicit opt-in document metadata, not content.
- src/lib/ai.ts defines a disabled provider interface; no AI or third-party document transmission is performed.
- server/entitlements.ts models future verified account privileges and configurable provisional tiers. The actual Worker has **no identity source**, so privileged routes are disabled.
- server/index.ts handles public API and dynamic sitemap/robots with Cloudflare static assets.

## What findings mean

| Signal | Classification | Caveat |
| --- | --- | --- |
| Zero extractable text | Verified | Proves only that parser returned no text items, not that the page is scanned |
| Image operators with zero text | Potential | Not definitive scan detection |
| Very short extractable text | Potential | Could be normal for the page |
| Apparent median text height below 9 PDF points | Potential | Transformed geometry is approximate |
| No exposed structure tree | Potential | Absence of exposed structure is not proof of an untagged document |
| Image paint operations | Human review | Cannot prove alt-text quality or absence |
| Figure/table and math text cues | Human review | No semantic interpretation is attempted |
| Logical reading order / PDF-UA / WCAG | Outside automation | Dedicated validation and human testing required |

An HTML export uses h2 page headings and user-selectable h3, paragraphs, quotes and list items. It includes human-approved descriptions only as **separate text notes**, not linked alt attributes. Images are not exported. Complex columns and equations can change meaning during extraction and must be checked manually.

## Path to SaaS (not yet delivered)

1. Add verified identity and secure server session authorization.
2. Add D1 migrations for accounts, organizations, plans, subscription events and durable usage accounting.
3. Enforce premium entitlements and atomic usage limits server-side; anonymous client processing cannot be metered reliably.
4. Implement Stripe checkout and signed webhook verification with replay protection, idempotency and subscription reconciliation.
5. Add user-consented storage, retention/deletion policies and GDPR/student-data assessment before any remote document processing.
6. Add consent-gated AI providers and human-approval records. Validate DOCX/PPTX and STEM remediation separately.

The current free checker deliberately avoids an insecure imitation of authentication or billing.

### Offline-first remediation additions

`src/lib/ocr.ts` wraps a lazily loaded browser Tesseract worker used only on image-backed pages with no extracted text. `src/lib/taggedPdf.ts` generates a new tagged reading PDF using browser PDFKit and bundled embedded fonts; no original PDF alteration, server processing or paid provider. The new reading PDF must not be represented as a complete repair of arbitrary original PDF structures.
