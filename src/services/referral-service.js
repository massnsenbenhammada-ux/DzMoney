const { withTransaction, query } = require('../db/pool');

function positiveId(value, name) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`${name} must be a positive integer`);
  return id;
}

function requiredId(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return positiveId(value, name);
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

/** Returns the canonical referral attribution for a referred user. */
async function getReferralByReferredUser(referredUserId) {
  const referred = positiveId(referredUserId, 'referredUserId');
  const result = await query(
    `SELECT * FROM referral_attributions WHERE referred_user_id = $1`,
    [referred]
  );
  return result.rows[0] || null;
}

module.exports = { createAttribution, qualifyReferral, getReferralByReferredUser };
