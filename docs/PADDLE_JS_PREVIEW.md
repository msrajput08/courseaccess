# Paddle.js live preparation

Billing remains disabled. Public pricing shows proposed USD prices and no purchase buttons. This branch prepares localized pricing and an overlay checkout adapter; it is not a deployed integration.

1. Create or reuse a live_ client token in live Paddle Authentication. Save it as PADDLE_LIVE_CLIENT_TOKEN in GitHub Actions secrets for the read-only audit.
2. For a private local preview only, set VITE_PADDLE_LIVE_CLIENT_TOKEN in .env.local, run npm install and npm run dev, and open /pricing on localhost. Paddle.js initializes once with the live token and previews the existing price IDs. Never put a server API key in a VITE_ variable.
3. Submit the actual checkout hostname for Paddle website approval. After approval and implementation of a working checkout, set the default payment link to that page. Do not set the current disabled pricing page as an operational checkout.
4. Review payment methods, tax mode and balance currency in the dashboard before changing settings.
5. The overlay adapter is tested with a mock only and intentionally not connected to a purchase button. An authenticated server-side transaction flow, verified webhook handling, idempotency, customer association, and entitlements must be implemented and tested before opening checkout. The passkey-only account does not currently have a verified email or Paddle customer ID; never fabricate either.
6. Production CSP is unchanged. When enabling the real checkout, configure the exact required Paddle origins.
7. Do not make a live payment before the separate Test and go live stage. No account verification is initiated here.
