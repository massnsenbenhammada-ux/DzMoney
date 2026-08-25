const { randomUUID } = require('crypto');
const { withTransaction, query } = require('../db/pool');
const { creditActivityRewardOnClient } = require('./economy-service');
const { startAdvertisementEvent, markAdvertisementVerified } = require('./ad-event-service');
const { selectProvider } = require('./ad-provider-service');

function requiredId(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return value;
}

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

/** Start a Tasks-page advertisement with provider and correlation data owned by the server. */
async function startTaskAdvertisement({ userId, taskId, idempotencyKey, providerRegistry }) {
  requiredId(userId, 'userId');
  requiredId(idempotencyKey, 'idempotencyKey');
  const existing = await getExistingAdvertisement({ userId, idempotencyKey, taskId });
  if (existing) return { adEvent: existing, providerId: existing.metadata?.provider_id, duplicate: true };
  await getActiveTask(taskId);
  const provider = selectProvider(providerRegistry, { context: 'task' });
  const externalAdId = randomUUID();
  const result = await startAdvertisementEvent({ userId, context: 'task', idempotencyKey, externalAdId, metadata: { task_id: taskId, provider_id: provider.id } });
  return { ...result, providerId: provider.id };
}

/** Reject client-originated provider evidence; verification is server-to-server only. */
async function verifyTaskAdvertisement() {
  throw new Error('Task advertisement verification must use trusted provider ingress');
}

function validateServerVerification(verification, providerId) {
  if (!verification || verification.verified !== true) throw new Error('Advertisement provider verification failed');
  if (typeof verification.reference !== 'string' || !verification.reference.trim()) throw new Error('Trusted task provider reference is required');
  if (verification.userId === undefined || verification.userId === null || verification.userId === '') throw new Error('Trusted task provider user is required');
  if (verification.providerId !== providerId) throw new Error('Trusted task provider identity does not match');
  if (verification.context !== 'task') throw new Error('Trusted task provider context must be task');
}

/** Verify a task advertisement from authenticated provider evidence and correlate it to the started event. */
async function verifyTrustedTaskAdvertisement({ providerId, providerPayload, providerRegistry }) {
  requiredId(providerId, 'providerId');
  if (!providerPayload || typeof providerPayload !== 'object') throw new Error('Trusted provider payload is required');
  if (!providerRegistry || typeof providerRegistry.get !== 'function') throw new Error('Advertisement provider registry is required');
  const provider = providerRegistry.get(providerId);
  if (!provider || !provider.enabled || !provider.contexts.includes('task')) {
    throw new Error(`Advertisement provider ${providerId} is not available for task`);
  }
  if (typeof provider.verifyServerCompletion !== 'function') {
    throw new Error(`Advertisement provider ${providerId} has no trusted server verification contract`);
  }
  const verification = await provider.verifyServerCompletion(providerPayload);
  validateServerVerification(verification, providerId);
  const result = await query(
    `SELECT * FROM activity_ad_events
     WHERE context='task'
       AND external_ad_id=$1
       AND metadata->>'provider_id'=$2
     ORDER BY id DESC
     LIMIT 1`,
    [verification.reference, providerId]
  );
  if (!result.rowCount) throw new Error('Trusted task provider reference cannot be verified');
  const event = result.rows[0];
  if (String(event.user_id) !== String(verification.userId)) throw new Error('Trusted task provider user does not match advertisement owner');
  if (event.verified) return { adEvent: event, duplicate: true };
  return markAdvertisementVerified({
    adEventId: event.id,
    providerReference: verification.reference,
    verificationMetadata: { provider_id: providerId, source: 'trusted_provider', context: 'task' }
  });
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

module.exports = { startTaskAdvertisement, verifyTaskAdvertisement, verifyTrustedTaskAdvertisement, finalizeTaskAdvertisement };
