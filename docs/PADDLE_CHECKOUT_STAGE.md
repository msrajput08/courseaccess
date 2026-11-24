# Checkout and webhook test stage

Production billing remains disabled. The dedicated /checkout route is a non-purchasable page on deployed builds. Do not save it as the live default payment link yet: it cannot open a live _ptxn transaction.

Private local checkout: use a separate Paddle sandbox account, create sandbox monthly prices and a test_ client token, set the three VITE_PADDLE_SANDBOX_* entries in .env.local, leave the existing live preview token unset for this run, then npm install and npm run dev. Open /checkout directly in a fresh browser tab. The page uses Paddle's sandbox environment, localized price preview and overlay checkout. No real payment, no entitlement changes. Paddle chooses available wallets by country, currency, device and dashboard settings. Real UPI / Google Pay availability remains unverified.

Webhook test receiver: /api/billing/sandbox-webhook is verification-only, disabled unless a separate staging origin and sandbox signing secret are configured. It explicitly refuses the production and account-service origins. It checks raw HMAC SHA-256, five-second signature freshness and a bounded request body. It does not persist or apply events; never register it as a live notification destination. Test the simulator only on a dedicated staging Worker after configuring that origin and sandbox secret. Do not commit secrets.

Release blockers: implement authenticated server-created transaction intents and customer/account/organization association; durable event receipts and idempotent out-of-order subscription reconciliation; refunds/chargebacks, pause, cancellation and payment-failure handling; paid functionality and server-side enforcement; Paddle CSP and permissions-policy review on the production checkout route; _ptxn payment links; end-to-end sandbox tests, live domain/price and payment method validation, owner-approved deployment. Once a functional live Paddle.js checkout is published and verified, configure the default payment link to the approved /checkout URL.

References:
- https://developer.paddle.com/build/transactions/default-payment-link/
- https://developer.paddle.com/paddle-js/methods/paddle-environment-set/
- https://developer.paddle.com/webhooks/about/signature-verification/
