-- Phase 5: auditable daily Reward Pool accounting and settlement records.
-- Weight is earned activity DZP from qualifying task/advertisement rewards only.
CREATE TABLE IF NOT EXISTS reward_pool_distribution_runs (
  id BIGSERIAL PRIMARY KEY,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  pool_dzx NUMERIC(30,9) NOT NULL CHECK (pool_dzx >= 0),
  total_activity_dzp NUMERIC(30,9) NOT NULL DEFAULT 0 CHECK (total_activity_dzp >= 0),
  total_weight NUMERIC(30,9) NOT NULL DEFAULT 0 CHECK (total_weight >= 0),
  status TEXT NOT NULL DEFAULT 'settled' CHECK (status IN ('settled', 'empty')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ,
  UNIQUE(period_start, period_end)
);

CREATE TABLE IF NOT EXISTS reward_pool_distribution_entries (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES reward_pool_distribution_runs(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  activity_dzp NUMERIC(30,9) NOT NULL CHECK (activity_dzp > 0),
  effective_weight NUMERIC(30,9) NOT NULL CHECK (effective_weight > 0),
  share_ratio NUMERIC(30,18) NOT NULL CHECK (share_ratio > 0),
  reward_dzx NUMERIC(30,9) NOT NULL CHECK (reward_dzx > 0),
  reward_transaction_id BIGINT NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(run_id, user_id),
  UNIQUE(reward_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_reward_pool_distribution_entries_user
  ON reward_pool_distribution_entries(user_id, created_at DESC);
