# Cloudflare Workers deployment

## Current status

The initial CourseAccess application was successfully deployed to https://courseaccess.minty-12-shar.workers.dev/ and verified by GitHub Actions run https://github.com/msrajput08/courseaccess/actions/runs/44871520759 (second attempt, 2026-11-21). The smoke test checked the checker route, API health, and sitemap. Future deployments must still independently pass their own checks.

GitHub Actions deployment runs automatically on main pushes or manually via Actions > Deploy CourseAccess to Cloudflare Workers > Run workflow.

## One-time secret setup

In **CourseAccess** GitHub repository > Settings > Secrets and variables > Actions, create two repository **secrets**:

- CLOUDFLARE_API_TOKEN — a Cloudflare API token scoped to the correct account with Workers Edit permissions.
- CLOUDFLARE_ACCOUNT_ID — ID of that Cloudflare account.

Never put either value in a source file, issue, PR comment or chat.

Define the Actions repository variable COURSEACCESS_PUBLIC_ORIGIN as https://courseaccess.minty-12-shar.workers.dev (or a future verified custom domain). The Vite app uses it to build client canonical links. Do not set this to an invented address.

Once configured, manually run the workflow once. On future main pushes, it will deploy automatically.

## Deployment workflow and checks

1. Check for the two secrets without exposing their values. If either is absent, write **deployment skipped** to the workflow summary.
2. Run TypeScript checking, unit tests and production Vite build.
3. Deploy using the official cloudflare/wrangler-action.
4. Use the real deployment URL returned from Wrangler.
5. Perform live health, checker route and sitemap smoke checks. Fail the job if any verification fails.
6. Provide the verified deployment URL in GitHub Actions summary.

No D1, R2, AI provider, checkout or account-service activation is included. Actual Cloudflare usage quotas apply.

Cloudflare official instructions: https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/

## Optional pre-payment account infrastructure (not provisioned)

Do not attach a fictitious D1 database ID to production Wrangler configuration. The Phase 3 migration is an offline-reviewed contract only. After the product owner provisions a real D1 instance and completes audited authentication and organization authorization, configure separate development/production bindings, apply migrations with a backup, and test durable account, session and quota semantics before turning on any account API. See [Pre-billing engineering](PREBILLING.md). No production database is created by this PR.

## OCR model packaging and Cloudflare cost

The prebuild step `node scripts/vendor-ocr.mjs` stages first-party Tesseract worker, core WASM and five language packs in `public/ocr/`. `wrangler.jsonc` bypasses the Worker script for `/ocr/*` so models are delivered as static assets instead of consuming per-request Worker compute. Cloudflare's current static asset per-file limit is 25 MiB; the script checks that limit. Verify with published deployment smoke checks that `/ocr/worker.min.js` and `/ocr/lang/eng.traineddata.gz` return real binary assets, not the SPA HTML shell. Because browsers download models on demand, users may incur initial model download traffic; all OCR inference remains local.

## Production security and first-party OCR preflight

Post-deploy `scripts/verify-deployment-assets.mjs` rejects an HTML response with no restrictive CSP, JavaScript/CSS asset version mismatches, or missing OCR worker/English model assets. `e2e/live.spec.ts` independently checks the deployed security headers and models. These steps only execute after an authorized owner-controlled deployment; the Phase 3 feature branch does not publish any new production version.

## Optional WebAuthn + D1 account rollout

Accounts are strictly **off by default** in the standard `wrangler.jsonc`. The `wrangler.auth.production.example.jsonc` file is an illustrative overlay and deliberately contains an invalid placeholder ID and `COURSEACCESS_ACCOUNTS_ENABLED=false`. Do not deploy that file unedited.

After creating a **real** D1 database in the owner's Cloudflare account, binding it to `DB`, reviewing backups, and applying `0001_prebilling.sql` plus `0002_auth_security.sql` in a staging environment, run local WebAuthn tests and a real-device login/logout/backup-passkey test against the exact final HTTPS origin. Only an explicit reviewed configuration may set the flag to `true`. Keep origin and RP-ID stable: browser passkeys are scoped to RP IDs.

```bash
# Safe: local test DB only
npm run check
npm run build
npm run test:auth:worker

# Operator only, after reviewing the real config and backup:
npx wrangler d1 migrations apply DB --remote --config <approved-production-config>
```

The repository does not have access to the owner's Cloudflare control plane in this chat, so this change does not create, bind or migrate a real D1 production database. The current automated `main` deployment continues using standard `wrangler.jsonc` and leaves account activation off.
