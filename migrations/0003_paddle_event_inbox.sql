-- Durable, deduplicated provider event references; no personal payloads.
CREATE TABLE IF NOT EXISTS paddle_event_inbox (
  event_id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at_ms INTEGER NOT NULL,
  object_id TEXT NOT NULL,
  received_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_paddle_inbox_object ON paddle_event_inbox(object_id,occurred_at_ms);
