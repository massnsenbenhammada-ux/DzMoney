-- Phase 5: Gaming Ads are a first-class advertisement context.
-- Keep the shared activity_ad_events source of truth; only extend its allowed context values.

ALTER TABLE activity_ad_events
  DROP CONSTRAINT IF EXISTS activity_ad_events_context_check;

ALTER TABLE activity_ad_events
  ADD CONSTRAINT activity_ad_events_context_check
  CHECK (context IN ('task', 'reward_pool', 'daily_checkin', 'verification', 'gaming'));
