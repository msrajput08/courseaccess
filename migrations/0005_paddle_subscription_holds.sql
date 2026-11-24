-- Refund and chargeback holds require operator reconciliation before release.
CREATE TABLE IF NOT EXISTS paddle_subscription_holds (
 subscription_id TEXT PRIMARY KEY NOT NULL,
 reason TEXT NOT NULL,
 created_at_ms INTEGER NOT NULL
);
