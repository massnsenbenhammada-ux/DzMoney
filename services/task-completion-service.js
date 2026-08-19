"use strict";

const { assertVerified } = require("./task-verification");
const { rewardVerifiedTask } = require("./task-engine");

/**
 * Completes a task only after server-side verification.
 * This service intentionally does not expose HTTP concerns.
 */
async function completeVerifiedTask(client, options) {
  if (!client || typeof client.query !== "function") throw new Error("PostgreSQL client is required.");
  const { userId, task, verification = {}, economicBudgetDZX, squadBonusPercent = 0 } = options || {};
  if (!userId || !task) throw new Error("userId and task are required.");

  assertVerified(task, verification);

  await client.query("BEGIN");
  try {
    const completion = await client.query(
      `INSERT INTO task_completions (user_id, task_id, status, verification, created_at, verified_at)
       VALUES ($1,$2,'verified',$3,$4,$4)
       RETURNING id`,
      [String(userId), String(task.id), JSON.stringify(verification), Date.now()]
    );

    // The reward engine performs its own transaction. Commit the completion first so
    // a successful reward cannot leave an uncommitted completion row behind.
    await client.query("COMMIT");

    try {
      return await rewardVerifiedTask(client, {
        userId,
        taskId: task.id,
        taskType: task.type,
        baseDZX: task.rewardDZX,
        coins: task.rewardCoins,
        squadBonusPercent,
        economicBudgetDZX,
        metadata: { completionId: completion.rows[0].id, verification }
      });
    } catch (error) {
      // A completion can remain verified while reward processing is retried idempotently.
      // The reward event ledger is the source of truth for whether money was credited.
      throw error;
    }
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw error;
  }
}

module.exports = { completeVerifiedTask };
