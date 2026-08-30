CREATE INDEX IF NOT EXISTS usage_buckets_device_time_idx
  ON usage_buckets(device_id, bucket);

CREATE INDEX IF NOT EXISTS usage_events_time_idx
  ON usage_events(bucket);
