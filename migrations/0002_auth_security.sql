-- Additional security and consistency controls for passkey authentication.
-- Apply after 0001_prebilling.sql. No payment provider or subscription writes.
ALTER TABLE auth_challenges ADD COLUMN pending_display_name TEXT;
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket TEXT PRIMARY KEY NOT NULL,
  window_start_ms INTEGER NOT NULL,
  hits INTEGER NOT NULL CHECK(hits > 0)
);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_window ON auth_rate_limits(window_start_ms);

-- Session owner is the only identity source; a browser-supplied tier is never trusted.
-- Prevent writes to security-sensitive session/credential tables by application guests.
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at_ms);
CREATE INDEX IF NOT EXISTS idx_passkeys_last_used ON passkey_credentials(last_used_at_ms);
CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_one_owner ON organization_members(organization_id) WHERE role = 'owner';
