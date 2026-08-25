ALTER TABLE users ADD COLUMN referral_code TEXT;

UPDATE users
SET referral_code = UPPER(SUBSTRING(md5(id::text || ':' || random()::text || ':' || clock_timestamp()::text), 1, 10))
WHERE referral_code IS NULL;

ALTER TABLE users
  ALTER COLUMN referral_code SET DEFAULT UPPER(SUBSTRING(md5(random()::text || ':' || clock_timestamp()::text), 1, 10)),
  ALTER COLUMN referral_code SET NOT NULL,
  ADD CONSTRAINT users_referral_code_format CHECK (referral_code ~ '^[A-Z0-9]{10}$');

CREATE UNIQUE INDEX idx_users_referral_code ON users(referral_code);
