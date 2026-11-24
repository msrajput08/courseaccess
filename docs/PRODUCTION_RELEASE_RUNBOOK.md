# Single release sequence — no payment before fulfillment

The default payment URL is exactly https://courseaccess.minty-12-shar.workers.dev/checkout. Paddle appends _ptxn to this page. The URL must be deployed and Paddle.js must be verified in a real browser before enabling checkout. Dashboard configuration alone cannot publish the page.

Webhook receipts are persisted before acknowledgment; Workers waitUntil processes them and a five-minute cron retries unapplied events from D1 when the live inbox and reconciliation flags are enabled. The cron is idle otherwise. Transaction cancellation is verified against Paddle before freeing an intent; an ambiguous create still needs operator reconciliation. Select transaction.canceled in the destination in addition to the other subscription and transaction events.

Release in one coordinated sequence:
1. Verify branch checks, migration schema/ledger, paid product fulfillment (not just entitlement flags), real signed lifecycle and browser checkout tests. Do not market unavailable features.
2. Review and merge the candidate only after gates pass. Production deploy from main with existing credentials and explicit secret sync; no billing activation flags by default. Verify the deployed pages and API without payment.
3. Verify Paddle default payment link and signing destination on the approved domain. The read-only preflight checks the exact URL, not merely hostname, and does not require a new sandbox account.
4. Enable collection only when the owner explicitly authorizes a release and actual paid features and provider lifecycle verification pass. The current code does not grant blanket production readiness.

Reference: https://developer.paddle.com/build/transactions/default-payment-link/ and https://developer.paddle.com/webhooks/about/respond-to-webhooks/
