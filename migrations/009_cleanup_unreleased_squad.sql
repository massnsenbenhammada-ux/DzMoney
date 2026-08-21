-- Cleanup for the premature Phase 4 Squad foundation.
-- Migration 008 is intentionally left immutable for migration history.
-- This migration makes every environment converge back to the Phase 2 boundary.

DROP TABLE IF EXISTS squad_goal_distributions;
DROP TABLE IF EXISTS squad_goal_contributions;
DROP TABLE IF EXISTS squad_goals;
DROP TABLE IF EXISTS squad_daily_bonus_days;
DROP TABLE IF EXISTS squad_activity_events;
DROP TABLE IF EXISTS squad_memberships;
DROP TABLE IF EXISTS squads;

DELETE FROM admin_settings
WHERE key IN (
  'squad.inactivity_days',
  'squad.daily_min_active_members',
  'squad.daily_bonus_rate',
  'squad.daily_activity_threshold_percent',
  'squad.daily_activity_window_days'
);
