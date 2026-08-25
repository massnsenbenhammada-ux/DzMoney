const crypto = require('crypto');
const { withTransaction, query } = require('../db/pool');
const { startAdvertisementEvent, markAdvertisementVerified } = require('./ad-event-service');
const { selectProvider } = require('./ad-provider-service');
const { postEconomyTransactionOnClient } = require('./economy-service');

const REFERRAL_AD_CONTEXT = 'achievement';
const DEFAULT_LIFETIME_PERCENT = 20;
const DEFAULT_ACTIVATION_REWARD = { coin: 10000, dzx: 10, dzp: 10 };
const DEFAULT_ACHIEVEMENT_REWARD = { coin: 1000, dzx: 1, dzp: 1 };

function requiredId(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return value;
}

function normalizeCode(value) {
  return String(value || '').trim().replace(/^ref[_:-]?/i, '').toUpperCase();
}

function createCode() {
  return crypto.randomBytes(8).toString('base64url').replace(/[^A-Z0-9]/gi, '').slice(0, 10).toUpperCase();
}

async function settingNumber(client, key, fallback) {
  const result = await client.query('SELECT value FROM admin_settings WHERE key=$1', [key]);
  if (!result.rowCount) return fallback;
  const value = Number(result.rows[0].value);
  return Number.isFinite(value) ? value : fallback;
}

async function ensureReferralCodeOnClient(client, userId) {
  requiredId(userId, 'userId');
  const existing = await client.query('SELECT * FROM referral_codes WHERE user_id=$1 FOR SHARE', [userId]);
  if (existing.rowCount) return existing.rows[0];

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createCode();
    try {
      const inserted = await client.query(
        `INSERT INTO referral_codes(user_id,code) VALUES($1,$2)
         ON CONFLICT(user_id) DO NOTHING
         RETURNING *`,
        [userId, code]
      );
      if (inserted.rowCount) return inserted.rows[0];
    } catch (error) {
      if (error.code !== '23505') throw error;
    }
    const retry = await client.query('SELECT * FROM referral_codes WHERE user_id=$1 FOR SHARE', [userId]);
    if (retry.rowCount) return retry.rows[0];
  }
  throw new Error('Unable to create referral code');
}

async function ensureReferralCode(userId) {
  return withTransaction(client => ensureReferralCodeOnClient(client, userId));
}

function referralLink(code) {
  const botUsername = String(process.env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '');
  if (!botUsername) return null;
  return `https://t.me/${botUsername}?startapp=ref_${encodeURIComponent(code)}`;
}

async function getQualifiedCountOnClient(client, userId) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM referral_attributions
     WHERE referrer_user_id=$1 AND status='qualified'`,
    [userId]
  );
  return Number(result.rows[0]?.count || 0);
}

async function getReferralOverview(userId) {
  requiredId(userId, 'userId');
  return withTransaction(async client => {
    const code = await ensureReferralCodeOnClient(client, userId);
    const count = await getQualifiedCountOnClient(client, userId);
    const pending = await client.query(
      `SELECT COUNT(*)::int AS count FROM referral_attributions WHERE referrer_user_id=$1 AND status='pending'`,
      [userId]
    );
    const achievements = await client.query(
      `SELECT a.id,a.milestone,a.title,a.reward_coin,a.reward_dzx,a.reward_dzp,a.active,
              c.claimed_at,
              CASE WHEN $2 >= a.milestone THEN TRUE ELSE FALSE END AS eligible
       FROM referral_achievements a
       LEFT JOIN referral_achievement_claims c ON c.achievement_id=a.id AND c.user_id=$1
       WHERE a.active=TRUE
       ORDER BY a.milestone`,
      [userId, count]
    );
    return {
      code: code.code,
      link: referralLink(code.code),
      qualifiedCount: count,
      pendingCount: Number(pending.rows[0]?.count || 0),
      achievements: achievements.rows.map(row => ({
        id: row.id,
        milestone: Number(row.milestone),
        title: row.title,
        rewardCoin: Number(row.reward_coin),
        rewardDzx: Number(row.reward_dzx),
        rewardDzp: Number(row.reward_dzp),
        eligible: row.eligible === true,
        claimed: Boolean(row.claimed_at),
        claimedAt: row.claimed_at || null
      }))
    };
  });
}

async function attributeReferral({ referredUserId, referralCode }) {
  requiredId(referredUserId, 'referredUserId');
  const code = normalizeCode(referralCode);
  if (!code) throw new Error('referralCode is required');
  return withTransaction(async client => {
    const referrerResult = await client.query('SELECT user_id FROM referral_codes WHERE code=$1 FOR SHARE', [code]);
    if (!referrerResult.rowCount) throw new Error('Referral code not found');
    const referrerUserId = referrerResult.rows[0].user_id;
    if (String(referrerUserId) === String(referredUserId)) throw new Error('Self-referral is not allowed');

    const existing = await client.query('SELECT * FROM referral_attributions WHERE referred_user_id=$1 FOR UPDATE', [referredUserId]);
    if (existing.rowCount) {
      if (String(existing.rows[0].referrer_user_id) === String(referrerUserId)) return { attribution: existing.rows[0], duplicate: true };
      throw new Error('Referral attribution is already assigned');
    }

    const inserted = await client.query(
      `INSERT INTO referral_attributions(referrer_user_id,referred_user_id)
       VALUES($1,$2)
       RETURNING *`,
      [referrerUserId, referredUserId]
    );
    return { attribution: inserted.rows[0], duplicate: false };
  });
}

async function qualifyReferralFromActivityOnClient(client, { referredUserId, source, activityReference, baseReward }) {
  requiredId(referredUserId, 'referredUserId');
  requiredId(activityReference, 'activityReference');
  if (!['advertisement', 'task'].includes(source)) return { qualified: false, reason: 'non_qualifying_source' };
  if (!baseReward || typeof baseReward !== 'object') throw new Error('baseReward is required');

  const attributionResult = await client.query(
    `SELECT * FROM referral_attributions
     WHERE referred_user_id=$1 AND status='pending'
     FOR UPDATE`,
    [referredUserId]
  );
  if (!attributionResult.rowCount) return { qualified: false, reason: 'no_pending_referral' };
  const attribution = attributionResult.rows[0];

  const qualified = await client.query(
    `UPDATE referral_attributions
     SET status='qualified',qualification_source=$2,qualification_reference=$3,qualified_at=NOW(),updated_at=NOW()
     WHERE id=$1 AND status='pending'
     RETURNING *`,
    [attribution.id, source, String(activityReference)]
  );
  if (!qualified.rowCount) return { qualified: false, reason: 'already_qualified' };
  const finalAttribution = qualified.rows[0];

  const activationCoin = await settingNumber(client, 'referral.reward_coin', DEFAULT_ACTIVATION_REWARD.coin);
  const activationDzx = await settingNumber(client, 'referral.reward_dzx', DEFAULT_ACTIVATION_REWARD.dzx);
  const activationDzp = await settingNumber(client, 'referral.reward_dzp', DEFAULT_ACTIVATION_REWARD.dzp);
  const activationKey = `referral-activation:${finalAttribution.id}`;
  const activation = await postEconomyTransactionOnClient(client, {
    idempotencyKey: activationKey,
    userId: finalAttribution.referrer_user_id,
    type: 'REFERRAL_ACTIVATION',
    metadata: { source: 'referral', attribution_id: finalAttribution.id, referred_user_id: referredUserId },
    movements: [
      { currency: 'COIN', amount: activationCoin, source: 'referral' },
      { currency: 'DZX', amount: activationDzx, source: 'referral' },
      { currency: 'DZP', amount: activationDzp, source: 'referral', dzpBucket: 'earned_dzp' }
    ]
  });
  await client.query('UPDATE referral_attributions SET activation_transaction_id=$2,updated_at=NOW() WHERE id=$1', [finalAttribution.id, activation.transaction.id]);

  const lifetimePercent = await settingNumber(client, 'referral.lifetime_percent', DEFAULT_LIFETIME_PERCENT);
  if (lifetimePercent < 0 || lifetimePercent > 100) throw new Error('Referral lifetime percent must be between 0 and 100');
  const baseCoin = Number(baseReward.coin || 0);
  const baseDzx = Number(baseReward.dzx || 0);
  const baseDzp = Number(baseReward.dzp || 0);
  const rewardCoin = baseCoin * lifetimePercent / 100;
  const rewardDzx = baseDzx * lifetimePercent / 100;
  const rewardDzp = baseDzp * lifetimePercent / 100;
  const lifetimeKey = `referral-lifetime:${finalAttribution.id}:${String(activityReference)}`;
  const lifetime = await postEconomyTransactionOnClient(client, {
    idempotencyKey: lifetimeKey,
    userId: finalAttribution.referrer_user_id,
    type: 'REFERRAL_LIFETIME',
    metadata: { source: 'referral', attribution_id: finalAttribution.id, referred_user_id: referredUserId, activity_reference: String(activityReference), lifetime_percent: lifetimePercent, base_reward: { coin: baseCoin, dzx: baseDzx, dzp: baseDzp } },
    movements: [
      ...(rewardCoin > 0 ? [{ currency: 'COIN', amount: rewardCoin, source: 'referral' }] : []),
      ...(rewardDzx > 0 ? [{ currency: 'DZX', amount: rewardDzx, source: 'referral' }] : []),
      ...(rewardDzp > 0 ? [{ currency: 'DZP', amount: rewardDzp, source: 'referral', dzpBucket: 'earned_dzp' }] : [])
    ]
  });
  await client.query(
    `INSERT INTO referral_lifetime_rewards
      (referral_attribution_id,referred_user_id,activity_reference,base_coin,base_dzx,base_dzp,reward_coin,reward_dzx,reward_dzp,transaction_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT(referral_attribution_id,activity_reference) DO NOTHING`,
    [finalAttribution.id, referredUserId, String(activityReference), baseCoin, baseDzx, baseDzp, rewardCoin, rewardDzx, rewardDzp, lifetime.transaction.id]
  );

  return { qualified: true, attribution: finalAttribution, activation, lifetime };
}

async function qualifyReferralFromActivity(args) {
  return withTransaction(client => qualifyReferralFromActivityOnClient(client, args));
}

async function startAchievementClaim({ userId, milestone, providerRegistry, providerId = null }) {
  requiredId(userId, 'userId');
  const numericMilestone = Number(milestone);
  if (!Number.isInteger(numericMilestone) || numericMilestone <= 0) throw new Error('Invalid achievement milestone');
  const provider = selectProvider(providerRegistry, { context: 'verification', providerId });
  return withTransaction(async client => {
    const achievement = await client.query('SELECT * FROM referral_achievements WHERE milestone=$1 AND active=TRUE', [numericMilestone]);
    if (!achievement.rowCount) throw new Error('Referral achievement not found');
    const row = achievement.rows[0];
    const count = await getQualifiedCountOnClient(client, userId);
    if (count < numericMilestone) throw new Error('Referral achievement is not yet eligible');
    const existingClaim = await client.query('SELECT * FROM referral_achievement_claims WHERE user_id=$1 AND achievement_id=$2 FOR UPDATE', [userId, row.id]);
    if (existingClaim.rowCount && existingClaim.rows[0].claimed_at) return { duplicate: true, claimed: true, achievement: row, claim: existingClaim.rows[0] };
    if (existingClaim.rowCount && existingClaim.rows[0].ad_event_id) {
      const event = await client.query('SELECT * FROM activity_ad_events WHERE id=$1', [existingClaim.rows[0].ad_event_id]);
      if (event.rowCount && !event.rows[0].verified) return { duplicate: true, claimed: false, achievement: row, claim: existingClaim.rows[0], adEvent: event.rows[0], providerId: event.rows[0].metadata?.provider_id };
    }
    const externalAdId = crypto.randomUUID();
    const ad = await startAdvertisementEvent({
      userId,
      context: REFERRAL_AD_CONTEXT,
      idempotencyKey: `referral-achievement-ad:${userId}:${row.id}`,
      externalAdId,
      metadata: { provider_id: provider.id, provider_request_context: 'verification', achievement_id: row.id, milestone: numericMilestone }
    });
    const claim = await client.query(
      `INSERT INTO referral_achievement_claims(user_id,achievement_id,ad_event_id)
       VALUES($1,$2,$3)
       ON CONFLICT(user_id,achievement_id) DO UPDATE SET ad_event_id=EXCLUDED.ad_event_id,updated_at=NOW()
       RETURNING *`,
      [userId, row.id, ad.adEvent.id]
    );
    return { duplicate: ad.duplicate, claimed: false, achievement: row, claim: claim.rows[0], adEvent: ad.adEvent, providerId: provider.id };
  });
}

async function getAchievementClaimStatus({ userId, milestone }) {
  requiredId(userId, 'userId');
  const numericMilestone = Number(milestone);
  if (!Number.isInteger(numericMilestone) || numericMilestone <= 0) throw new Error('Invalid achievement milestone');
  const result = await query(
    `SELECT a.*,c.id AS claim_id,c.ad_event_id,c.claimed_at,e.verified,e.external_ad_id,e.metadata AS ad_metadata,
            (SELECT COUNT(*)::int FROM referral_attributions r WHERE r.referrer_user_id=$1 AND r.status='qualified') AS qualified_count
     FROM referral_achievements a
     LEFT JOIN referral_achievement_claims c ON c.achievement_id=a.id AND c.user_id=$1
     LEFT JOIN activity_ad_events e ON e.id=c.ad_event_id
     WHERE a.milestone=$2 AND a.active=TRUE`,
    [userId, numericMilestone]
  );
  if (!result.rowCount) throw new Error('Referral achievement not found');
  const row = result.rows[0];
  const qualifiedCount = Number(row.qualified_count || 0);
  if (row.claimed_at) return { status: 'claimed', milestone: numericMilestone, qualifiedCount, claimId: row.claim_id, claimedAt: row.claimed_at };
  if (qualifiedCount < numericMilestone) return { status: 'invite', milestone: numericMilestone, qualifiedCount };
  if (row.claim_id && row.ad_event_id && row.verified) return { status: 'ready_to_claim', milestone: numericMilestone, qualifiedCount, claimId: row.claim_id, adEventId: row.ad_event_id };
  if (row.claim_id) return { status: 'pending_ad', milestone: numericMilestone, qualifiedCount, claimId: row.claim_id, adEventId: row.ad_event_id, externalAdId: row.external_ad_id };
  return { status: 'claim', milestone: numericMilestone, qualifiedCount };
}

async function finalizeAchievementClaim({ userId, milestone }) {
  requiredId(userId, 'userId');
  const numericMilestone = Number(milestone);
  return withTransaction(async client => {
    const result = await client.query(
      `SELECT a.*,c.* FROM referral_achievements a
       JOIN referral_achievement_claims c ON c.achievement_id=a.id AND c.user_id=$1
       WHERE a.milestone=$2 AND a.active=TRUE
       FOR UPDATE OF a,c`,
      [userId, numericMilestone]
    );
    if (!result.rowCount) throw new Error('Referral achievement claim not found');
    const row = result.rows[0];
    if (row.claimed_at) return { duplicate: true, rewarded: true, rewardTransactionId: row.reward_transaction_id };
    const count = await getQualifiedCountOnClient(client, userId);
    if (count < numericMilestone) throw new Error('Referral achievement is no longer eligible');
    const ad = await client.query('SELECT * FROM activity_ad_events WHERE id=$1 FOR UPDATE', [row.ad_event_id]);
    if (!ad.rowCount || ad.rows[0].context !== REFERRAL_AD_CONTEXT || String(ad.rows[0].user_id) !== String(userId)) throw new Error('Referral achievement advertisement event not found');
    if (!ad.rows[0].verified) throw new Error('Referral achievement advertisement must be verified first');
    const rewardKey = `referral-achievement:${row.id}`;
    const reward = await postEconomyTransactionOnClient(client, {
      idempotencyKey: rewardKey,
      userId,
      type: 'REFERRAL_ACHIEVEMENT',
      metadata: { source: 'referral', achievement_id: row.achievement_id, milestone: numericMilestone },
      movements: [
        ...(Number(row.reward_coin) > 0 ? [{ currency: 'COIN', amount: Number(row.reward_coin), source: 'referral' }] : []),
        ...(Number(row.reward_dzx) > 0 ? [{ currency: 'DZX', amount: Number(row.reward_dzx), source: 'referral' }] : []),
        ...(Number(row.reward_dzp) > 0 ? [{ currency: 'DZP', amount: Number(row.reward_dzp), source: 'referral', dzpBucket: 'earned_dzp' }] : [])
      ]
    });
    const updated = await client.query(
      `UPDATE referral_achievement_claims
       SET claimed_at=NOW(),reward_transaction_id=$2,updated_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [row.id, reward.transaction.id]
    );
    return { duplicate: reward.duplicate, rewarded: true, reward, claim: updated.rows[0] };
  });
}

async function verifyAchievementAdvertisement({ userId, adEventId, providerRegistry, providerId, providerPayload }) {
  requiredId(userId, 'userId');
  requiredId(adEventId, 'adEventId');
  const eventResult = await query('SELECT * FROM activity_ad_events WHERE id=$1', [adEventId]);
  if (!eventResult.rowCount || eventResult.rows[0].context !== REFERRAL_AD_CONTEXT) throw new Error('Referral achievement advertisement event not found');
  const event = eventResult.rows[0];
  if (String(event.user_id) !== String(userId)) throw new Error('Referral achievement advertisement does not belong to the user');
  const recordedProvider = event.metadata?.provider_id;
  if (!recordedProvider) throw new Error('Referral achievement provider is not recorded');
  if (providerId && providerId !== recordedProvider) throw new Error('Referral achievement provider does not match');
  if (event.verified) return { adEvent: event, duplicate: true };
  const provider = providerRegistry.get(recordedProvider);
  if (!provider || !provider.enabled || !provider.contexts.includes('verification')) throw new Error('Referral achievement provider is unavailable');
  if (typeof provider.verifyServerCompletion !== 'function') throw new Error('Referral achievement provider has no trusted verification contract');
  const verification = await provider.verifyServerCompletion(providerPayload);
  if (!verification?.verified) return { adEvent: event, duplicate: false, verified: false };
  if (String(verification.userId) !== String(userId)) throw new Error('Referral achievement provider user does not match');
  if (verification.providerId !== recordedProvider) throw new Error('Referral achievement provider identity does not match');
  if (verification.context !== 'verification') throw new Error('Referral achievement provider context must be verification');
  if (typeof verification.reference !== 'string' || !verification.reference.trim()) throw new Error('Referral achievement provider reference is required');
  return markAdvertisementVerified({ adEventId, providerReference: verification.reference, verificationMetadata: { ...verification.metadata, provider_id: recordedProvider, context: REFERRAL_AD_CONTEXT } });
}

module.exports = {
  ensureReferralCode,
  ensureReferralCodeOnClient,
  getReferralOverview,
  attributeReferral,
  qualifyReferralFromActivity,
  qualifyReferralFromActivityOnClient,
  startAchievementClaim,
  getAchievementClaimStatus,
  verifyAchievementAdvertisement,
  finalizeAchievementClaim
};
