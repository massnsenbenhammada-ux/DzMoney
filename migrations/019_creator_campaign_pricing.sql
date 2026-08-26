-- Creator Campaign reference pricing.
-- Admin controls the live price; 9 DZX is the initial/default value.
-- Existing administrator values are preserved.

INSERT INTO admin_settings(key, value) VALUES
  ('task.campaign_price_dzx_per_execution', '9'::jsonb)
ON CONFLICT (key) DO NOTHING;
