const { withTransaction, query } = require('../db/pool');

function positiveId(value, name) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`${name} must be a positive integer`);
  return id;
}

async function findAttribution(client, referredUserId) {
  const result = await client.query(
    `SELECT * FROM referral_attributions WHERE referred_user_id = $1`,
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

/** Returns the canonical referral attribution for a referred user. */
async function getReferralByReferredUser(referredUserId) {
  const referred = positiveId(referredUserId, 'referredUserId');
  const result = await query(
    `SELECT * FROM referral_attributions WHERE referred_user_id = $1`,
    [referred]
  );
  return result.rows[0] || null;
}

module.exports = { createAttribution, getReferralByReferredUser };
