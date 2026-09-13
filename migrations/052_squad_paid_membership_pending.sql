-- Phase 4: persist paid Squad membership interest requests without charging DZP.
CREATE TABLE IF NOT EXISTS squad_membership_purchase_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  min_members INTEGER NOT NULL,
  max_members INTEGER,
  price NUMERIC(30,9) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS squad_membership_purchase_requests_user_pending_key
  ON squad_membership_purchase_requests (user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS squad_membership_purchase_requests_tier_order_key
  ON squad_membership_purchase_requests (min_members, max_members, created_at, id)
  WHERE status = 'pending';
