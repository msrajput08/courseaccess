# Pre-payment infrastructure: account, institution and quota data

**Status:** Migration and SQLite invariant tests are implemented in the Phase 3 branch. Authentication and paid entitlements are **not enabled**. A database has **not** been provisioned, bound, or migrated on production. No checkout, verified provider events or subscription activation is available.

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
