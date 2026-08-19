"use strict";
const { Pool } = require("pg");
const { getDailyTasks } = require("../services/task-catalog");
const { requiredVerifier } = require("../services/task-verification");

async function seed() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
  });
  try {
    const now = Date.now();
    const defaults = {
      daily_ad_task_count: "20",
      updates_channel_url: "",
      daily_task_reward_coins: "1000",
      daily_task_reward_dzx: "1",
      invite_1_reward_coins: "10000",
      invite_1_reward_dzx: "10",
      invite_10_reward_coins: "100000",
      invite_10_reward_dzx: "100"
    };
    for (const [key, value] of Object.entries(defaults)) {
      await pool.query(`INSERT INTO economy_settings(key,value,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO NOTHING`, [key, value, now]);
    }

    for (const task of getDailyTasks()) {
      const cadenceSeconds = task.cadence === "24h" ? 86400 : null;
      const verifier = requiredVerifier(task);
      await pool.query(`
        INSERT INTO tasks
          (id,type,title,description,reward_coins,reward_dzx,economic_budget_dzx,verification_method,required_count,cadence_seconds,active,admin_created,metadata,created_at,updated_at)
        VALUES ($1,'daily',$2,$3,$4,$5,$5,$6,$7,$8,TRUE,TRUE,$9,$10,$10)
        ON CONFLICT (id) DO UPDATE SET
          type=EXCLUDED.type,
          title=EXCLUDED.title,
          description=EXCLUDED.description,
          reward_coins=EXCLUDED.reward_coins,
          reward_dzx=EXCLUDED.reward_dzx,
          verification_method=EXCLUDED.verification_method,
          required_count=EXCLUDED.required_count,
          cadence_seconds=EXCLUDED.cadence_seconds,
          updated_at=EXCLUDED.updated_at
      `, [
        task.id,
        task.title,
        task.description || "",
        task.rewardCoins,
        task.rewardDZX,
        verifier,
        task.requiredCount || 1,
        cadenceSeconds,
        JSON.stringify({ source: "canonical_daily_catalog", referralLifetimeBonus: !!task.referralLifetimeBonus, countSetting: task.countSetting || null }),
        now
      ]);
    }
    console.log(`Seeded ${getDailyTasks().length} canonical daily tasks.`);
  } finally {
    await pool.end();
  }
}

seed().catch(error => { console.error("Task catalog seed failed:", error); process.exit(1); });
