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
