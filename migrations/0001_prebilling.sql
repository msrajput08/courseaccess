-- CourseAccess pre-billing database contract.
-- Not activated by the free Worker. Enable only after audited identity and D1 provisioning.
-- Every server request MUST set PRAGMA foreign_keys = ON.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 140),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms > 0),
  deleted_at_ms INTEGER
);

CREATE TABLE IF NOT EXISTS passkey_credentials (
  credential_id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  cose_public_key BLOB NOT NULL,
  sign_count INTEGER NOT NULL DEFAULT 0 CHECK(sign_count >= 0),
  created_at_ms INTEGER NOT NULL,
  last_used_at_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_passkeys_account ON passkey_credentials(account_id);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  issued_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms > issued_at_ms),
  revoked_at_ms INTEGER,
  CHECK(revoked_at_ms IS NULL OR revoked_at_ms >= issued_at_ms)
);
CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id, expires_at_ms);

CREATE TABLE IF NOT EXISTS auth_challenges (
  challenge_id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  nonce TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('register','authenticate','add_passkey')),
  expires_at_ms INTEGER NOT NULL,
  consumed_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_challenges_expiry ON auth_challenges(expires_at_ms);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 160),
  created_by TEXT NOT NULL REFERENCES accounts(id),
  created_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS organization_members (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner','admin','editor','viewer')),
  joined_at_ms INTEGER NOT NULL,
  PRIMARY KEY(organization_id,account_id)
);
CREATE INDEX IF NOT EXISTS idx_members_account ON organization_members(account_id);

-- Billing columns are reserved; payment integration must verify signed provider
-- webhooks, never accept browser-authored subscription/tier/status changes.
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  owner_kind TEXT NOT NULL CHECK(owner_kind IN ('account','organization')),
  owner_id TEXT NOT NULL,
  tier TEXT NOT NULL CHECK(tier IN ('free','one-time','pro','institution')),
  status TEXT NOT NULL CHECK(status IN ('active','trialing','past_due','canceled','none')),
  provider TEXT,
  provider_customer_ref TEXT,
  provider_subscription_ref TEXT UNIQUE,
  period_start_ms INTEGER,
  period_end_ms INTEGER,
  verified_at_ms INTEGER,
  CHECK(period_end_ms IS NULL OR period_start_ms IS NOT NULL),
  CHECK(period_end_ms IS NULL OR period_end_ms > period_start_ms)
);

-- These rows must only be created/modified by trusted server code. No
-- user-provided quota or tier is accepted in the document-processing API.
CREATE TABLE IF NOT EXISTS usage_periods (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  period_utc TEXT NOT NULL CHECK(length(period_utc)=7 AND period_utc GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  quota INTEGER NOT NULL CHECK(quota >= 0),
  used INTEGER NOT NULL DEFAULT 0 CHECK(used >= 0 AND used <= quota),
  PRIMARY KEY(account_id,period_utc)
);
CREATE TABLE IF NOT EXISTS usage_events (
  idempotency_key TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  period_utc TEXT NOT NULL,
  occurred_at_ms INTEGER NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('document-processing','premium-export')),
  FOREIGN KEY(account_id,period_utc) REFERENCES usage_periods(account_id,period_utc) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_usage_account_period ON usage_events(account_id,period_utc);

CREATE TRIGGER IF NOT EXISTS reserve_usage_before_insert
BEFORE INSERT ON usage_events
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM usage_events WHERE idempotency_key=NEW.idempotency_key
  ) AND NOT EXISTS(
    SELECT 1 FROM usage_periods
    WHERE account_id=NEW.account_id AND period_utc=NEW.period_utc
  ) THEN RAISE(ABORT,'Usage period is not provisioned') END;
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM usage_events WHERE idempotency_key=NEW.idempotency_key
  ) AND EXISTS(
    SELECT 1 FROM usage_periods
    WHERE account_id=NEW.account_id AND period_utc=NEW.period_utc AND used >= quota
  ) THEN RAISE(ABORT,'Monthly quota exhausted') END;
END;
CREATE TRIGGER IF NOT EXISTS reserve_usage_after_insert
AFTER INSERT ON usage_events
BEGIN
  UPDATE usage_periods SET used=used+1
  WHERE account_id=NEW.account_id AND period_utc=NEW.period_utc;
END;

-- Only verified webhook handlers should write these receipts after signature verification.
CREATE TABLE IF NOT EXISTS payment_event_receipts (
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  verified_at_ms INTEGER NOT NULL,
  applied_at_ms INTEGER,
  PRIMARY KEY(provider,provider_event_id)
);
