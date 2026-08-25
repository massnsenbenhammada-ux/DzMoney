const { randomUUID } = require('crypto');
const { withTransaction, query } = require('../db/pool');
const { creditActivityRewardOnClient } = require('./economy-service');
const referralService = require('./referral-service');
const { markAdvertisementVerified } = require('./ad-event-service');
const { selectProvider, verifyWithProvider } = require('./ad-provider-service');
const { resolveVerificationConfig } = require('./task-verification-config');
const { isTelegramChannelMember } = require('./telegram-channel-verifier');

const TELEGRAM_TASK_CHANNELS = {
  'telegram.dzmoney_updates': '@dzmoneycom'
};

function requiredId(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return value;
}

function resolveTelegramTaskChannel(verification) {
  const configuredChannel = verification?.channel;
  if (configuredChannel !== undefined) {
    if (typeof configuredChannel !== 'string' || !/^@[A-Za-z0-9_]{5,32}$/.test(configuredChannel)) {
      throw new Error('Invalid Telegram task verifier channel');
    }
    return configuredChannel;
  }
  const channel = TELEGRAM_TASK_CHANNELS[verification?.providerConfigRef];
  if (!channel) throw new Error('Telegram task verifier channel is required');
  return channel;
}

function resolveTrustedTaskVerifier({ config, telegramUserId, botToken = process.env.BOT_TOKEN, verifyMembership = isTelegramChannelMember }) {
  const verification = config?.verification || {};
  if (!verification.provider) throw new Error('trusted task verifier provider is required');
  if (verification.provider !== 'telegram_channel') throw new Error(`Unsupported trusted task verifier provider: ${verification.provider}`);
  const channel = resolveTelegramTaskChannel(verification);
  requiredId(botToken, 'BOT_TOKEN');
  requiredId(telegramUserId, 'telegramUserId');
  return () => verifyMembership({ botToken, channel, userId: telegramUserId });
}

async function startTaskVerificationAd({ attemptId, idempotencyKey, externalAdId = null, providerRegistry, providerId = null }) {
  requiredId(attemptId, 'attemptId');
  requiredId(idempotencyKey, 'idempotencyKey');
  if (!providerRegistry) throw new Error('A trusted advertisement provider registry is required');
  const provider = selectProvider(providerRegistry, { context: 'verification', providerId });
  return withTransaction(async client => {
    const gateResult = await client.query(`SELECT g.*,a.user_id,a.status AS attempt_status FROM task_verification_gates g JOIN task_attempts a ON a.id=g.attempt_id WHERE g.attempt_id=$1 FOR UPDATE`, [attemptId]);
    if (!gateResult.rowCount) throw new Error('Verification gate not found');
    const gate = gateResult.rows[0];
    if (gate.attempt_status !== 'verification_pending') throw new Error('Task attempt is not awaiting verification');
    const existing = await client.query('SELECT * FROM activity_ad_events WHERE idempotency_key=$1 FOR SHARE', [idempotencyKey]);
    if (existing.rowCount) return { gate, adEvent: existing.rows[0], providerId: existing.rows[0].metadata?.provider_id, duplicate: true };
    const resolvedExternalAdId = externalAdId || randomUUID();
    const metadata = { attempt_id: attemptId, required_seconds: gate.required_seconds, provider_id: provider.id };
    const adEvent = await client.query(`INSERT INTO activity_ad_events(user_id,context,external_ad_id,idempotency_key,started_at,metadata) VALUES($1,'verification',$2,$3,NOW(),$4) RETURNING *`, [gate.user_id, resolvedExternalAdId, idempotencyKey, metadata]);
    await client.query(`UPDATE task_verification_gates SET ad_event_id=$1,metadata=metadata||$2::jsonb WHERE id=$3`, [adEvent.rows[0].id, JSON.stringify({ verification_ad_id: adEvent.rows[0].id, provider_id: provider.id }), gate.id]);
    return { gate: { ...gate, ad_event_id: adEvent.rows[0].id }, adEvent: adEvent.rows[0], providerId: provider.id, duplicate: false };
  });
}

async function verifyTaskAdvertisement({ adEventId, providerRegistry, providerId = null, providerPayload }) {
  requiredId(adEventId, 'adEventId');
  if (!providerRegistry) throw new Error('A trusted advertisement provider registry is required');
  const eventResult = await query(`SELECT context,metadata FROM activity_ad_events WHERE id=$1`, [adEventId]);
  if (!eventResult.rowCount || eventResult.rows[0].context !== 'verification') throw new Error('Verification advertisement event not found');
  const recordedProviderId = eventResult.rows[0].metadata?.provider_id;
  if (!recordedProviderId) throw new Error('Verification advertisement provider is not recorded');
  if (providerId && providerId !== recordedProviderId) throw new Error('Advertisement provider does not match the selected provider');
  const result = await verifyWithProvider(providerRegistry, { context: 'verification', providerId: recordedProviderId, payload: providerPayload });
  if (!result.verification.verified) throw new Error('Advertisement provider verification failed');
  const marked = await markAdvertisementVerified({ adEventId, providerReference: result.verification.reference, verificationMetadata: { ...result.verification.metadata, provider_id: result.providerId } });
  if (marked.duplicate) return marked;
  await withTransaction(async client => {
    await client.query(`UPDATE task_verification_gates SET status='ad_completed',ad_completed_at=NOW() WHERE ad_event_id=$1 AND status='pending'`, [adEventId]);
  });
  return marked;
}

async function finalizeTaskVerification({ attemptId, idempotencyKey, verifyTaskCompletion }) {
  requiredId(attemptId, 'attemptId');
  requiredId(idempotencyKey, 'idempotencyKey');
  return withTransaction(async client => {
    const result = await client.query(`SELECT a.*,u.telegram_user_id,t.task_type,t.reward_coin,t.reward_dzx,t.reward_dzp,t.config,g.id AS gate_id,g.status AS gate_status FROM task_attempts a JOIN users u ON u.id=a.user_id JOIN activity_tasks t ON t.id=a.task_id JOIN task_verification_gates g ON g.attempt_id=a.id WHERE a.id=$1 FOR UPDATE`, [attemptId]);
    if (!result.rowCount) throw new Error('Task attempt not found');
    const row = result.rows[0];
    if (row.status === 'verified') return { duplicate: true, status: 'verified' };
    if (row.status !== 'verification_pending') throw new Error('Task attempt is not pending verification');
    if (row.gate_status !== 'ad_completed') throw new Error('Verification advertisement must be verified first');

    const resolvedConfig = resolveVerificationConfig({ taskType: row.task_type, config: row.config });
    const completion = resolvedConfig.completion;
    let verifiedByTaskRule;
    if (completion.mode === 'open_link') {
      if (row.metadata?.link_clicked !== true) {
        return { duplicate: false, status: 'verification_pending', rewarded: false, reason: 'link_click_required' };
      }
      verifiedByTaskRule = true;
    } else {
      const verifier = verifyTaskCompletion || resolveTrustedTaskVerifier({
        config: resolvedConfig,
        telegramUserId: row.telegram_user_id
      });
      verifiedByTaskRule = await verifier({ attemptId });
      if (typeof verifiedByTaskRule !== 'boolean') throw new Error('Task verifier must return a boolean');
    }

    if (verifiedByTaskRule !== true) {
      await client.query(`UPDATE task_attempts SET status='rejected',rejected_at=NOW() WHERE id=$1`, [attemptId]);
      await client.query(`UPDATE task_verification_gates SET status='rejected' WHERE id=$1`, [row.gate_id]);
      return { duplicate: false, status: 'rejected', rewarded: false };
    }
    const reward = await creditActivityRewardOnClient(client, { idempotencyKey, userId: row.user_id, source: 'task', coin: Number(row.reward_coin), dzx: Number(row.reward_dzx), dzp: Number(row.reward_dzp), modifiers: [] });
    if (!reward.duplicate) {
      await referralService.creditReferralLifetimeOnClient(client, {
        referredUserId: row.user_id,
        source: 'task',
        sourceReferenceId: attemptId,
        idempotencyKey: `referral-lifetime:task:${attemptId}`,
        baseReward: { coin: Number(row.reward_coin), dzx: Number(row.reward_dzx) }
      });
    }
    await client.query(`UPDATE task_attempts SET status='verified',verify_idempotency_key=$1,verified_at=NOW() WHERE id=$2`, [idempotencyKey, attemptId]);
    await client.query(`UPDATE task_verification_gates SET status='verified',verified_at=NOW() WHERE id=$1`, [row.gate_id]);
    return { duplicate: false, status: 'verified', rewarded: true, reward };
  });
}

async function getTaskVerificationStatus({ attemptId, userId }) {
  requiredId(attemptId, 'attemptId');
  requiredId(userId, 'userId');
  const result = await query(`SELECT a.id,a.status,a.metadata,g.status AS gate_status,g.ad_event_id,g.ad_completed_at,g.verified_at FROM task_attempts a JOIN task_verification_gates g ON g.attempt_id=a.id WHERE a.id=$1 AND a.user_id=$2`, [attemptId, userId]);
  if (!result.rowCount) throw new Error('Task attempt not found');
  const row = result.rows[0];
  return { attemptId: row.id, status: row.status, gateStatus: row.gate_status, adEventId: row.ad_event_id, adCompletedAt: row.ad_completed_at, verifiedAt: row.verified_at, linkClicked: row.metadata?.link_clicked === true };
}

module.exports = { startTaskVerificationAd, verifyTaskAdvertisement, finalizeTaskVerification, getTaskVerificationStatus, resolveTrustedTaskVerifier };
