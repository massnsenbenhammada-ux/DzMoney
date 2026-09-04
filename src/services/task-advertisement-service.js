const { withTransaction, query } = require('../db/pool');
const { creditActivityRewardOnClient } = require('./economy-service');
const referralService = require('./referral-service');
const { startRotatedAdvertisementEventOnClient, markAdvertisementVerified } = require('./ad-event-service');
const { activateOnVerifiedActivity } = require('./squad-membership-service');

const ADVERTISEMENT_CONTEXTS = new Set(['task', 'squad']);

function requiredId(value, name) { if (value === undefined || value === null || value === '') throw new Error(`${name} is required`); return value; }
async function getExistingAdvertisement({ userId, idempotencyKey, taskId, context }) {
  const result = await query('SELECT * FROM activity_ad_events WHERE idempotency_key=$1', [idempotencyKey]);
  if (!result.rowCount) return null;
  const event = result.rows[0];
  if (event.user_id !== userId) throw new Error('Advertisement idempotency key belongs to another user');
  if (event.context !== context || event.metadata?.task_id !== taskId) throw new Error('Advertisement idempotency key is bound to another task');
  return event;
}
async function getActiveTask(taskId) {
  const result = await query("SELECT id,config FROM activity_tasks WHERE id=$1 AND status='active'", [requiredId(taskId, 'taskId')]);
  if (!result.rowCount) throw new Error('Task not found or not active');
  return result.rows[0];
}
function getAdvertisementContext(task) {
  const context = task.config?.advertisementContext || 'task';
  if (!ADVERTISEMENT_CONTEXTS.has(context)) throw new Error('Unsupported task advertisement context');
  return context;
}
async function enforceSquadAdvertisementStart(client, { userId, task }) {
  if (getAdvertisementContext(task) !== 'squad') return;
  const membership = await client.query("SELECT 1 FROM squad_memberships WHERE user_id=$1 AND status IN ('active','inactive') LIMIT 1", [userId]);
  if (!membership.rowCount) throw new Error('Valid Squad membership is required');
  const target = Number(task.config?.advertisementTarget);
  if (!Number.isInteger(target) || target <= 0) throw new Error('Invalid Squad Ads target');
  const dateFilter = task.config?.dailyMode === 'advertisement' ? " AND (completed_at + INTERVAL '1 hour')::date=(NOW() + INTERVAL '1 hour')::date" : '';
  const completed = await client.query(`SELECT COUNT(*)::int AS count FROM activity_ad_events WHERE user_id=$1 AND context='squad' AND verified=TRUE AND metadata->>'task_id'=$2${dateFilter}`, [userId, String(task.id)]);
  if (Number(completed.rows[0]?.count || 0) >= target) throw new Error('Squad Ads target completed');
}
async function startTaskAdvertisement({ userId, taskId, idempotencyKey, providerRegistry }) {
  requiredId(userId, 'userId'); requiredId(idempotencyKey, 'idempotencyKey');
  const task = await getActiveTask(taskId);
  const context = getAdvertisementContext(task);
  const existing = await getExistingAdvertisement({ userId, idempotencyKey, taskId, context });
  if (existing) return { adEvent: existing, providerId: existing.metadata?.provider_id, duplicate: true };
  return withTransaction(async client => {
    if (context === 'squad') await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`dzmoney:squad-ads:${userId}:${taskId}`]);
    await enforceSquadAdvertisementStart(client, { userId, task });
    return startRotatedAdvertisementEventOnClient(client, { userId, context, idempotencyKey, metadata: { task_id: taskId }, providerRegistry });
  });
}
function validateServerVerification(verification, providerId, context = 'task') {
  if (!verification || verification.verified !== true) throw new Error('Advertisement provider verification failed');
  if (typeof verification.reference !== 'string' || !verification.reference.trim()) throw new Error('Trusted task provider reference is required');
  if (verification.userId === undefined || verification.userId === null || verification.userId === '') throw new Error('Trusted task provider user is required');
  if (verification.providerId !== providerId) throw new Error('Trusted task provider identity does not match');
  if (verification.context !== context) throw new Error(`Trusted task provider context must be ${context}`);
}
async function verifyTaskAdvertisement() { throw new Error('Task advertisement verification must use trusted provider ingress'); }
async function verifyTrustedTaskAdvertisement({ providerId, providerPayload, providerRegistry }) {
  requiredId(providerId, 'providerId');
  if (!providerPayload || typeof providerPayload !== 'object') throw new Error('Trusted provider payload is required');
  if (!providerRegistry || typeof providerRegistry.get !== 'function') throw new Error('Advertisement provider registry is required');
  const provider = providerRegistry.get(providerId);
  if (!provider || !provider.enabled || !provider.contexts.includes('task')) throw new Error(`Advertisement provider ${providerId} is not available for task`);
  if (typeof provider.verifyServerCompletion !== 'function') throw new Error(`Advertisement provider ${providerId} has no trusted server verification contract`);
  const verification = await provider.verifyServerCompletion(providerPayload);
  validateServerVerification(verification, providerId, 'task');
  const result = await query(`SELECT a.*, u.telegram_user_id FROM activity_ad_events a JOIN users u ON u.id=a.user_id WHERE a.context='task' AND a.external_ad_id=$1 AND a.metadata->>'provider_id'=$2 ORDER BY a.id DESC LIMIT 1`, [verification.reference, providerId]);
  if (!result.rowCount) throw new Error('Trusted task provider reference cannot be verified');
  const event = result.rows[0];
  if (String(event.telegram_user_id) !== String(verification.userId)) throw new Error('Trusted task provider user does not match advertisement owner');
  if (event.verified) return { adEvent: event, duplicate: true };
  return markAdvertisementVerified({ adEventId: event.id, providerReference: verification.reference, verificationMetadata: { provider_id: providerId, source: 'trusted_provider', context: 'task' } });
}
async function getAdvertisementProgress(client, event) {
  const taskResult = await client.query('SELECT config FROM activity_tasks WHERE id=$1', [event.metadata?.task_id]);
  const config = taskResult.rows[0]?.config || {};
  if (!['view_ads', 'squad_ads'].includes(config.systemKey)) return null;
  const target = Number(config.advertisementTarget);
  if (!Number.isInteger(target) || target <= 0) throw new Error('Invalid advertisement target');
  const context = config.advertisementContext || 'task';
  const dateFilter = config.dailyMode === 'advertisement' ? " AND (completed_at + INTERVAL '1 hour')::date=(NOW() + INTERVAL '1 hour')::date" : '';
  const rankResult = await client.query(`SELECT COUNT(*)::int AS rank FROM activity_ad_events WHERE user_id=$1 AND context=$2 AND verified=TRUE AND metadata->>'task_id'=$3${dateFilter} AND (completed_at < $4 OR (completed_at = $4 AND id <= $5))`, [event.user_id, context, String(event.metadata?.task_id), event.completed_at, event.id]);
  const completedResult = await client.query(`SELECT COUNT(*)::int AS completed FROM activity_ad_events WHERE user_id=$1 AND context=$2 AND verified=TRUE AND metadata->>'task_id'=$3${dateFilter}`, [event.user_id, context, String(event.metadata?.task_id)]);
  const completed = Math.min(Number(completedResult.rows[0]?.completed || 0), target);
  return { completed, target, rank: Number(rankResult.rows[0]?.rank || 0) };
}
async function finalizeTaskAdvertisement({ userId, adEventId }) {
  requiredId(userId, 'userId'); requiredId(adEventId, 'adEventId');
  return withTransaction(async client => {
    const result = await client.query("SELECT * FROM activity_ad_events WHERE id=$1 AND user_id=$2 AND context IN ('task','squad') FOR UPDATE", [adEventId, userId]);
    if (!result.rowCount) throw new Error('Task advertisement event not found');
    const event = result.rows[0];
    if (!event.verified) throw new Error('Task advertisement must be verified first');
    if (event.metadata?.reward_transaction_id) return { duplicate: true, rewarded: true, rewardIdempotencyKey: event.metadata.reward_idempotency_key, reward: { coin: Number(event.metadata.reward_coin || 0), dzx: Number(event.metadata.reward_dzx || 0), dzp: Number(event.metadata.reward_dzp || 0) } };
    const progress = await getAdvertisementProgress(client, event);
    if (progress && progress.rank > progress.target) return { duplicate: false, rewarded: false, progress };
    const rewardIdempotencyKey = `task-advertisement:${event.id}`;
    const settings = await client.query("SELECT key,value FROM admin_settings WHERE key IN ('activity.default_reward_coin','activity.default_reward_dzx','activity.default_reward_dzp')");
    const values = Object.fromEntries(settings.rows.map(row => [row.key, Number(row.value)]));
    const reward = { coin: progress ? 1000 : (values['activity.default_reward_coin'] ?? 1000), dzx: progress ? 1 : (values['activity.default_reward_dzx'] ?? 1), dzp: progress ? 1 : (values['activity.default_reward_dzp'] ?? 1) };
    const transaction = await creditActivityRewardOnClient(client, { idempotencyKey: rewardIdempotencyKey, userId, source: 'advertisement', activityContext: event.context, ...reward, modifiers: [], qualifyingVerifiedActivity: true });
    if (!transaction.duplicate) await referralService.creditReferralLifetimeOnClient(client, { referredUserId: userId, source: 'advertisement', sourceReferenceId: event.id, idempotencyKey: `referral-lifetime:advertisement:${event.id}`, baseReward: { coin: values['activity.default_reward_coin'] ?? 1000, dzx: values['activity.default_reward_dzx'] ?? 1 } });
    if (event.context === 'task') await activateOnVerifiedActivity(client, userId);
    await client.query("UPDATE activity_ad_events SET metadata=metadata || $2::jsonb WHERE id=$1", [event.id, JSON.stringify({ reward_transaction_id: transaction.transaction.id, reward_idempotency_key: rewardIdempotencyKey, reward_coin: reward.coin, reward_dzx: reward.dzx, reward_dzp: reward.dzp })]);
    return { duplicate: transaction.duplicate, rewarded: true, rewardIdempotencyKey, reward, transaction: transaction.transaction, progress: progress ? { ...progress, rewarded: true } : undefined };
  });
}

module.exports = { startTaskAdvertisement, verifyTaskAdvertisement, verifyTrustedTaskAdvertisement, finalizeTaskAdvertisement };
