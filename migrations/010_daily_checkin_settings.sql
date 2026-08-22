-- Phase 2: Daily Check-in reward settings. Existing migration files remain immutable.

INSERT INTO admin_settings(key, value) VALUES
  ('activity.daily_checkin_reward_coin', '1000'::jsonb),
  ('activity.daily_checkin_reward_dzx', '1'::jsonb),
  ('activity.daily_checkin_reward_dzp', '1'::jsonb),
  ('activity.daily_checkin_cooldown_hours', '24'::jsonb)
ON CONFLICT (key) DO NOTHING;
