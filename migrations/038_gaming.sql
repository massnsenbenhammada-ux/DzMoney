CREATE TABLE IF NOT EXISTS gaming_config_versions (
  id BIGSERIAL PRIMARY KEY,
  version INTEGER NOT NULL UNIQUE,
  config JSONB NOT NULL,
  actor_telegram_user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gaming_accounts (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  spins INTEGER NOT NULL DEFAULT 0 CHECK (spins >= 0),
  axes INTEGER NOT NULL DEFAULT 0 CHECK (axes >= 0),
  activity_claimed INTEGER NOT NULL DEFAULT 0 CHECK (activity_claimed >= 0),
  activity_day DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'UTC') + INTERVAL '1 hour')::date,
  spin_ad_progress INTEGER NOT NULL DEFAULT 0 CHECK (spin_ad_progress >= 0),
  digging_ad_progress INTEGER NOT NULL DEFAULT 0 CHECK (digging_ad_progress >= 0),
  energy_remaining INTEGER NOT NULL DEFAULT 3 CHECK (energy_remaining >= 0),
  energy_day DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'UTC') + INTERVAL '1 hour')::date,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gaming_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  config_version INTEGER NOT NULL REFERENCES gaming_config_versions(version),
  board JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS gaming_one_active_session_per_user
  ON gaming_sessions(user_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS gaming_spin_results (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  config_version INTEGER NOT NULL REFERENCES gaming_config_versions(version),
  result TEXT NOT NULL,
  reward JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, idempotency_key)
);

INSERT INTO gaming_config_versions(version, config)
VALUES (1, '{
  "enabled": true,
  "dailyActivityLimit": 20,
  "dailyAdLimit": 100,
  "resetTimezone": "UTC+1",
  "spin": {
    "jackpotEnabled": true,
    "jackpotRewardDzx": 25,
    "weights": {
      "coin_100": 400,
      "coin_1000": 40,
      "dzx_1": 20,
      "dzx_10": 2,
      "dzp_1": 20,
      "dzp_10": 2,
      "extra_spin": 16,
      "jackpot": 1,
      "none": 1500
    }
  },
  "digging": {
    "boardSize": 16,
    "energy": 3,
    "jackpotEnabled": false,
    "jackpotRewardDzx": 10,
    "weights": {
      "coin_100": 3,
      "dzx_1": 1,
      "dzp_1": 1,
      "extra_axe": 1,
      "none": 10
    }
  },
  "adBonus": {
    "coin_100": 95,
    "dzx_1": 5
  },
  "diggingAxeEveryAds": 10
}'::jsonb)
ON CONFLICT (version) DO NOTHING;
