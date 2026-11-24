# Billing pages and production webhook inbox

Branch preparation only; no deployment, D1 migration, live payment or Paddle dashboard change is authorized by this commit.

Routes:
- /checkout: private local sandbox checkout; deployed page remains non-purchasable until production SDK initialization and release gates are implemented.
- /billing: authenticated read-only subscription summary, no plan changes.
- /api/billing/status: no-store session-scoped read of existing verified account subscriptions.
- /api/billing/webhook: signed production inbox, disabled by default. The endpoint stores event references idempotently in D1 only after verification; it never grants access. Other event families are ignored. Do not enable the live inbox until a consumer and monitoring are ready. The endpoint requires the exact production origin, D1 migration 0003, PADDLE_LIVE_WEBHOOK_SECRET (Worker secret), and COURSEACCESS_LIVE_WEBHOOK_INBOX_ENABLED=true.
- /api/billing/sandbox-webhook: isolated sandbox verification receiver.

The planned default payment link is https://courseaccess.minty-12-shar.workers.dev/checkout; do not set as operational until the live page initializes Paddle.js and supports _ptxn payment links. The planned production notification destination is https://courseaccess.minty-12-shar.workers.dev/api/billing/webhook; do not send live events until the signed receiver, durable reconciliation consumer and entitlement tests are deployed. Only subscribe to events required for subscription and transaction reconciliation rather than every event.

Remaining: server-created checkout intents, Paddle customer/subscription ownership association, canonical state reconciliation with out-of-order protection and refund handling, real premium features and entitlement enforcement, management portal, deployed sandbox tests and owner-approved live release. No payment collection yet.

## Secret deployment
The repository secret PADDLE_LIVE_WEBHOOK_SECRET stays server-side. The branch CI verifies its presence without printing it or contacting Paddle. On an owner-approved release from main, manually dispatch the Deploy CourseAccess workflow with sync_paddle_webhook_secret checked. This passes a restricted temporary JSON secrets file to Wrangler on the same deployment and removes it even on failure. It does not set COURSEACCESS_LIVE_WEBHOOK_INBOX_ENABLED or enable checkout. Never dispatch production from a billing branch. Applying the D1 migration, implementing canonical reconciliation and testing signed deliveries remain separate release gates.
