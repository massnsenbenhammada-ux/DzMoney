const { randomUUID } = require('crypto');
const { withTransaction, query } = require('../db/pool');
const { creditActivityRewardOnClient } = require('./economy-service');
const referralService = require('./referral-service');
const { startAdvertisementEvent, markAdvertisementVerified } = require('./ad-event-service');
const { selectProvider } = require('./ad-provider-service');
const { activateOnVerifiedActivity } = require('./squad-membership-service');

function requiredId(value, name) { if (value === undefined || value === null || value === '') throw new Error(`${name} is required`); return value; }
async function getExistingAdvertisement({ userId, idempotencyKey, taskId }) {
  const result = await query('SELECT * FROM activity_ad_events WHERE idempotency_key=$1', [idempotencyKey]);
  if (!result.rowCount) return null;
  const event = result.rows[0];
  if (event.user_id !== userId) throw new Error('Advertisement idempotency key belongs to another user');
  if (event.context !== 'task' || event.metadata?.task_id !== taskId) throw new Error('Advertisement idempotency key is bound to another task');
  return event;
}
async function getActiveTask(taskId) {
  const result = await query("SELECT id FROM activity_tasks WHERE id=$1 AND status='active'", [requiredId(taskId, 'taskId')]);
  if (!result.rowCount) throw new Error('Task not found or not active');
  return result.rows[0];
}
async function startTaskAdvertisement({ userId, taskId, idempotencyKey, providerRegistry }) {
  requiredId(userId, 'userId'); requiredId(idempotencyKey, 'idempotencyKey');
  const existing = await getExistingAdvertisement({ userId, idempotencyKey, taskId });
  if (existing) return { adEvent: existing, providerId: existing.metadata?.provider_id, duplicate: true };
  await getActiveTask(taskId);
  const provider = selectProvider(providerRegistry, { context: 'task' });
  const externalAdId = randomUUID();
  const result = await startAdvertisementEvent({ userId, context: 'task', idempotencyKey, externalAdId, metadata: { task_id: taskId, provider_id: provider.id } });
  return { ...result, providerId: provider.id };
}
function validateServerVerification(verification, providerId) {
  if (!verification || verification.verified !== true) throw new Error('Advertisement provider verification failed');
  if (typeof verification.reference !== 'string' || !verification.reference.trim()) throw new Error('Trusted task provider reference is required');
  if (verification.userId === undefined || verification.userId === null || verification.userId === '') throw new Error('Trusted task provider user is required');
  if (verification.providerId !== providerId) throw new Error('Trusted task provider identity does not match');
  if (verification.context !== 'task') throw new Error('Trusted task provider context must be task');
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
  validateServerVerification(verification, providerId);
  const result = await query(`SELECT a.*, u.telegram_user_id FROM activity_ad_events a JOIN users u ON u.id=a.user_id WHERE a.context='task' AND a.external_ad_id=$1 AND a.metadata->>'provider_id'=$2 ORDER BY a.id DESC LIMIT 1`, [verification.reference, providerId]);
  if (!result.rowCount) throw new Error('Trusted task provider reference cannot be verified');
  const event = result.rows[0];
  if (String(event.telegram_user_id) !== String(verification.userId)) throw new Error('Trusted task provider user does not match advertisement owner');
  if (event.verified) return { adEvent: event, duplicate: true };
  return markAdvertisementVerified({ adEventId: event.id, providerReference: verification.reference, verificationMetadata: { provider_id: providerId, source: 'trusted_provider', context: 'task' } });
}
async function getViewAdsProgress(client, event) {
  const taskResult = await client.query("SELECT config FROM activity_tasks WHERE id=$1", [event.metadata?.task_id]);
  const config = taskResult.rows[0]?.config || {};
  if (config.systemKey !== 'view_ads') return null;
  const target = Number(config.advertisementTarget);
  if (!Number.isInteger(target) || target <= 0) throw new Error('Invalid daily advertisement target');
  const rankResult = await client.query(`SELECT COUNT(*)::int AS rank FROM activity_ad_events WHERE user_id=$1 AND context='task' AND verified=TRUE AND metadata->>'task_id'=$2 AND (completed_at + INTERVAL '1 hour')::date=(NOW() + INTERVAL '1 hour')::date AND (completed_at < $3 OR (completed_at = $3 AND id <= $4))`, [event.user_id, String(event.metadata?.task_id), event.completed_at, event.id]);
  const completedResult = await client.query(`SELECT COUNT(*)::int AS completed FROM activity_ad_events WHERE user_id=$1 AND context='task' AND verified=TRUE AND metadata->>'task_id'=$2 AND (completed_at + INTERVAL '1 hour')::date=(NOW() + INTERVAL '1 hour')::date`, [event.user_id, String(event.metadata?.task_id)]);
  const completed = Math.min(completedResult.rows[0]?.completed || 0, target);
  return { completed, target, rank: rankResult.rows[0]?.rank || 0 };
}
async function finalizeTaskAdvertisement({ userId, adEventId }) {
  requiredId(userId, 'userId'); requiredId(adEventId, 'adEventId');
  return withTransaction(async client => {
    const result = await client.query('SELECT * FROM activity_ad_events WHERE id=$1 AND user_id=$2 AND context=$3 FOR UPDATE', [adEventId, userId, 'task']);
    if (!result.rowCount) throw new Error('Task advertisement event not found');
    const event = result.rows[0];
    if (!event.verified) throw new Error('Task advertisement must be verified first');
    if (event.metadata?.reward_transaction_id) return { duplicate: true, rewarded: true, rewardIdempotencyKey: event.metadata.reward_idempotency_key, reward: { coin: Number(event.metadata.reward_coin || 0), dzx: Number(event.metadata.reward_dzx || 0), dzp: Number(event.metadata.reward_dzp || 0) } };
    const progress = await getViewAdsProgress(client, event);
    if (progress && progress.rank > progress.target) return { duplicate: false, rewarded: false, progress };
    const rewardIdempotencyKey = `task-advertisement:${event.id}`;
    const settings = await client.query("SELECT key,value FROM admin_settings WHERE key IN ('activity.default_reward_coin','activity.default_reward_dzx','activity.default_reward_dzp')");
    const values = Object.fromEntries(settings.rows.map(row => [row.key, Number(row.value)]));
    const reward = { coin: progress ? 1000 : (values['activity.default_reward_coin'] ?? 1000), dzx: progress ? 1 : (values['activity.default_reward_dzx'] ?? 1), dzp: progress ? 1 : (values['activity.default_reward_dzp'] ?? 1) };
    const transaction = await creditActivityRewardOnClient(client, { idempotencyKey: rewardIdempotencyKey, userId, source: 'advertisement', ...reward, modifiers: [], qualifyingVerifiedActivity: true });
    if (!transaction.duplicate) await referralService.creditReferralLifetimeOnClient(client, { referredUserId: userId, source: 'advertisement', sourceReferenceId: event.id, idempotencyKey: `referral-lifetime:advertisement:${event.id}`, baseReward: { coin: values['activity.default_reward_coin'] ?? 1000, dzx: values['activity.default_reward_dzx'] ?? 1 } });
    await activateOnVerifiedActivity(client, userId);
    await client.query("UPDATE activity_ad_events SET metadata=metadata || $2::jsonb WHERE id=$1", [event.id, JSON.stringify({ reward_transaction_id: transaction.transaction.id, reward_idempotency_key: rewardIdempotencyKey, reward_coin: reward.coin, reward_dzx: reward.dzx, reward_dzp: reward.dzp })]);
    return { duplicate: transaction.duplicate, rewarded: true, rewardIdempotencyKey, reward, transaction: transaction.transaction, progress: progress ? { ...progress, rewarded: true } : undefined };
  });
}
module.exports = { startTaskAdvertisement, verifyTaskAdvertisement, verifyTrustedTaskAdvertisement, finalizeTaskAdvertisement };