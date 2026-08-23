const { withTransaction, query } = require('../db/pool');
const { validateVerificationConfig } = require('./task-verification-config');
const { postEconomyTransactionOnClient } = require('./economy-service');

const TASK_TYPES = ['daily', 'game', 'social', 'web', 'special'];
const CREATOR_CAMPAIGN_TYPES = ['game', 'social', 'web'];
const TASK_STATUSES = ['draft', 'pending_review', 'active', 'paused', 'completed', 'expired', 'closed', 'refunded'];
const VERIFICATION_SECONDS = [5, 10];
const TASK_STATUS_TRANSITIONS = { draft: ['pending_review'], pending_review: ['draft', 'active'], active: ['paused', 'completed', 'expired'], paused: ['active', 'completed', 'expired'], completed: ['closed', 'refunded'], expired: ['closed', 'refunded'], closed: [], refunded: [] };

function requiredId(value, name) { if (value === undefined || value === null || value === '') throw new Error(`${name} is required`); return value; }
function normalizeReward(value, name) { const n = Number(value ?? 0); if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number`); return n; }
function normalizeCampaignFields(taskType, creatorId, target) { if (!CREATOR_CAMPAIGN_TYPES.includes(taskType)) return { creatorId: null, target: null }; requiredId(creatorId, 'creatorId'); if (!Number.isInteger(target) || target <= 0) throw new Error('target must be a positive integer'); return { creatorId, target }; }
function canTransitionTaskStatus(from, to) { return TASK_STATUS_TRANSITIONS[from]?.includes(to) === true; }
async function getActivitySetting(client, key, fallback) { const result = await client.query('SELECT value FROM admin_settings WHERE key=$1', [key]); if (!result.rowCount) return fallback; const value = Number(result.rows[0].value); return Number.isFinite(value) ? value : fallback; }

async function listActiveTasks({ taskType = null } = {}) {
  if (taskType !== null && !TASK_TYPES.includes(taskType)) throw new Error('Invalid task type');
  const params = taskType ? [taskType] : []; const filter = taskType ? 'AND task_type=$1' : '';
  const result = await query(`SELECT id, task_type, title, description, reward_coin, reward_dzx, reward_dzp, verification_ad_seconds FROM activity_tasks WHERE status='active' ${filter} ORDER BY id`, params);
  return result.rows.map(row => ({ id: row.id, taskType: row.task_type, title: row.title, description: row.description, rewardCoin: Number(row.reward_coin), rewardDzx: Number(row.reward_dzx), rewardDzp: Number(row.reward_dzp), verificationAdSeconds: row.verification_ad_seconds }));
}

async function createTask({ taskType, title, description = null, creatorId = null, target = null, rewardCoin, rewardDzx, rewardDzp, verificationAdSeconds = null, config = {} }) {
  if (!TASK_TYPES.includes(taskType)) throw new Error('Invalid task type'); if (!title) throw new Error('title is required'); validateVerificationConfig(config); const campaign = normalizeCampaignFields(taskType, creatorId, target);
  return withTransaction(async client => {
    const configuredSeconds = verificationAdSeconds ?? await getActivitySetting(client, 'activity.verification_ad_seconds', 5); if (!VERIFICATION_SECONDS.includes(Number(configuredSeconds))) throw new Error('verification ad duration must be 5 or 10 seconds');
    const rewards = { coin: normalizeReward(rewardCoin, 'rewardCoin'), dzx: normalizeReward(rewardDzx, 'rewardDzx'), dzp: normalizeReward(rewardDzp, 'rewardDzp') }; if (!rewards.coin && !rewards.dzx && !rewards.dzp) throw new Error('At least one task reward is required');
    const result = await client.query(`INSERT INTO activity_tasks(task_type,title,description,creator_id,target,reward_coin,reward_dzx,reward_dzp,verification_ad_seconds,status,config) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10) RETURNING *`, [taskType, title, description, campaign.creatorId, campaign.target, rewards.coin, rewards.dzx, rewards.dzp, Number(configuredSeconds), config]);
    return result.rows[0];
  });
}

async function createCreatorCampaign({ taskType, title, description = null, creatorId, target, rewardCoin, rewardDzx, rewardDzp, verificationAdSeconds = null, config = {}, idempotencyKey, priceDZX }) {
  if (!CREATOR_CAMPAIGN_TYPES.includes(taskType)) throw new Error('Creator campaigns must use game, social, or web task types'); requiredId(idempotencyKey, 'idempotencyKey'); if (priceDZX !== undefined) throw new Error('Campaign price is server/admin controlled'); const campaign = normalizeCampaignFields(taskType, creatorId, target); validateVerificationConfig(config);
  return withTransaction(async client => {
    const configuredSeconds = verificationAdSeconds ?? await getActivitySetting(client, 'activity.verification_ad_seconds', 5); if (!VERIFICATION_SECONDS.includes(Number(configuredSeconds))) throw new Error('verification ad duration must be 5 or 10 seconds');
    const rewards = { coin: normalizeReward(rewardCoin, 'rewardCoin'), dzx: normalizeReward(rewardDzx, 'rewardDzx'), dzp: normalizeReward(rewardDzp, 'rewardDzp') }; if (!rewards.coin && !rewards.dzx && !rewards.dzp) throw new Error('At least one campaign reward is required');
    const price = await getActivitySetting(client, 'task.campaign_price_dzx_per_execution', null); if (price === null || price <= 0) throw new Error('Campaign price is not configured by Admin'); const campaignCostDZX = Number(target) * price; if (!Number.isSafeInteger(campaignCostDZX) || campaignCostDZX <= 0) throw new Error('Campaign cost is invalid');
    const taskResult = await client.query(`INSERT INTO activity_tasks(task_type,title,description,creator_id,target,reward_coin,reward_dzx,reward_dzp,verification_ad_seconds,status,config) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10) RETURNING *`, [taskType, title, description, campaign.creatorId, campaign.target, rewards.coin, rewards.dzx, rewards.dzp, Number(configuredSeconds), config]); const task = taskResult.rows[0];
    const economy = await postEconomyTransactionOnClient(client, { idempotencyKey, userId: creatorId, type: 'CREATOR_CAMPAIGN_DEBIT', metadata: { source: 'creator_campaign', task_id: task.id, target: Number(target), applied_price_dzx: price, campaign_cost_dzx: campaignCostDZX }, movements: [{ currency: 'DZX', amount: -campaignCostDZX, source: 'creator_campaign' }] });
    if (economy.duplicate) { const existingTaskId = economy.transaction.metadata?.task_id; if (!existingTaskId) throw new Error('Idempotent campaign transaction is missing task_id'); await client.query('DELETE FROM activity_tasks WHERE id=$1', [task.id]); const existingTask = await client.query('SELECT * FROM activity_tasks WHERE id=$1', [existingTaskId]); if (!existingTask.rowCount) throw new Error('Idempotent campaign task not found'); return { task: existingTask.rows[0], appliedPriceDZX: Number(economy.transaction.metadata.applied_price_dzx), campaignCostDZX: Number(economy.transaction.metadata.campaign_cost_dzx), duplicate: true }; }
    return { task, appliedPriceDZX: price, campaignCostDZX, transaction: economy.transaction, entries: economy.entries, duplicate: false };
  });
}

async function transitionTaskStatus(taskId, toStatus) { requiredId(taskId, 'taskId'); requiredId(toStatus, 'toStatus'); if (!TASK_STATUSES.includes(toStatus)) throw new Error('Invalid task status'); return withTransaction(async client => { const result = await client.query('SELECT status FROM activity_tasks WHERE id=$1 FOR UPDATE', [taskId]); if (!result.rowCount) throw new Error('Task not found'); const fromStatus = result.rows[0].status; if (!canTransitionTaskStatus(fromStatus, toStatus)) throw new Error(`Task cannot transition from ${fromStatus} to ${toStatus}`); const updated = await client.query('UPDATE activity_tasks SET status=$2,updated_at=NOW() WHERE id=$1 RETURNING *', [taskId, toStatus]); return updated.rows[0]; }); }
async function submitCreatorCampaignForReview(taskId, creatorId) { requiredId(creatorId, 'creatorId'); return withTransaction(async client => { const result = await client.query('SELECT * FROM activity_tasks WHERE id=$1 AND creator_id=$2 FOR UPDATE', [requiredId(taskId, 'taskId'), creatorId]); if (!result.rowCount) throw new Error('Creator campaign not found'); if (result.rows[0].status !== 'draft') throw new Error(`Creator campaign cannot enter review from ${result.rows[0].status}`); const updated = await client.query("UPDATE activity_tasks SET status='pending_review',updated_at=NOW() WHERE id=$1 RETURNING *", [taskId]); return updated.rows[0]; }); }
async function approveCreatorCampaign(taskId) { const task = await getTask(taskId); if (!CREATOR_CAMPAIGN_TYPES.includes(task.task_type)) throw new Error('Only creator campaigns can be approved'); return transitionTaskStatus(taskId, 'active'); }
async function rejectCreatorCampaign(taskId, creatorId) {
  requiredId(creatorId, 'creatorId');
  return withTransaction(async client => {
    const taskResult = await client.query('SELECT * FROM activity_tasks WHERE id=$1 AND creator_id=$2 FOR UPDATE', [requiredId(taskId, 'taskId'), creatorId]);
    if (!taskResult.rowCount) throw new Error('Creator campaign not found');
    const task = taskResult.rows[0];
    const rejectionKey = `creator-campaign-rejection:${task.id}`;
    if (task.status === 'refunded') {
      const existing = await client.query('SELECT * FROM ledger_transactions WHERE idempotency_key=$1 FOR SHARE', [rejectionKey]);
      if (!existing.rowCount) throw new Error('Refunded campaign is missing rejection transaction');
      return { task, duplicate: true, campaignCostDZX: Number(existing.rows[0].metadata.campaign_cost_dzx), taxPercent: Number(existing.rows[0].metadata.tax_percent), taxDZX: Number(existing.rows[0].metadata.tax_dzx), refundDZX: Number(existing.rows[0].metadata.refund_dzx), transaction: existing.rows[0] };
    }
    if (task.status !== 'pending_review') throw new Error(`Creator campaign rejection requires pending_review, got ${task.status}`);

    const debit = await client.query("SELECT metadata FROM ledger_transactions WHERE user_id=$1 AND transaction_type='CREATOR_CAMPAIGN_DEBIT' AND metadata->>'task_id'=$2 ORDER BY id DESC LIMIT 1 FOR SHARE", [creatorId, String(task.id)]);
    if (!debit.rowCount) throw new Error('Creator campaign debit snapshot not found');
    const campaignCostDZX = Number(debit.rows[0].metadata.campaign_cost_dzx);
    if (!Number.isSafeInteger(campaignCostDZX) || campaignCostDZX <= 0) throw new Error('Campaign cost is invalid');

    const taxPercent = Number(await getActivitySetting(client, 'task.campaign_rejection_tax_percent', 0));
    if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) throw new Error('Campaign rejection tax percent must be between 0 and 100');
    const taxDZX = Math.floor(campaignCostDZX * taxPercent / 100);
    const refundDZX = campaignCostDZX - taxDZX;
    if (!Number.isSafeInteger(refundDZX) || refundDZX < 0) throw new Error('Campaign refund is invalid');

    const economy = await postEconomyTransactionOnClient(client, {
      idempotencyKey: rejectionKey,
      userId: creatorId,
      type: 'CREATOR_CAMPAIGN_REFUND',
      metadata: { source: 'creator_campaign_refund', task_id: task.id, campaign_cost_dzx: campaignCostDZX, tax_percent: taxPercent, tax_dzx: taxDZX, refund_dzx: refundDZX },
      movements: refundDZX > 0 ? [{ currency: 'DZX', amount: refundDZX, source: 'creator_campaign_refund' }] : []
    });
    if (economy.duplicate) return { task, duplicate: true, campaignCostDZX, taxPercent, taxDZX, refundDZX, transaction: economy.transaction };

    const updated = await client.query("UPDATE activity_tasks SET status='refunded',updated_at=NOW() WHERE id=$1 RETURNING *", [task.id]);
    return { task: updated.rows[0], duplicate: false, campaignCostDZX, taxPercent, taxDZX, refundDZX, transaction: economy.transaction, entries: economy.entries };
  });
}

async function activateTask(taskId) { return transitionTaskStatus(taskId, 'active'); }
async function getTask(taskId) { const result = await query('SELECT * FROM activity_tasks WHERE id=$1', [requiredId(taskId, 'taskId')]); if (!result.rowCount) throw new Error('Task not found'); return result.rows[0]; }
async function executeTask({ taskId, userId, idempotencyKey, metadata = {} }) { requiredId(taskId, 'taskId'); requiredId(userId, 'userId'); requiredId(idempotencyKey, 'idempotencyKey'); return withTransaction(async client => { const taskResult = await client.query('SELECT * FROM activity_tasks WHERE id=$1 FOR SHARE', [taskId]); if (!taskResult.rowCount) throw new Error('Task not found'); const task = taskResult.rows[0]; if (task.status !== 'active') throw new Error('Task is not active'); const existing = await client.query('SELECT * FROM task_attempts WHERE execute_idempotency_key=$1 FOR SHARE', [idempotencyKey]); if (existing.rowCount) return { attempt: existing.rows[0], duplicate: true }; const attempt = await client.query(`INSERT INTO task_attempts(task_id,user_id,status,execute_idempotency_key,metadata) VALUES($1,$2,'verification_pending',$3,$4) RETURNING *`, [taskId, userId, idempotencyKey, metadata]); const gate = await client.query(`INSERT INTO task_verification_gates(attempt_id,required_seconds,idempotency_key,metadata) VALUES($1,$2,$3,$4) RETURNING *`, [attempt.rows[0].id, task.verification_ad_seconds, `verification:${attempt.rows[0].id}`, { task_id: taskId }]); return { task, attempt: attempt.rows[0], gate: gate.rows[0], duplicate: false }; }); }

module.exports = { TASK_TYPES, CREATOR_CAMPAIGN_TYPES, TASK_STATUSES, VERIFICATION_SECONDS, createTask, createCreatorCampaign, submitCreatorCampaignForReview, approveCreatorCampaign, rejectCreatorCampaign, transitionTaskStatus, canTransitionTaskStatus, activateTask, getTask, listActiveTasks, executeTask };
