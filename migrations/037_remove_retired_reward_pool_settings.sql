-- Retire Reward Pool configuration from the active product surface.
-- Historical Reward Pool ad-event rows remain immutable; runtime no longer accepts
-- the retired context and no migration rewrites historical economic records.
DELETE FROM admin_settings WHERE key LIKE 'reward_pool.%';
