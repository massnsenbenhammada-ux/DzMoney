const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS dzp BIGINT NOT NULL DEFAULT 0;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dzp_activity_ledger (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        amount NUMERIC(30,8) NOT NULL CHECK (amount >= 0),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, source_type, source_id)
      );
      CREATE INDEX IF NOT EXISTS idx_dzp_activity_user_created
        ON dzp_activity_ledger(user_id, created_at DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS referral_dzp_rewards (
        id BIGSERIAL PRIMARY KEY,
        referrer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        referred_user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(30,8) NOT NULL CHECK (amount >= 0),
        status TEXT NOT NULL DEFAULT 'granted',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dzp_settings (
        key TEXT PRIMARY KEY,
        value NUMERIC(30,8) NOT NULL CHECK (value >= 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      INSERT INTO dzp_settings(key, value) VALUES
        ('referral_dzp_reward', 0),
        ('default_activity_dzp', 0),
        ('ad_dzp_reward', 0)
      ON CONFLICT (key) DO NOTHING;
    `);

    // Keep the AdsGram event table available before the DZP trigger is installed.
    // daily-task-service.js uses the same schema with IF NOT EXISTS.
    await client.query(`
      CREATE TABLE IF NOT EXISTS adsgram_ad_views (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        task_id TEXT NOT NULL DEFAULT 'view_ads',
        status TEXT NOT NULL DEFAULT 'pending',
        provider TEXT NOT NULL DEFAULT 'AdsGram',
        created_at BIGINT NOT NULL,
        confirmed_at BIGINT
      );
      CREATE INDEX IF NOT EXISTS adsgram_ad_views_pending_idx
        ON adsgram_ad_views(user_id, task_id, status, created_at);
    `);

    // Every server-confirmed AdsGram view can award the Admin-defined DZP amount.
    // The ledger's unique key makes the grant idempotent.
    await client.query(`
      CREATE OR REPLACE FUNCTION dzmoney_apply_ad_dzp()
      RETURNS TRIGGER AS $$
      DECLARE
        dzp_amount NUMERIC(30,8);
      BEGIN
        IF NEW.status <> 'confirmed' OR OLD.status = 'confirmed' THEN
          RETURN NEW;
        END IF;

        SELECT COALESCE(value,0) INTO dzp_amount
        FROM dzp_settings
        WHERE key = 'ad_dzp_reward'
        LIMIT 1;

        IF dzp_amount IS NULL OR dzp_amount <= 0 THEN
          RETURN NEW;
        END IF;

        INSERT INTO dzp_activity_ledger(user_id, source_type, source_id, amount, metadata)
        VALUES (
          NEW.user_id, 'AD_VIEW', NEW.id::text, dzp_amount,
          jsonb_build_object('provider',NEW.provider,'task_id',NEW.task_id)
        )
        ON CONFLICT (user_id, source_type, source_id) DO NOTHING;

        IF FOUND THEN
          UPDATE users
          SET dzp = COALESCE(dzp,0) + dzp_amount
          WHERE id = NEW.user_id;

          INSERT INTO economy_ledger(
            user_id, asset, direction, amount, balance_bucket,
            source_type, source_id, metadata, created_at
          ) VALUES (
            NEW.user_id, 'DZP', 'CREDIT', dzp_amount, 'available',
            'AD_VIEW', NEW.id::text,
            jsonb_build_object('provider',NEW.provider,'task_id',NEW.task_id),
            COALESCE(NEW.confirmed_at,NEW.created_at)
          );
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS adsgram_dzp_trigger ON adsgram_ad_views;
      CREATE TRIGGER adsgram_dzp_trigger
      AFTER UPDATE OF status ON adsgram_ad_views
      FOR EACH ROW EXECUTE FUNCTION dzmoney_apply_ad_dzp();
    `);

    await client.query('COMMIT');
    console.log('DZP rules migration: OK');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('DZP rules migration failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
