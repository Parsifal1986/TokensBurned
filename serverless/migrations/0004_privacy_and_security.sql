ALTER TABLE users ADD COLUMN public_card INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN publish_harness INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN publish_provider INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN publish_model INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN publish_heatmap INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN publish_rank INTEGER NOT NULL DEFAULT 0;

ALTER TABLE devices ADD COLUMN expires_at TEXT;
UPDATE devices
   SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+180 days')
 WHERE expires_at IS NULL;

ALTER TABLE device_authorizations ADD COLUMN confirmation_hash TEXT;

CREATE TABLE IF NOT EXISTS rate_limits (
  scope TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  window INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (scope, subject_hash, window)
);

CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits(window);
