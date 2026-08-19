"use strict";

const { Pool } = require("pg");

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
  });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS task_reward_events (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        task_id TEXT NOT NULL,
        task_type TEXT NOT NULL,
        base_dzx NUMERIC(30,9) NOT NULL DEFAULT 0,
        squad_bonus_dzx NUMERIC(30,9) NOT NULL DEFAULT 0,
        total_dzx NUMERIC(30,9) NOT NULL DEFAULT 0,
        coins_reward BIGINT NOT NULL DEFAULT 0,
        economic_budget_dzx NUMERIC(30,9) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at BIGINT NOT NULL,
        credited_at BIGINT
      );
      CREATE INDEX IF NOT EXISTS task_reward_events_user_idx ON task_reward_events(user_id,created_at DESC);
      CREATE INDEX IF NOT EXISTS task_reward_events_task_idx ON task_reward_events(task_id,created_at DESC);
    `);
    console.log("Task reward engine migration completed.");
  } finally {
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error("Task reward migration failed:", error);
  process.exit(1);
});
