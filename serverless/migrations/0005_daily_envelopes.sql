CREATE TABLE IF NOT EXISTS device_daily_usage (
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 0,
  hours_json TEXT,
  dimensions_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (device_id, day)
);

CREATE TABLE IF NOT EXISTS user_monthly_usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month INTEGER NOT NULL,
  source_through_day INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 0,
  dimensions_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, month)
);

CREATE TABLE IF NOT EXISTS user_totals (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  through_day INTEGER NOT NULL DEFAULT -1,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_summaries (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  source_updated_at TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  card_generated_at TEXT
);
