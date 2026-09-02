-- Phase 5 Gaming: allow the canonical Gaming advertisement context in the shared activity event table.
-- Gaming reuses activity_ad_events; no parallel advertisement/event system is introduced.

ALTER TABLE activity_ad_events
  DROP CONSTRAINT IF EXISTS activity_ad_events_context_check;

ALTER TABLE activity_ad_events
  ADD CONSTRAINT activity_ad_events_context_check
  CHECK (context IN ('task', 'reward_pool', 'daily_checkin', 'verification', 'gaming'));
