"use strict";
const { Pool } = require("pg");

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
  });
  try {
    await pool.query("BEGIN");

    await pool.query(`
      ALTER TABLE tasks
        ADD COLUMN IF NOT EXISTS reward_dzp BIGINT NOT NULL DEFAULT 0;
    `);

    await pool.query(`
      ALTER TABLE packages
        ADD COLUMN IF NOT EXISTS dzp_weight NUMERIC(30,9) NOT NULL DEFAULT 0;
      ALTER TABLE user_packages
        ADD COLUMN IF NOT EXISTS dzp_weight NUMERIC(30,9) NOT NULL DEFAULT 0;

      UPDATE packages
      SET dzp_weight = weight
      WHERE dzp_weight = 0 AND COALESCE(weight,0) > 0;

      UPDATE user_packages
      SET dzp_weight = weight
      WHERE dzp_weight = 0 AND COALESCE(weight,0) > 0;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS rewards_pool_periods (
        id BIGSERIAL PRIMARY KEY,
        period_start BIGINT NOT NULL,
        period_end BIGINT NOT NULL,
        revenue_dzx NUMERIC(30,9) NOT NULL DEFAULT 0,
        pool_dzx NUMERIC(30,9) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CALCULATED','DISTRIBUTED','CANCELLED')),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at BIGINT NOT NULL,
        calculated_at BIGINT,
        distributed_at BIGINT
      );
      CREATE INDEX IF NOT EXISTS rewards_pool_periods_status_idx
        ON rewards_pool_periods(status, period_start DESC);

      CREATE TABLE IF NOT EXISTS rewards_pool_distributions (
        id BIGSERIAL PRIMARY KEY,
        period_id BIGINT NOT NULL REFERENCES rewards_pool_periods(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        activity_dzp NUMERIC(30,9) NOT NULL DEFAULT 0,
        package_dzp NUMERIC(30,9) NOT NULL DEFAULT 0,
        total_weight NUMERIC(30,9) NOT NULL DEFAULT 0,
        total_pool_weight NUMERIC(30,9) NOT NULL DEFAULT 0,
        share_ratio NUMERIC(30,18) NOT NULL DEFAULT 0,
        reward_dzx NUMERIC(30,9) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'CALCULATED' CHECK (status IN ('CALCULATED','CREDITED','VOID')),
        created_at BIGINT NOT NULL,
        credited_at BIGINT,
        UNIQUE(period_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS rewards_pool_distributions_user_idx
        ON rewards_pool_distributions(user_id, created_at DESC);
    `);

    await pool.query(`
      CREATE OR REPLACE FUNCTION dzmoney_apply_task_dzp()
      RETURNS TRIGGER AS $$
      DECLARE
        dzp_amount NUMERIC(30,8);
      BEGIN
        IF NEW.status <> 'credited' THEN
          RETURN NEW;
        END IF;

        IF NEW.task_id IN ('view_ads','daily_checkin') THEN
          RETURN NEW;
        END IF;

        SELECT COALESCE(NULLIF(t.reward_dzp,0), s.value, 0)
        INTO dzp_amount
        FROM tasks t
        LEFT JOIN dzp_settings s ON s.key = 'default_activity_dzp'
        WHERE t.id = NEW.task_id;

        IF dzp_amount IS NULL OR dzp_amount <= 0 THEN
          RETURN NEW;
        END IF;

        INSERT INTO dzp_activity_ledger(
          user_id, source_type, source_id, amount, metadata
        ) VALUES (
          NEW.user_id, 'TASK_COMPLETION', NEW.id::text, dzp_amount,
          jsonb_build_object('task_id',NEW.task_id,'task_type',NEW.task_type)
        )
        ON CONFLICT (user_id, source_type, source_id) DO NOTHING;

        IF FOUND THEN
          UPDATE users SET dzp = COALESCE(dzp,0) + dzp_amount WHERE id = NEW.user_id;
          INSERT INTO economy_ledger(
            user_id, asset, direction, amount, balance_bucket,
            source_type, source_id, metadata, created_at
          ) VALUES (
            NEW.user_id, 'DZP', 'CREDIT', dzp_amount, 'available',
            'ACTIVITY_WEIGHT', NEW.id::text,
            jsonb_build_object('task_id',NEW.task_id,'task_type',NEW.task_type),
            COALESCE(NEW.credited_at,NEW.created_at)
          );
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS task_reward_dzp_trigger ON task_reward_events;
      CREATE TRIGGER task_reward_dzp_trigger
      AFTER INSERT ON task_reward_events
      FOR EACH ROW EXECUTE FUNCTION dzmoney_apply_task_dzp();
    `);

    // A referred user qualifies on the first finalized task/ad reward.
    // The referrer receives the Admin-defined DZP amount once, and never again
    // from that referred user's future activity.
    await pool.query(`
      CREATE OR REPLACE FUNCTION dzmoney_apply_referral_dzp()
      RETURNS TRIGGER AS $$
      DECLARE
        sponsor_id TEXT;
        reward_amount NUMERIC(30,8);
        inserted_id BIGINT;
      BEGIN
        IF NEW.status <> 'credited' THEN
          RETURN NEW;
        END IF;

        SELECT referred_by INTO sponsor_id
        FROM users
        WHERE id = NEW.user_id
        FOR UPDATE;

        IF sponsor_id IS NULL OR sponsor_id = NEW.user_id THEN
          RETURN NEW;
        END IF;

        SELECT COALESCE(value,0) INTO reward_amount
        FROM dzp_settings
        WHERE key = 'referral_dzp_reward'
        LIMIT 1;

        IF reward_amount IS NULL OR reward_amount <= 0 THEN
          RETURN NEW;
        END IF;

        IF EXISTS (
          SELECT 1 FROM referral_dzp_rewards
          WHERE referred_user_id = NEW.user_id
        ) THEN
          RETURN NEW;
        END IF;

        INSERT INTO referral_dzp_rewards(referrer_user_id,referred_user_id,amount,status)
        VALUES(sponsor_id,NEW.user_id,reward_amount,'granted')
        ON CONFLICT (referred_user_id) DO NOTHING
        RETURNING id INTO inserted_id;

        IF inserted_id IS NULL THEN
          RETURN NEW;
        END IF;

        UPDATE users
        SET dzp = COALESCE(dzp,0) + reward_amount,
            referral_qualified_at = COALESCE(referral_qualified_at, EXTRACT(EPOCH FROM NOW())::BIGINT),
            referral_lifetime_enabled = TRUE
        WHERE id = sponsor_id;

        INSERT INTO economy_ledger(
          user_id, asset, direction, amount, balance_bucket,
          source_type, source_id, metadata, created_at
        ) VALUES (
          sponsor_id, 'DZP', 'CREDIT', reward_amount, 'available',
          'REFERRAL_DZP', inserted_id::text,
          jsonb_build_object('referred_user_id',NEW.user_id,'one_time',true),
          COALESCE(NEW.credited_at,NEW.created_at)
        );

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS referral_dzp_trigger ON task_reward_events;
      CREATE TRIGGER referral_dzp_trigger
      AFTER INSERT ON task_reward_events
      FOR EACH ROW EXECUTE FUNCTION dzmoney_apply_referral_dzp();
    `);

    await pool.query("COMMIT");
    console.log("Rewards pool migration: OK (activity DZP + package DZP weights + pool/distribution + one-time referral DZP ready)");
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => {});
    console.error("Rewards pool migration failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
