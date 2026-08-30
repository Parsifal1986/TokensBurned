CREATE TABLE IF NOT EXISTS device_authorizations (
  id TEXT PRIMARY KEY,
  device_code_hash TEXT NOT NULL UNIQUE,
  user_code TEXT NOT NULL COLLATE NOCASE UNIQUE,
  oauth_state_hash TEXT UNIQUE,
  device_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  authorized_at TEXT,
  claimed_at TEXT
);

CREATE INDEX IF NOT EXISTS device_authorizations_expiry_idx
  ON device_authorizations(expires_at);

