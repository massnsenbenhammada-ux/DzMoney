"use strict";

const DAY_SECONDS = 86400;

async function getSetting(pool, key, fallback = null) {
  const { rows } = await pool.query("SELECT value FROM economy_settings WHERE key=$1 LIMIT 1", [key]);
  return rows.length ? rows[0].value : fallback;
}

async function ensureDailySettings(pool) {
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
  const now = Date.now();
  for (const [key, value] of Object.entries(defaults)) {
    await pool.query(`INSERT INTO economy_settings(key,value,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO NOTHING`, [key, value, now]);
  }
}

async function verifyAndRewardDailyTask(pool, userId, taskId, verification = {}) {
  const uid = String(userId);
  const id = String(taskId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const taskResult = await client.query("SELECT * FROM tasks WHERE id=$1 AND active=TRUE FOR UPDATE", [id]);
    if (!taskResult.rowCount) throw Object.assign(new Error("Task not found or inactive."), { code: "TASK_NOT_FOUND" });
    const task = taskResult.rows[0];
    if (task.type !== "daily") throw Object.assign(new Error("This endpoint is only for daily tasks."), { code: "INVALID_TASK_TYPE" });
    if (task.verification_method !== "server_checkin") {
      throw Object.assign(new Error("This task requires external verification before reward."), { code: "EXTERNAL_VERIFICATION_REQUIRED", method: task.verification_method });
    }

    const since = Date.now() - DAY_SECONDS * 1000;
    const recent = await client.query(`
      SELECT id,status,created_at,verification FROM task_completions
      WHERE user_id=$1 AND task_id=$2 AND created_at >= $3 AND status IN ('pending','verified','rewarded')
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE
    `, [uid, id, since]);
    if (recent.rowCount && ["verified", "rewarded"].includes(recent.rows[0].status)) {
      throw Object.assign(new Error("Task is already completed for today."), { code: "TASK_ALREADY_COMPLETED" });
    }

    const now = Date.now();
    let completion;
    if (recent.rowCount) {
      const result = await client.query(`
        UPDATE task_completions SET status='rewarded',verification=$1::jsonb,verified_at=$2,rewarded_at=$2
        WHERE id=$3 RETURNING id,task_id,status,created_at,rewarded_at
      `, [JSON.stringify({ verified: true, method: "server_checkin", ...verification }), now, recent.rows[0].id]);
      completion = result.rows[0];
    } else {
      const result = await client.query(`
        INSERT INTO task_completions(user_id,task_id,status,verification,created_at,verified_at,rewarded_at)
        VALUES($1,$2,'rewarded',$3::jsonb,$4,$4,$4)
        RETURNING id,task_id,status,created_at,rewarded_at
      `, [uid, id, JSON.stringify({ verified: true, method: "server_checkin", ...verification }), now]);
      completion = result.rows[0];
    }

    const coins = BigInt(String(task.reward_coins || 0));
    const dzx = String(task.reward_dzx || "0");
    const event = await client.query(`
      INSERT INTO task_reward_events(user_id,task_id,task_type,base_dzx,squad_bonus_dzx,total_dzx,coins_reward,economic_budget_dzx,status,metadata,created_at,credited_at)
      VALUES($1,$2,$3,$4,0,$4,$5,$4,'credited',$6::jsonb,$7,$7) RETURNING id
    `, [uid, id, task.type, dzx, coins.toString(), JSON.stringify({ verification: "server_checkin", daily: true }), now]);

    await client.query("UPDATE task_completions SET reward_event_id=$1 WHERE id=$2", [event.rows[0].id, completion.id]);
    await client.query("UPDATE users SET coins=COALESCE(coins,0)+$1, dzx=COALESCE(dzx,0)+$2 WHERE id=$3", [coins.toString(), dzx, uid]);
    await client.query(`
      INSERT INTO economy_ledger(user_id,asset,direction,amount,balance_bucket,source_type,source_id,metadata,created_at)
      VALUES($1,'COINS','CREDIT',$2,'available','TASK_REWARD',$3,$4::jsonb,$5),
            ($1,'DZX','CREDIT',$6,'withdrawable','TASK_REWARD',$3,$4::jsonb,$5)
    `, [uid, coins.toString(), String(event.rows[0].id), JSON.stringify({ taskId: id, taskType: task.type }), now, dzx]);

    await client.query("COMMIT");
    return { completion, rewardEventId: String(event.rows[0].id), coins: coins.toString(), dzx };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { ensureDailySettings, getSetting, verifyAndRewardDailyTask };
