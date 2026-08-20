CREATE TABLE IF NOT EXISTS deposit_daily_usage (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  ton_used NUMERIC(30,9) NOT NULL DEFAULT 0 CHECK (ton_used >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, usage_date)
);

INSERT INTO deposit_daily_usage (user_id, usage_date, ton_used)
SELECT user_id, created_at::date, SUM(ton_amount)
FROM deposits
WHERE status = 'CONFIRMED'
GROUP BY user_id, created_at::date
ON CONFLICT (user_id, usage_date) DO UPDATE
SET ton_used = EXCLUDED.ton_used,
    updated_at = NOW();
