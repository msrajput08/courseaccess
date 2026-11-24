CREATE TABLE IF NOT EXISTS paddle_checkout_intents (
 id TEXT PRIMARY KEY NOT NULL,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 tier TEXT NOT NULL CHECK(tier IN ('pro','institution')),
 created_at_ms INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('creating','ready','review','completed','canceled')),
 transaction_id TEXT UNIQUE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_paddle_open_intent ON paddle_checkout_intents(account_id)
 WHERE state IN ('creating','ready','review');
