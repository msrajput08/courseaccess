# CourseAccess

**Every lesson. Accessible to everyone.**

CourseAccess is a privacy-conscious, educator-first PDF accessibility review product. React + TypeScript + Vite, PDF.js and Cloudflare Workers.

## What works

- Custom responsive educational marketing website, labeled interactive example, free checker, pricing, resources and legal pages.
- PDF inspection in the browser; no document uploads, account or checkout.
- File validation: PDF extension and header, maximum 20 MB and 80 pages.
- Text extraction and page-by-page PDF canvas preview; verified observations, potential issues and manual review reminders.
- Editable semantic text blocks and manually approved separate figure-description notes.
- Downloadable inspection JSON and escaped HTML draft, not a certified accessible PDF.
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

No password login, PDF/UA certification, OCR, automatic PDF tagging repair, external AI generation, team collaboration, Stripe checkout, account-wide quota enforcement, hosted storage or production deployment. Paid plans are clearly **planned**, not active. These require separate secure systems.

See [Architecture](docs/ARCHITECTURE.md), [Validation](docs/VALIDATION.md), [Security](docs/SECURITY.md), and [Launch checklist](docs/LAUNCH_CHECKLIST.md).

No license has been granted by the repository owner.
