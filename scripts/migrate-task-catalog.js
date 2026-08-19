"use strict";
const { Pool } = require("pg");

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false });
  try {
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
      CREATE UNIQUE INDEX IF NOT EXISTS task_completions_user_task_reward_idx
        ON task_completions(user_id, task_id, ((metadata_key_placeholder))); 
    `).catch(async (err) => {
      // The unique expression above is intentionally not relied upon; remove it if a
      // PostgreSQL version rejects the placeholder expression, then continue with
      // the application-level idempotency constraints added below.
      if (err.code !== "42703") throw err;
      await pool.query(`DROP INDEX IF EXISTS task_completions_user_task_reward_idx;`);
    });
    await pool.query(`
      CREATE INDEX IF NOT EXISTS task_completions_user_idx ON task_completions(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS task_completions_task_idx ON task_completions(task_id, created_at DESC);
    `);
    console.log("Task catalog migration completed.");
  } finally { await pool.end(); }
}

migrate().catch(error => { console.error("Task catalog migration failed:", error); process.exit(1); });
