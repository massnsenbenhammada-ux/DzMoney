const { withTransaction, query } = require('../db/pool');
const { postEconomyTransactionOnClient } = require('./economy-service');

const QUALIFICATION_SOURCES = ['advertisement', 'task'];

function positiveId(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`${name} must be a positive integer`);
  return id;
}

function requiredText(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return String(value);
}

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

    const existing = await client.query(
      `SELECT * FROM referral_attributions WHERE referred_user_id = $1`,
      [referred]
    );
    if (!existing.rowCount) throw new Error('Unable to resolve referral attribution');
    if (Number(existing.rows[0].referrer_user_id) !== referrer) {
      throw new Error('User is already attributed to another referrer');
    }
    return { attribution: existing.rows[0], duplicate: true };
  });
}

async function getReferralByReferredUser(referredUserId) {
  const referred = positiveId(referredUserId, 'referredUserId');
  const result = await query(`SELECT * FROM referral_attributions WHERE referred_user_id = $1`, [referred]);
  return result.rows[0] || null;
}

async function getQualifiedReferralCount(referrerUserId) {
  const referrer = positiveId(referrerUserId, 'referrerUserId');
  const result = await query(
    `SELECT COUNT(*)::int AS count FROM referral_attributions WHERE referrer_user_id = $1 AND status = 'qualified'`,
    [referrer]
  );
  return result.rows[0].count;
}

async function qualifyReferral({ referredUserId, source, reference }) {
  const referred = positiveId(referredUserId, 'referredUserId');
  const qualificationSource = requiredText(source, 'source');
  const qualificationReference = requiredText(reference, 'reference');
  if (!QUALIFICATION_SOURCES.includes(qualificationSource)) throw new Error('Invalid referral qualification source');

  return withTransaction(async client => {
    const result = await client.query(
      `SELECT * FROM referral_attributions WHERE referred_user_id = $1 FOR UPDATE`,
      [referred]
    );
    if (!result.rowCount) throw new Error('Referral attribution not found');
    const attribution = result.rows[0];
    if (attribution.status === 'qualified') return { attribution, duplicate: true, activation: null };

    const updated = await client.query(
      `UPDATE referral_attributions
       SET status = 'qualified', qualification_source = $2, qualification_reference = $3,
           qualified_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [attribution.id, qualificationSource, qualificationReference]
    );

    const activation = await postEconomyTransactionOnClient(client, {
      idempotencyKey: `referral:activation:${attribution.id}`,
      userId: attribution.referrer_user_id,
      type: 'REFERRAL_ACTIVATION',
      metadata: {
        source: 'referral',
        referral_attribution_id: attribution.id,
        referred_user_id: referred,
        qualification_source: qualificationSource,
        qualification_reference: qualificationReference,
      },
      movements: [
        { currency: 'COIN', amount: 10000, source: 'referral' },
        { currency: 'DZX', amount: 10, source: 'referral' },
        { currency: 'DZP', amount: 10, source: 'referral', dzpBucket: 'earned_dzp' },
      ],
    });

    return { attribution: updated.rows[0], duplicate: false, activation };
  });
}

async function creditLifetimeReward({ referredUserId, activityReference, baseCoin = 0, baseDzx = 0, baseDzp = 0 }) {
  const referred = positiveId(referredUserId, 'referredUserId');
  const reference = requiredText(activityReference, 'activityReference');
  const base = { coin: Number(baseCoin), dzx: Number(baseDzx), dzp: Number(baseDzp) };
  if (Object.values(base).some(value => !Number.isFinite(value) || value < 0)) throw new Error('Base rewards must be non-negative numbers');
  if (Object.values(base).every(value => value === 0)) throw new Error('At least one base reward is required');

  return withTransaction(async client => {
    const result = await client.query(
      `SELECT * FROM referral_attributions WHERE referred_user_id = $1 AND status = 'qualified' FOR SHARE`,
      [referred]
    );
    if (!result.rowCount) return { eligible: false, duplicate: false };
    const attribution = result.rows[0];

    const setting = await client.query(`SELECT value FROM admin_settings WHERE key = 'referral.lifetime_percent'`);
    const percent = setting.rowCount ? Number(setting.rows[0].value) : 20;
    if (!Number.isFinite(percent) || percent < 0) throw new Error('Invalid referral lifetime percent');
    const multiplier = percent / 100;
    const reward = {
      coin: base.coin * multiplier,
      dzx: base.dzx * multiplier,
      dzp: base.dzp * multiplier,
    };

    const inserted = await client.query(
      `INSERT INTO referral_lifetime_rewards
       (referral_attribution_id, referred_user_id, activity_reference, base_coin, base_dzx, base_dzp, reward_coin, reward_dzx, reward_dzp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (referral_attribution_id, activity_reference) DO NOTHING
       RETURNING *`,
      [attribution.id, referred, reference, base.coin, base.dzx, base.dzp, reward.coin, reward.dzx, reward.dzp]
    );
    if (!inserted.rowCount) return { eligible: true, duplicate: true, attribution };

    const movements = [];
    if (reward.coin > 0) movements.push({ currency: 'COIN', amount: reward.coin, source: 'referral' });
    if (reward.dzx > 0) movements.push({ currency: 'DZX', amount: reward.dzx, source: 'referral' });
    if (reward.dzp > 0) movements.push({ currency: 'DZP', amount: reward.dzp, source: 'referral', dzpBucket: 'earned_dzp' });

    const economy = await postEconomyTransactionOnClient(client, {
      idempotencyKey: `referral:lifetime:${attribution.id}:${reference}`,
      userId: attribution.referrer_user_id,
      type: 'REFERRAL_LIFETIME',
      metadata: {
        source: 'referral',
        referral_attribution_id: attribution.id,
        referred_user_id: referred,
        activity_reference: reference,
        base_reward: base,
        referral_percent: percent,
        referral_reward: reward,
      },
      movements,
    });

    return { eligible: true, duplicate: false, attribution, reward, economy };
  });
}

module.exports = {
  QUALIFICATION_SOURCES,
  createAttribution,
  getReferralByReferredUser,
  getQualifiedReferralCount,
  qualifyReferral,
  creditLifetimeReward,
};
