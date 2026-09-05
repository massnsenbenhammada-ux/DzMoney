-- Phase 5: Squad Ads use the shared advertisement-event source of truth.
-- Extend the existing context constraint without introducing a second event table.

ALTER TABLE activity_ad_events
  DROP CONSTRAINT IF EXISTS activity_ad_events_context_check;

ALTER TABLE activity_ad_events
  ADD CONSTRAINT activity_ad_events_context_check
  CHECK (context IN ('task', 'reward_pool', 'daily_checkin', 'verification', 'gaming', 'squad'));
