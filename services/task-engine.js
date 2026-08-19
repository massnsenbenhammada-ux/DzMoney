"use strict";

const { creditDZX } = require("./economy-ledger");

const TASK_TYPES = Object.freeze(["daily", "game", "social", "web", "special", "partner"]);

function calculateReward({ baseDZX = 0, coins = 0, squadBonusPercent = 0 }) {
  const base = Number(baseDZX);
  const coinReward = Number(coins);
  const bonus = Number(squadBonusPercent);
  if (!Number.isFinite(base) || base < 0) throw new Error("Invalid base DZX reward.");
  if (!Number.isSafeInteger(coinReward) || coinReward < 0) throw new Error("Invalid Coins reward.");
  if (!Number.isFinite(bonus) || bonus < 0 || bonus > 100) throw new Error("Invalid Squad bonus.");
  const squadBonusDZX = base * bonus / 100;
  return { baseDZX: base, squadBonusDZX, totalDZX: base + squadBonusDZX, coins: coinReward };
}

async function rewardVerifiedTask(client, options) {
  if (!client || typeof client.query !== "function") throw new Error("PostgreSQL client is required.");
  const { userId, taskId, taskType, economicBudgetDZX, sourceType = "task_reward", metadata = {} } = options || {};
  if (!userId || !taskId) throw new Error("userId and taskId are required.");
  if (!TASK_TYPES.includes(String(taskType))) throw new Error("Unsupported task type.");
  const reward = calculateReward(options);
  const budget = Number(economicBudgetDZX);
  if (!Number.isFinite(budget) || budget < reward.totalDZX) throw new Error("Task economic budget is insufficient.");

  await client.query("BEGIN");
  try {
    const existing = await client.query(
      `SELECT id,status FROM task_reward_events WHERE user_id=$1 AND task_id=$2 AND status IN ('pending','credited') ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [String(userId), String(taskId)]
    );
    if (existing.rowCount) {
      await client.query("ROLLBACK");
      return { credited: false, duplicate: true, event: existing.rows[0] };
    }

    const event = await client.query(
      `INSERT INTO task_reward_events
       (user_id,task_id,task_type,base_dzx,squad_bonus_dzx,total_dzx,coins_reward,economic_budget_dzx,status,metadata,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10) RETURNING id`,
      [String(userId), String(taskId), String(taskType), reward.baseDZX, reward.squadBonusDZX, reward.totalDZX, reward.coins, budget, JSON.stringify(metadata), Date.now()]
    );

    if (reward.totalDZX > 0) {
      await creditDZX(client, {
        userId: String(userId), amount: reward.totalDZX, balanceType: "withdrawable",
        sourceType, sourceId: String(event.rows[0].id),
        metadata: { taskId: String(taskId), taskType: String(taskType), baseDZX: reward.baseDZX, squadBonusDZX: reward.squadBonusDZX, ...metadata }
      });
    }
    if (reward.coins > 0) {
      const updated = await client.query(`UPDATE users SET coins=coins+$2 WHERE id=$1 RETURNING id`, [String(userId), reward.coins]);
      if (!updated.rowCount) throw new Error("User not found while crediting Coins.");
    }
    await client.query(`UPDATE task_reward_events SET status='credited',credited_at=$2 WHERE id=$1`, [event.rows[0].id, Date.now()]);
    await client.query("COMMIT");
    return { credited: true, eventId: event.rows[0].id, ...reward };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

module.exports = { TASK_TYPES, calculateReward, rewardVerifiedTask };
