CREATE TABLE IF NOT EXISTS deposits (
  id BIGSERIAL PRIMARY KEY,
  idempotency_key TEXT UNIQUE NOT NULL,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  blockchain TEXT NOT NULL DEFAULT 'TON',
  tx_hash TEXT NOT NULL UNIQUE,
  ton_amount NUMERIC(30,9) NOT NULL CHECK (ton_amount > 0),
  dzx_amount NUMERIC(30,9) NOT NULL CHECK (dzx_amount > 0),
  confirmation_count INTEGER NOT NULL DEFAULT 0 CHECK (confirmation_count >= 0),
  required_confirmations INTEGER NOT NULL CHECK (required_confirmations > 0),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deposits_user_id_idx ON deposits(user_id);
CREATE INDEX IF NOT EXISTS deposits_status_idx ON deposits(status);
CREATE INDEX IF NOT EXISTS deposits_tx_hash_idx ON deposits(tx_hash);

INSERT INTO admin_settings(key, value) VALUES
  ('deposit.required_confirmations', '1'::jsonb),
  ('deposit.enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
