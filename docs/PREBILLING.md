# Pre-payment infrastructure: account, institution and quota data

**Status:** Phase 3 includes a real optional passkey/session and institution-membership implementation, local D1 test configuration and database migrations. Production account activation is **disabled** because a real owner's D1 database and verified origin have not been provisioned/bound/migrated. The free checker stays public. All paid entitlements, hosted document storage and checkout remain disabled.

## Design boundary

The current public CourseAccess Worker intentionally has no authoritative identity. All imports and exports run in the browser, so the free local checker must not claim a tamper-proof per-user processing allowance. Paid functionality is off until it is routed through verified, authorized server endpoints; hiding UI controls is not an entitlement system.

`migrations/0001_prebilling.sql` prepares Cloudflare D1-compatible SQLite tables for:

- Accounts, hashed session tokens, passkey credentials, expiring single-use challenges
- Organizations and role-constrained memberships
- Subscription states to be assigned only from server-verified billing events
- Server-provisioned monthly quotas and uniquely identified usage events
- Webhook event receipts for future signed, idempotent processing

Monthly reservations are guarded by SQLite triggers. Inserting the same event ID twice using `INSERT OR IGNORE` does not consume a second unit, including after allowance exhaustion. Attempts exceeding quota fail atomically. Database-level constraints and foreign keys are covered by `scripts/test_prebilling_schema.py`.

## Before enabling any login or premium access

1. Select and configure a verified production domain and passkey/WebAuthn relying-party ID. Use a maintained FIDO2/WebAuthn verifier; never authenticate from a browser-reported email or tier.
2. Provision a **separate D1 database** for development and production in the owner's authorized Cloudflare account. For example: `npx wrangler d1 create courseaccess-primary`. Copy the generated database ID into an owner-reviewed Wrangler binding; do not invent an ID or run production migrations from PR tests.
3. Back up the database and review schema/migration with a security owner. Apply with `npx wrangler d1 migrations apply DB --remote` after the `DB` binding exists. Verify `PRAGMA foreign_keys=ON`.
4. Implement auditable passkey registration/authentication challenges (user verification, challenge expiration and one-time consumption), short-lived server sessions with hashed tokens and secure `HttpOnly; Secure; SameSite` cookies; CSRF protection; session invalidation; account deletion and recovery. No credential material or raw session token is logged.
5. Add organization membership authorization to every organization-scoped API and document content access. Do not infer authorization from an organization ID supplied by the browser.
6. Route any premium compute/export through authenticated server endpoints and reserve usage transactionally; simple browser-side controls cannot prevent quota bypass. Add rate limiting, abuse controls, and tested backups/recovery.
7. Only **after** these checks should a payment provider be integrated using signed webhook verification, replay protection and reconciliation. The provider is not yet selected or configured; never trust a browser's billing status.

## Database retention and security

Source document bytes are not in these tables. A privacy-reviewed policy is required for account identifiers, organization memberships, account deletion and billing receipts, including legal record-retention obligations. No external AI or hosted document storage is introduced by this schema. Passkey enrollment, cross-device recovery, institutional access, legal/privacy review and independent security testing remain necessary.

## Validation

```sh
python3 -m unittest discover -s scripts -p 'test_*.py'
```

This proves local SQLite constraints. It does **not** prove end-to-end secure authentication, Cloudflare D1 production behavior or multi-tenant access control.

Reference: Cloudflare D1 migrations https://developers.cloudflare.com/d1/reference/migrations/ ; D1 batch atomicity https://developers.cloudflare.com/d1/worker-api/d1-database/.

## Implemented server and browser flows

- `POST /api/auth/register/options` and `register/verify`: discoverable device passkey registration via SimpleWebAuthn, origin/RP verification, user verification, atomic D1 challenge consumption and account+credential+session creation.
- `POST /api/auth/login/options` and `login/verify`: discoverable passkey sign-in, origin/challenge/signature/counter verification, hashed opaque 14-day session in a Secure/HttpOnly/SameSite cookie.
- `POST /api/auth/passkeys/options` and `passkeys/verify`: add an independent backup passkey to a signed-in account. **No insecure email-only account recovery is present.**
- `GET /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/delete`: server-backed session lookup, revocation and deletion. Deletion requires a recently verified (10-minute) session plus an exact confirmation phrase; organizations owned by the user are deleted too.
- `/api/organizations`: registered account creation and listing; authenticated member listing, controlled addition/removal, owner-approved role changes, atomic ownership transfer and owner deletion. Only registered account IDs can be added—no unverified email invitations.
- Origin-checked JSON mutations, one-time expiring challenges, D1-backed request-rate limiting, request size caps and server-only authorization checks. The UI never determines security-critical roles or paid entitlements.

**Not shipped automatically:** an independent production security audit, production D1 binding, customer domain validation, account recovery for users without any passkey, meaningful institutional collaboration/cloud storage or owner-approved release. A membership is a directory/authorization boundary and is not yet a paid team workspace.

### Isolated test commands

```sh
npm install
npm run check
npm run build
npm run test:auth:worker
```

The last command starts a *local* Cloudflare Worker, applies both migrations to an isolated local D1 database and runs real Chromium virtual-authenticator WebAuthn ceremonies, membership and CSRF checks. The test database ID in `wrangler.auth.test.jsonc` is a fixture only; **never bind it to a production Worker**.

## Owner-controlled production D1 provisioning (required before activation)

1. Log in to the correct Cloudflare account using Wrangler. Verify final domain and the account's D1 quotas and backups. The current example uses the already deployed workers.dev origin; custom domains require an RP-ID/origin migration plan because passkeys are origin-bound.
2. Run `npx wrangler d1 create courseaccess-primary` **once** and note the real generated ID outside any secrets/log text. Do not create an arbitrary ID. Use a separate database for staging.
3. Copy `wrangler.auth.production.example.jsonc` to an owner-controlled config. Set the exact real D1 ID, verified HTTPS `COURSEACCESS_AUTH_ORIGIN`, and leave `COURSEACCESS_ACCOUNTS_ENABLED=false`.
4. Back up, apply `npx wrangler d1 migrations apply DB --remote --config <your-config>` and verify schema, database permissions, indexes, usage triggers and sample account round-trip in staging first. Never apply production migrations against an unexpected account.
5. Perform external security review, actual passkey/device testing, retention/legal checks, rate-limit/WAF review and restore exercise. Only then change `COURSEACCESS_ACCOUNTS_ENABLED` to `true` and publish using the approved config. Confirm the API status and session behavior on the exact domain, and inspect CSP.
6. Keep `COURSEACCESS_PLANS_JSON` paid features disabled; a payment gateway and signed reconciliation are separate future work.

Do not publish the example template as-is: its placeholder ID will never identify a real database. No live provisioning or production account activation is performed by this PR.
