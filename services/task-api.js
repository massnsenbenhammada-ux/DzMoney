"use strict";

async function getTaskSettings(pool) {
  const { rows } = await pool.query(`SELECT key,value FROM economy_settings WHERE key IN ('daily_ad_task_count','updates_channel_url','adsgram_block_id')`);
  return Object.fromEntries(rows.map(row => [row.key, row.value]));
}

async function getAdProgress(pool, userId) {
  const { rows } = await pool.query(`SELECT verification FROM task_completions WHERE user_id=$1 AND task_id='view_ads' AND status IN ('pending','rewarded') ORDER BY created_at DESC LIMIT 1`, [String(userId)]);
  if (!rows.length) return 0;
  const verification = rows[0].verification && typeof rows[0].verification === "object" ? rows[0].verification : {};
  return Math.max(0, Number(verification.adCount || 0));
}

async function listAvailableTasks(pool, userId) {
  const settings = await getTaskSettings(pool);
  const { rows } = await pool.query(`
    SELECT t.*, c.created_at AS last_completed_at, c.status AS last_status
    FROM tasks t
    LEFT JOIN LATERAL (SELECT created_at, status FROM task_completions WHERE task_id=t.id AND user_id=$1 ORDER BY created_at DESC LIMIT 1) c ON TRUE
    WHERE t.active=TRUE
    ORDER BY CASE t.type WHEN 'daily' THEN 1 WHEN 'game' THEN 2 WHEN 'social' THEN 3 WHEN 'web' THEN 4 WHEN 'special' THEN 5 WHEN 'partner' THEN 6 ELSE 99 END, t.created_at
  `, [String(userId)]);
  const now = Date.now();
  const adProgress = await getAdProgress(pool, userId);
  return rows.map(row => {
    const cooldown = row.cadence_seconds == null ? null : Number(row.cadence_seconds);
    const last = row.last_completed_at == null ? null : Number(row.last_completed_at);
    const nextAvailableAt = cooldown && last ? last + cooldown * 1000 : null;
    const requiredCount = row.id === "view_ads" ? Math.max(1, Number(settings.daily_ad_task_count || 20)) : Number(row.required_count || 1);
    const metadata = row.metadata && typeof row.metadata === "object" ? { ...row.metadata } : {};
    if (row.id === "view_ads") {
      metadata.count = requiredCount;
      metadata.completedCount = Math.min(requiredCount, adProgress);
      if (settings.adsgram_block_id) metadata.adsgramBlockId = String(settings.adsgram_block_id);
    }
    if (row.id === "check_updates" && settings.updates_channel_url) metadata.channelUrl = settings.updates_channel_url;
    return {
      id: row.id,
      type: row.type,
      title: row.id === "view_ads" ? `View ${requiredCount} Ads` : row.title,
      description: row.id === "invite_1" || row.id === "invite_10" ? `${row.description || "Invite qualifying friends."} Earn a lifetime 20% referral share from eligible referred activity.` : row.description,
      rewardCoins: row.reward_coins,
      rewardDZX: row.reward_dzx,
      requiredCount,
      progress: row.id === "view_ads" ? { completedCount: Math.min(requiredCount, adProgress), requiredCount } : null,
      verificationMethod: row.verification_method,
      metadata,
      available: row.id === "view_ads" ? adProgress < requiredCount : (!nextAvailableAt || now >= nextAvailableAt),
      nextAvailableAt,
      lastStatus: row.last_status || null
    };
  });
}

async function startTask(pool, userId, taskId) {
  const taskResult = await pool.query(`SELECT * FROM tasks WHERE id=$1 AND active=TRUE`, [String(taskId)]);
  if (!taskResult.rows.length) throw new Error("Task not found or inactive.");
  const task = taskResult.rows[0];
  if (String(taskId) === "view_ads") {
    const existing = await pool.query(`SELECT id,task_id,status,created_at FROM task_completions WHERE user_id=$1 AND task_id='view_ads' AND status='pending' ORDER BY created_at DESC LIMIT 1`, [String(userId)]);
    if (existing.rows.length) return { task, completion: existing.rows[0] };
  }
  const now = Date.now();
  const cooldown = task.cadence_seconds == null ? null : Number(task.cadence_seconds);
  if (cooldown && task.id !== "view_ads") {
    const recent = await pool.query(`SELECT created_at FROM task_completions WHERE user_id=$1 AND task_id=$2 AND status IN ('pending','verified','rewarded') ORDER BY created_at DESC LIMIT 1`, [String(userId), String(taskId)]);
    if (recent.rows.length && now < Number(recent.rows[0].created_at) + cooldown * 1000) {
      const error = new Error("Task is on cooldown."); error.code = "TASK_COOLDOWN"; error.nextAvailableAt = Number(recent.rows[0].created_at) + cooldown * 1000; throw error;
    }
  }
  const result = await pool.query(`INSERT INTO task_completions (user_id,task_id,status,verification,created_at) VALUES ($1,$2,'pending','{}'::jsonb,$3) RETURNING id,task_id,status,created_at`, [String(userId), String(taskId), now]);
  return { task, completion: result.rows[0] };
}

module.exports = { listAvailableTasks, startTask };
