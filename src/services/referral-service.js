const { withTransaction, query } = require('../db/pool');
const { postEconomyTransactionOnClient } = require('./economy-service');

const REFERRAL_LIFETIME_RATE = 0.2;

function positiveId(value, name) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`${name} must be a positive integer`);
  return id;
}

function requiredId(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return positiveId(value, name);
}

function lifetimeAmount(value) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Lifetime reward amount must be a non-negative number');
  return Number((amount * REFERRAL_LIFETIME_RATE).toFixed(8));
}

async function findAttribution(client, referredUserId, lock = false) {
  const result = await client.query(
    `SELECT * FROM referral_attributions WHERE referred_user_id = $1${lock ? ' FOR UPDATE' : ''}`,
    [referredUserId]
  );
  return result.rows[0] || null;
}

/** Creates the immutable referral attribution for a referred user. */
async function createAttribution({ referrerUserId, referredUserId }) {
  const referrer = positiveId(referrerUserId, 'referrerUserId');
  const referred = positiveId(referredUserId, 'referredUserId');
  if (referrer === referred) throw new Error('Self referral is not allowed');

  return withTransaction(async client => {
    const inserted = await client.query(
      `INSERT INTO referral_attributions (referrer_user_id, referred_user_id)
       VALUES ($1, $2)
       ON CONFLICT (referred_user_id) DO NOTHING
       RETURNING *`,
      [referrer, referred]
    );
    if (inserted.rowCount) return { attribution: inserted.rows[0], duplicate: false };
    return resolveExistingAttribution(client, referrer, referred);
  });
}

async function resolveExistingAttribution(client, referrerUserId, referredUserId) {
  const existing = await findAttribution(client, referredUserId);
  if (!existing) throw new Error('Unable to resolve referral attribution');
  if (Number(existing.referrer_user_id) !== referrerUserId) {
    throw new Error('User is already attributed to another referrer');
  }
  return { attribution: existing, duplicate: true };
}

async function verifyQualificationEvidence(client, referredUserId, source, referenceId) {
  if (source === 'task') {
    const result = await client.query(
      `SELECT id FROM task_attempts WHERE id=$1 AND user_id=$2 AND status='verified'`,
      [referenceId, referredUserId]
    );
    return result.rowCount > 0;
  }
  const result = await client.query(
    `SELECT id FROM activity_ad_events
     WHERE id=$1 AND user_id=$2 AND verified=TRUE AND context <> 'verification'`,
    [referenceId, referredUserId]
  );
  return result.rowCount > 0;
}

/** Qualifies a referral only from server-recorded verified task or advertisement evidence. */
async function qualifyReferral({ referredUserId, source, referenceId, idempotencyKey }) {
  const referred = requiredId(referredUserId, 'referredUserId');
  const evidenceId = requiredId(referenceId, 'referenceId');
  if (!['task', 'advertisement'].includes(source)) throw new Error('Invalid referral qualification source');
  if (idempotencyKey === undefined || idempotencyKey === null || idempotencyKey === '') {
    throw new Error('idempotencyKey is required');
  }

  return withTransaction(async client => {
    const attribution = await findAttribution(client, referred, true);
    if (!attribution) throw new Error('Referral attribution not found');
    if (attribution.status === 'qualified') return { attribution, duplicate: true };
    const verified = await verifyQualificationEvidence(client, referred, source, evidenceId);
    if (!verified) throw new Error(`Verified ${source} evidence not found`);
    const updated = await client.query(
      `UPDATE referral_attributions
       SET status='qualified', qualified_at=NOW(), qualification_source=$1,
           qualification_reference_id=$2, qualification_idempotency_key=$3, updated_at=NOW()
       WHERE id=$4 AND status='pending' RETURNING *`,
      [source, evidenceId, idempotencyKey, attribution.id]
    );
    if (!updated.rowCount) return { attribution: await findAttribution(client, referred), duplicate: true };
    return { attribution: updated.rows[0], duplicate: false };
  });
}

/** Credits 20% of a qualified user's base COIN/DZX activity to the referrer. */
async function creditReferralLifetimeOnClient(client, { referredUserId, source, sourceReferenceId, idempotencyKey, baseReward }) {
  const referred = requiredId(referredUserId, 'referredUserId');
  if (!['task', 'advertisement'].includes(source)) throw new Error('Invalid lifetime referral source');
  if (sourceReferenceId === undefined || sourceReferenceId === null || sourceReferenceId === '') {
    throw new Error('sourceReferenceId is required');
  }
  if (idempotencyKey === undefined || idempotencyKey === null || idempotencyKey === '') {
    throw new Error('idempotencyKey is required');
  }
  const coin = lifetimeAmount(baseReward?.coin);
  const dzx = lifetimeAmount(baseReward?.dzx);
  const attribution = await findAttribution(client, referred, true);
  if (!attribution) return { qualified: false, duplicate: false };
  if (attribution.status !== 'qualified') return { qualified: false, duplicate: false };
  const movements = [];
  if (coin > 0) movements.push({ currency: 'COIN', amount: coin, source: 'referral' });
  if (dzx > 0) movements.push({ currency: 'DZX', amount: dzx, source: 'referral' });
  if (!movements.length) return { qualified: true, duplicate: false, rewarded: false };
  const reward = await postEconomyTransactionOnClient(client, {
    idempotencyKey,
    userId: Number(attribution.referrer_user_id),
    type: 'REWARD',
    metadata: {
      source: 'referral_lifetime',
      referred_user_id: referred,
      source_type: source,
      source_reference_id: String(sourceReferenceId),
      rate: REFERRAL_LIFETIME_RATE,
      base_reward: { coin: Number(baseReward?.coin || 0), dzx: Number(baseReward?.dzx || 0) }
    },
    movements,
  });
  return { qualified: true, duplicate: reward.duplicate, rewarded: true, reward };
}

/** Credits 20% of a qualified user's base activity through its own transaction. */
async function creditReferralLifetime(args) {
  return withTransaction(client => creditReferralLifetimeOnClient(client, args));
}

async function assertActivationKeyAvailable(client, key, attributionId) {
  const result = await client.query(
    `SELECT id FROM referral_attributions WHERE activation_idempotency_key=$1`,
    [key]
  );
  if (result.rowCount && Number(result.rows[0].id) !== Number(attributionId)) {
    throw new Error('Activation idempotency key already used');
  }
}

/** Credits the one-time referral activation through the existing Economy and Ledger. */
async function activateReferral({ referredUserId, idempotencyKey }) {
  const referred = requiredId(referredUserId, 'referredUserId');
  if (idempotencyKey === undefined || idempotencyKey === null || idempotencyKey === '') {
    throw new Error('idempotencyKey is required');
  }
  return withTransaction(async client => {
    const attribution = await findAttribution(client, referred, true);
    if (!attribution) throw new Error('Referral attribution not found');
    if (attribution.status !== 'qualified') throw new Error('Referral is not qualified');
    await assertActivationKeyAvailable(client, idempotencyKey, attribution.id);
    if (attribution.activation_at) {
      if (attribution.activation_idempotency_key === idempotencyKey) {
        return { attribution, duplicate: true };
      }
      throw new Error('Referral is already activated');
    }
    await postEconomyTransactionOnClient(client, {
      idempotencyKey,
      userId: Number(attribution.referrer_user_id),
      type: 'REWARD',
      metadata: { source: 'referral_activation', referred_user_id: referred },
      movements: [
        { currency: 'COIN', amount: 10000, source: 'referral' },
        { currency: 'DZX', amount: 10, source: 'referral' },
        { currency: 'DZP', amount: 10, source: 'referral', dzpBucket: 'earned_dzp' },
      ],
    });
    const updated = await client.query(
      `UPDATE referral_attributions
       SET activation_at=NOW(), activation_idempotency_key=$1, updated_at=NOW()
       WHERE id=$2 AND status='qualified' AND activation_at IS NULL RETURNING *`,
      [idempotencyKey, attribution.id]
    );
    if (!updated.rowCount) return { attribution: await findAttribution(client, referred), duplicate: true };
    return { attribution: updated.rows[0], duplicate: false };
  });
}

/** Returns the number of server-qualified referrals for a referrer. */
async function getQualifiedReferralCount(referrerUserId) {
  const referrer = positiveId(referrerUserId, 'referrerUserId');
  const result = await query(
    `SELECT COUNT(*)::integer AS count
     FROM referral_attributions
     WHERE referrer_user_id=$1 AND status='qualified'`,
    [referrer]
  );
  return Number(result.rows[0]?.count || 0);
}

/** Returns the canonical referral attribution for a referred user. */
async function getReferralByReferredUser(referredUserId) {
  const referred = positiveId(referredUserId, 'referredUserId');
  const result = await query(
    `SELECT * FROM referral_attributions WHERE referred_user_id = $1`,
    [referred]
  );
  return result.rows[0] || null;
}

module.exports = { createAttribution, qualifyReferral, activateReferral, creditReferralLifetime, creditReferralLifetimeOnClient, getQualifiedReferralCount, getReferralByReferredUser };
