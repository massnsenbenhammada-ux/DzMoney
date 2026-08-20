-- Phase 2 foundation: activity, tasks, advertisement contexts and verification gates.
-- This migration adds only Phase 2 state; it does not alter Phase 1 wallet/ledger rules.

CREATE TABLE IF NOT EXISTS activity_tasks (
  id BIGSERIAL PRIMARY KEY,
  task_type TEXT NOT NULL CHECK (task_type IN ('daily', 'game', 'social', 'web', 'special')),
  title TEXT NOT NULL,
  description TEXT,
  reward_coin NUMERIC(30,9) NOT NULL DEFAULT 0 CHECK (reward_coin >= 0),
  reward_dzx NUMERIC(30,9) NOT NULL DEFAULT 0 CHECK (reward_dzx >= 0),
  reward_dzp NUMERIC(30,9) NOT NULL DEFAULT 0 CHECK (reward_dzp >= 0),
  reward_dzp_bucket TEXT NOT NULL DEFAULT 'earned_dzp' CHECK (reward_dzp_bucket = 'earned_dzp'),
  verification_ad_seconds INTEGER NOT NULL DEFAULT 5 CHECK (verification_ad_seconds IN (5, 10)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'active', 'paused', 'completed', 'expired', 'closed', 'refunded')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reward_coin > 0 OR reward_dzx > 0 OR reward_dzp > 0)
);
CREATE INDEX IF NOT EXISTS idx_activity_tasks_status_type ON activity_tasks(status, task_type);

CREATE TABLE IF NOT EXISTS task_attempts (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT NOT NULL REFERENCES activity_tasks(id) ON DELETE RESTRICT,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'executed' CHECK (status IN ('executed', 'verification_pending', 'verified', 'rejected', 'expired')),
  execute_idempotency_key TEXT UNIQUE NOT NULL,
  verify_idempotency_key TEXT UNIQUE,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_task_attempts_user_task ON task_attempts(user_id, task_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_attempts_status ON task_attempts(status);

CREATE TABLE IF NOT EXISTS activity_ad_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context TEXT NOT NULL CHECK (context IN ('task', 'reward_pool', 'daily_checkin', 'verification')),
  external_ad_id TEXT,
  idempotency_key TEXT UNIQUE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_activity_ad_events_user_context ON activity_ad_events(user_id, context, started_at DESC);

CREATE TABLE IF NOT EXISTS task_verification_gates (
  id BIGSERIAL PRIMARY KEY,
  attempt_id BIGINT NOT NULL UNIQUE REFERENCES task_attempts(id) ON DELETE CASCADE,
  required_seconds INTEGER NOT NULL CHECK (required_seconds IN (5, 10)),
  ad_event_id BIGINT REFERENCES activity_ad_events(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ad_completed', 'verified', 'rejected', 'expired')),
  idempotency_key TEXT UNIQUE NOT NULL,
  ad_completed_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_task_verification_gates_status ON task_verification_gates(status);

CREATE TABLE IF NOT EXISTS daily_checkins (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_claimed_at TIMESTAMPTZ,
  ad_event_id BIGINT REFERENCES activity_ad_events(id) ON DELETE RESTRICT,
  claim_idempotency_key TEXT UNIQUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO admin_settings(key, value) VALUES
  ('activity.verification_ad_seconds', '5'::jsonb),
  ('activity.default_reward_coin', '1000'::jsonb),
  ('activity.default_reward_dzx', '1'::jsonb),
  ('activity.default_reward_dzp', '1'::jsonb),
  ('activity.daily_checkin_cooldown_hours', '24'::jsonb)
ON CONFLICT (key) DO NOTHING;
