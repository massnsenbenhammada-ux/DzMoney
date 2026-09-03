const { randomUUID } = require('crypto');
const { withTransaction, query } = require('../db/pool');
const { creditActivityRewardOnClient } = require('./economy-service');
const referralService = require('./referral-service');
const { activateOnVerifiedActivity } = require('./squad-membership-service');
const { startRotatedAdvertisementEventOnClient, markAdvertisementVerified } = require('./ad-event-service');
const { getProviderForVerification, verifyWithProvider } = require('./ad-provider-service');

const DEFAULT_COOLDOWN_HOURS = 24;
const DEFAULT_REWARD = { coin: 1000, dzx: 1, dzp: 1 };

function requiredId(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return value;
}

async function settingNumber(client, key, fallback) {
  const result = await client.query('SELECT value FROM admin_settings WHERE key=$1', [key]);
  if (!result.rowCount) return fallback;
  const value = Number(result.rows[0].value);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

async function getDailyCheckinSettings(client) {
  const cooldownHours = await settingNumber(client, 'activity.daily_checkin_cooldown_hours', DEFAULT_COOLDOWN_HOURS);
  const coin = await settingNumber(client, 'activity.daily_checkin_reward_coin', DEFAULT_REWARD.coin);
  const dzx = await settingNumber(client, 'activity.daily_checkin_reward_dzx', DEFAULT_REWARD.dzx);
  const dzp = await settingNumber(client, 'activity.daily_checkin_reward_dzp', DEFAULT_REWARD.dzp);
  return { cooldownHours, reward: { coin, dzx, dzp } };
}

/** Return the server-authoritative Daily Check-in UI state. */
async function getDailyCheckinStatus({ userId }) {
  requiredId(userId, 'userId');
  const result = await query(
    `SELECT d.last_claimed_at,a.id AS ad_event_id,a.verified
     FROM daily_checkins d
     LEFT JOIN activity_ad_events a ON a.id=d.ad_event_id
     WHERE d.user_id=$1`,
    [userId]
  );
  if (!result.rowCount) return { status: 'available' };
  const state = result.rows[0];
  if (state.last_claimed_at) {
    const settings = await getDailyCheckinSettings({ query: (...args) => query(...args) });
    const nextEligibleAt = new Date(new Date(state.last_claimed_at).getTime() + settings.cooldownHours * 3600000);
    if (nextEligibleAt.getTime() > Date.now()) return { status: 'cooldown', nextEligibleAt: nextEligibleAt.toISOString() };
  }
  if (state.ad_event_id && !state.verified) return { status: 'pending' };
  return { status: 'available' };
}

/** Start the Daily Check-in ad gate and generate its trusted external event id. */
async function startDailyCheckinClaim({ userId, idempotencyKey, providerRegistry, providerId = null }) {
  requiredId(userId, 'userId');
  requiredId(idempotencyKey, 'idempotencyKey');
  if (!providerRegistry) throw new Error('A trusted advertisement provider registry is required');
  return withTransaction(async client => {
    const settings = await getDailyCheckinSettings(client);
    const state = await client.query('SELECT * FROM daily_checkins WHERE user_id=$1 FOR UPDATE', [userId]);
    const existing = state.rows[0];
    if (existing?.last_claimed_at) {
      const nextEligibleAt = new Date(new Date(existing.last_claimed_at).getTime() + settings.cooldownHours * 3600000);
      if (nextEligibleAt.getTime() > Date.now()) {
        const error = new Error('Daily Check-in is on cooldown');
        error.statusCode = 429;
        error.nextEligibleAt = nextEligibleAt.toISOString();
        throw error;
      }
    }
    if (existing?.ad_event_id && !existing.last_claimed_at) {
      const event = await client.query('SELECT * FROM activity_ad_events WHERE id=$1', [existing.ad_event_id]);
      if (event.rowCount && !event.rows[0].verified) return { claimIdempotencyKey: existing.claim_idempotency_key, adEvent: event.rows[0], providerId: event.rows[0].metadata?.provider_id, duplicate: true };
    }
    const result = await startRotatedAdvertisementEventOnClient(client, {
      userId,
      context: 'daily_checkin',
      idempotencyKey: `daily-ad:${idempotencyKey}`,
      metadata: { claim_idempotency_key: idempotencyKey },
      providerRegistry
    });
    const adEvent = result.adEvent;
    await client.query(
      `INSERT INTO daily_checkins(user_id,ad_event_id,claim_idempotency_key,updated_at)
       VALUES($1,$2,$3,NOW())
       ON CONFLICT(user_id) DO UPDATE SET ad_event_id=EXCLUDED.ad_event_id,claim_idempotency_key=EXCLUDED.claim_idempotency_key,updated_at=NOW()`,
      [userId, adEvent.id, idempotencyKey]
    );
    return { claimIdempotencyKey: idempotencyKey, ...result };
  });
}

/** Verify the Daily Check-in advertisement through the selected trusted provider. */
async function verifyDailyCheckinAd({ userId, adEventId, providerRegistry, providerId = null, providerPayload }) {
  requiredId(userId, 'userId');
  requiredId(adEventId, 'adEventId');
  if (!providerRegistry) throw new Error('A trusted advertisement provider registry is required');
  const eventResult = await query('SELECT user_id,context,metadata FROM activity_ad_events WHERE id=$1', [adEventId]);
  if (!eventResult.rowCount || eventResult.rows[0].context !== 'daily_checkin') throw new Error('Daily Check-in advertisement event not found');
  if (String(eventResult.rows[0].user_id) !== String(userId)) throw new Error('Daily Check-in advertisement does not belong to the user');
  const recordedProviderId = eventResult.rows[0].metadata?.provider_id;
  if (!recordedProviderId) throw new Error('Daily Check-in advertisement provider is not recorded');
  if (providerId && providerId !== recordedProviderId) throw new Error('Advertisement provider does not match the selected provider');
  getProviderForVerification(providerRegistry, { context: 'daily_checkin', providerId: recordedProviderId });
  const result = await verifyWithProvider(providerRegistry, { context: 'daily_checkin', providerId: recordedProviderId, payload: providerPayload });
  if (!result.verification.verified) throw new Error('Advertisement provider verification failed');
  return markAdvertisementVerified({ adEventId, providerReference: result.verification.reference, verificationMetadata: { ...result.verification.metadata, provider_id: result.providerId } });
}

/** Issue the Daily Check-in reward exactly once after verified ad completion. */
async function finalizeDailyCheckin({ userId, claimIdempotencyKey }) {
  requiredId(userId, 'userId');
  requiredId(claimIdempotencyKey, 'claimIdempotencyKey');
  return withTransaction(async client => {
    const stateResult = await client.query('SELECT * FROM daily_checkins WHERE user_id=$1 FOR UPDATE', [userId]);
    if (!stateResult.rowCount) throw new Error('Daily Check-in claim not found');
    const state = stateResult.rows[0];
    if (state.claim_idempotency_key !== claimIdempotencyKey) throw new Error('Daily Check-in claim does not match the current ad gate');
    if (state.last_claimed_at) {
      const settings = await getDailyCheckinSettings(client);
      const nextEligibleAt = new Date(new Date(state.last_claimed_at).getTime() + settings.cooldownHours * 3600000);
      if (nextEligibleAt.getTime() > Date.now()) return { duplicate: true, rewarded: false, nextEligibleAt };
    }
    const adResult = await client.query('SELECT * FROM activity_ad_events WHERE id=$1 FOR UPDATE', [state.ad_event_id]);
    if (!adResult.rowCount || adResult.rows[0].context !== 'daily_checkin') throw new Error('Daily Check-in advertisement event not found');
    if (String(adResult.rows[0].user_id) !== String(userId)) throw new Error('Daily Check-in advertisement does not belong to the user');
    if (!adResult.rows[0].verified) throw new Error('Daily Check-in advertisement must be verified first');
    const settings = await getDailyCheckinSettings(client);
    const reward = await creditActivityRewardOnClient(client, {
      idempotencyKey: `daily-checkin:${claimIdempotencyKey}`,
      userId,
      source: 'advertisement',
      coin: settings.reward.coin,
      dzx: settings.reward.dzx,
      dzp: settings.reward.dzp,
      modifiers: []
    });
    if (!reward.duplicate) {
      await referralService.creditReferralLifetimeOnClient(client, {
        referredUserId: userId,
        source: 'advertisement',
        sourceReferenceId: adResult.rows[0].id,
        idempotencyKey: `referral-lifetime:daily-checkin:${adResult.rows[0].id}`,
        baseReward: { coin: settings.reward.coin, dzx: settings.reward.dzx }
      });
    }
    if (reward.duplicate) return { duplicate: true, rewarded: false, reward };
    await activateOnVerifiedActivity(client, userId);
    const updated = await client.query('UPDATE daily_checkins SET last_claimed_at=NOW(),updated_at=NOW() WHERE user_id=$1 RETURNING *', [userId]);
    return { duplicate: false, rewarded: true, reward, state: updated.rows[0] };
  });
}

module.exports = { startDailyCheckinClaim, verifyDailyCheckinAd, finalizeDailyCheckin, getDailyCheckinSettings, getDailyCheckinStatus };