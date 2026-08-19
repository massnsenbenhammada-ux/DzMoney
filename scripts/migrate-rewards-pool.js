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
        dzp_amount BIGINT;
      BEGIN
        IF NEW.status <> 'credited' THEN
          RETURN NEW;
        END IF;

        SELECT COALESCE(reward_dzp,0) INTO dzp_amount
        FROM tasks WHERE id = NEW.task_id;

        IF dzp_amount IS NULL OR dzp_amount <= 0 THEN
          RETURN NEW;
        END IF;

        UPDATE users
        SET dzp = COALESCE(dzp,0) + dzp_amount
        WHERE id = NEW.user_id;

        INSERT INTO economy_ledger(
          user_id, asset, direction, amount, balance_bucket,
          source_type, source_id, metadata, created_at
        ) VALUES (
          NEW.user_id, 'DZP', 'CREDIT', dzp_amount, 'available',
          'ACTIVITY_WEIGHT', NEW.id::text,
          jsonb_build_object('task_id',NEW.task_id,'task_type',NEW.task_type),
          COALESCE(NEW.credited_at,NEW.created_at)
        );

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS task_reward_dzp_trigger ON task_reward_events;
      CREATE TRIGGER task_reward_dzp_trigger
      AFTER INSERT ON task_reward_events
      FOR EACH ROW EXECUTE FUNCTION dzmoney_apply_task_dzp();
    `);

    await pool.query("COMMIT");
    console.log("Rewards pool migration: OK (activity DZP + package DZP weights + pool/distribution ledger ready)");
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => {});
    console.error("Rewards pool migration failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
