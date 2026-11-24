CREATE TABLE IF NOT EXISTS paddle_customers (
 customer_id TEXT PRIMARY KEY NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('active','archived')),
 updated_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS paddle_subscription_catalog (
 subscription_id TEXT PRIMARY KEY NOT NULL REFERENCES subscriptions(provider_subscription_ref) ON DELETE CASCADE,
 customer_id TEXT NOT NULL,
 price_id TEXT NOT NULL,
 product_id TEXT NOT NULL,
 provider_status TEXT NOT NULL CHECK(provider_status IN ('active','trialing','past_due','paused','canceled')),
 scheduled_action TEXT,
 scheduled_at_ms INTEGER,
 updated_at_ms INTEGER NOT NULL,
 scope_review INTEGER NOT NULL DEFAULT 0 CHECK(scope_review IN (0,1))
);
