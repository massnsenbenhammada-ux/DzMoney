"use strict";
const { Pool } = require("pg");

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
  });
  try {
    // Create the current schema for fresh databases.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        reward_coins BIGINT NOT NULL DEFAULT 0,
        reward_dzx NUMERIC(30,9) NOT NULL DEFAULT 0,
        economic_budget_dzx NUMERIC(30,9) NOT NULL DEFAULT 0,
        verification_method TEXT NOT NULL,
        required_count INTEGER NOT NULL DEFAULT 1,
        cadence_seconds INTEGER,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        admin_created BOOLEAN NOT NULL DEFAULT TRUE,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );
    `);

    // Upgrade older installations non-destructively. CREATE TABLE IF NOT EXISTS
    // does not add columns to an existing table, which caused the production
    // seed failure when an earlier tasks table was already present.
    await pool.query(`
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'daily';
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reward_coins BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reward_dzx NUMERIC(30,9) NOT NULL DEFAULT 0;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS economic_budget_dzx NUMERIC(30,9) NOT NULL DEFAULT 0;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS verification_method TEXT NOT NULL DEFAULT 'server_checkin';
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS required_count INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cadence_seconds INTEGER;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS admin_created BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_at BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at BIGINT NOT NULL DEFAULT 0;
    `);

    // Keep timestamps valid for rows introduced by an older schema.
    await pool.query(`
      UPDATE tasks
      SET created_at = CASE WHEN created_at = 0 THEN EXTRACT(EPOCH FROM NOW())::BIGINT * 1000 ELSE created_at END,
          updated_at = CASE WHEN updated_at = 0 THEN EXTRACT(EPOCH FROM NOW())::BIGINT * 1000 ELSE updated_at END
      WHERE created_at = 0 OR updated_at = 0;
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS tasks_type_active_idx ON tasks(type, active);

      CREATE TABLE IF NOT EXISTS task_completions (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        verification JSONB NOT NULL DEFAULT '{}'::jsonb,
        reward_event_id BIGINT REFERENCES task_reward_events(id),
        created_at BIGINT NOT NULL,
        verified_at BIGINT,
        rewarded_at BIGINT
      );
      CREATE INDEX IF NOT EXISTS task_completions_user_idx ON task_completions(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS task_completions_task_idx ON task_completions(task_id, created_at DESC);
    `);
    console.log("Task catalog migration completed.");
  } finally {
    await pool.end();
  }
}

migrate().catch(error => {
  console.error("Task catalog migration failed:", error);
  process.exit(1);
});
