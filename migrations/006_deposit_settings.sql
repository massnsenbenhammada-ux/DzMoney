-- Backfill deposit settings for databases where 004_deposits.sql
-- was already recorded before these settings were introduced.
-- Do not modify an administrator's existing value if one already exists.
INSERT INTO admin_settings(key, value) VALUES
  ('deposit.daily_limit_ton', '10'::jsonb),
  ('deposit.pending_timeout_hours', '24'::jsonb)
ON CONFLICT (key) DO NOTHING;
