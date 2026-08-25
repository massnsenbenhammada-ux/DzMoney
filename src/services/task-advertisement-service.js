const { withTransaction, query } = require('../db/pool');
const { creditActivityRewardOnClient } = require('./economy-service');
const { startAdvertisementEvent, markAdvertisementVerified } = require('./ad-event-service');
const { selectProvider, verifyWithProvider } = require('./ad-provider-service');

function requiredId(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return value;
}

async function getActiveTask(taskId) {
  const result = await query("SELECT id FROM activity_tasks WHERE id=$1 AND status='active'", [requiredId(taskId, 'taskId')]);
  if (!result.rowCount) throw new Error('Task not found or not active');
  return result.rows[0];
}

/** Start a Tasks-page advertisement bound to an active task and trusted provider. */
async function startTaskAdvertisement({ userId, taskId, idempotencyKey, externalAdId = null, providerRegistry, providerId = null }) {
  requiredId(userId, 'userId');
  await getActiveTask(taskId);
  const provider = selectProvider(providerRegistry, { context: 'task', providerId });
  return startAdvertisementEvent({ userId, context: 'task', idempotencyKey, externalAdId, metadata: { task_id: taskId, provider_id: provider.id } });
}

/** Verify a task-context advertisement using only the provider recorded at start. */
async function verifyTaskAdvertisement({ userId, adEventId, providerRegistry, providerPayload }) {
  requiredId(userId, 'userId');
  requiredId(adEventId, 'adEventId');
  const result = await query('SELECT * FROM activity_ad_events WHERE id=$1 AND user_id=$2 AND context=$3', [adEventId, userId, 'task']);
  if (!result.rowCount) throw new Error('Task advertisement event not found');
  const event = result.rows[0];
  if (event.verified) return { adEvent: event, duplicate: true };
  const providerId = event.metadata?.provider_id;
  if (!providerId) throw new Error('Task advertisement provider is not recorded');
  const verification = await verifyWithProvider(providerRegistry, { context: 'task', providerId, payload: providerPayload });
  if (!verification.verification.verified) throw new Error('Advertisement provider verification failed');
  return markAdvertisementVerified({ adEventId, providerReference: verification.verification.reference, verificationMetadata: { provider_id: verification.providerId } });
}

/** Finalize one verified task advertisement through the existing economy/ledger. */
async function finalizeTaskAdvertisement({ userId, adEventId }) {
  requiredId(userId, 'userId');
  requiredId(adEventId, 'adEventId');
  return withTransaction(async client => {
    const result = await client.query('SELECT * FROM activity_ad_events WHERE id=$1 AND user_id=$2 AND context=$3 FOR UPDATE', [adEventId, userId, 'task']);
    if (!result.rowCount) throw new Error('Task advertisement event not found');
    const event = result.rows[0];
    if (!event.verified) throw new Error('Task advertisement must be verified first');
    if (event.metadata?.reward_transaction_id) return { duplicate: true, rewarded: true, rewardIdempotencyKey: event.metadata.reward_idempotency_key };
    const rewardIdempotencyKey = `task-advertisement:${event.id}`;
    const settings = await client.query("SELECT key,value FROM admin_settings WHERE key IN ('activity.default_reward_coin','activity.default_reward_dzx','activity.default_reward_dzp')");
    const values = Object.fromEntries(settings.rows.map(row => [row.key, Number(row.value)]));
    const reward = await creditActivityRewardOnClient(client, { idempotencyKey: rewardIdempotencyKey, userId, source: 'advertisement', coin: values['activity.default_reward_coin'] ?? 1000, dzx: values['activity.default_reward_dzx'] ?? 1, dzp: values['activity.default_reward_dzp'] ?? 1, modifiers: [] });
    await client.query("UPDATE activity_ad_events SET metadata=metadata || $2::jsonb WHERE id=$1", [event.id, JSON.stringify({ reward_transaction_id: reward.transaction.id, reward_idempotency_key: rewardIdempotencyKey })]);
    return { duplicate: reward.duplicate, rewarded: true, rewardIdempotencyKey, reward };
  });
}

module.exports = { startTaskAdvertisement, verifyTaskAdvertisement, finalizeTaskAdvertisement };
