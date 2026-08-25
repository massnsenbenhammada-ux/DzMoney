const { withTransaction, query } = require('../db/pool');
const { creditActivityRewardOnClient } = require('./economy-service');

function referralCode(userId) {
  if (!Number.isInteger(Number(userId)) || Number(userId) <= 0) throw new Error('userId is required');
  return `DZ${Number(userId).toString(36).toUpperCase()}`;
}

function parseReferralCode(code) {
  if (typeof code !== 'string' || !/^DZ[0-9A-Z]+$/.test(code)) throw new Error('Invalid referral code');
  const userId = parseInt(code.slice(2), 36);
  if (!Number.isSafeInteger(userId) || userId <= 0 || referralCode(userId) !== code) throw new Error('Invalid referral code');
  return userId;
}

async function qualifyReferralForActivityOnClient(client, { referredUserId, activityId, baseReward }) {
  const result = await client.query(`SELECT * FROM referrals WHERE referred_user_id=$1 FOR UPDATE`, [referredUserId]);
  if (!result.rowCount) return null;
  const referral = result.rows[0];
  if (!baseReward || Object.values(baseReward).every(value => Number(value || 0) === 0)) throw new Error('baseReward is required');
  if (referral.status === 'pending') {
    await client.query(`UPDATE referrals SET status='qualified',qualification_activity_id=$2,qualified_at=NOW(),updated_at=NOW() WHERE id=$1`, [referral.id, activityId]);
  }
  const settings = await client.query(`SELECT key,value FROM admin_settings WHERE key IN ('referral.reward_coin','referral.reward_dzx','referral.reward_dzp','referral.lifetime_percent')`);
  const values = Object.fromEntries(settings.rows.map(row => [row.key, Number(row.value)]));
  const activation = await creditActivityRewardOnClient(client, {
    idempotencyKey: `referral:activation:${referral.id}`,
    userId: referral.referrer_user_id,
    source: 'referral',
    coin: values['referral.reward_coin'] || 0,
    dzx: values['referral.reward_dzx'] || 0,
    dzp: values['referral.reward_dzp'] || 0,
    modifiers: []
  });
  const multiplier = (values['referral.lifetime_percent'] || 20) / 100;
  const lifetime = await creditActivityRewardOnClient(client, {
    idempotencyKey: `referral:lifetime:${activityId}`,
    userId: referral.referrer_user_id,
    source: 'referral',
    coin: Number(baseReward.coin || 0) * multiplier,
    dzx: Number(baseReward.dzx || 0) * multiplier,
    dzp: Number(baseReward.dzp || 0) * multiplier,
    modifiers: []
  });
  return { referralId: referral.id, referrerUserId: referral.referrer_user_id, status: 'qualified', activation, lifetime };
}

function createReferralService(db) {
  async function attribute({ referrerUserId, referredUserId, referralCode: code }) {
    if (!referrerUserId || !referredUserId) throw new Error('referrerUserId and referredUserId are required');
    if (Number(referrerUserId) === Number(referredUserId)) throw new Error('self-referral is not allowed');
    if (!code) throw new Error('referralCode is required');
    const existing = await db.findReferralByReferredUserId(referredUserId);
    if (existing) throw new Error('referred user is already attributed');
    return db.createReferral(referrerUserId, referredUserId, code);
  }
  async function attributeByCode({ referredUserId, code }) { const referrerUserId = parseReferralCode(code); const referrer = await db.findUserById(referrerUserId); if (!referrer) throw new Error('referral owner not found'); return attribute({ referrerUserId, referredUserId, referralCode: code }); }
  async function qualify({ referralId, activityId, evidenceVerified }) {
    if (!referralId || !activityId) throw new Error('referralId and activityId are required');
    if (!evidenceVerified) throw new Error('verified activity is required');
    const existing = await db.findReferralById(referralId); if (!existing) throw new Error('referral not found'); if (existing.status === 'qualified') return existing;
    return db.markQualified(referralId, activityId);
  }
  async function activate({ referralId, idempotencyKey = `referral:activation:${referralId}` }) { return db.activateReferral(referralId, idempotencyKey); }
  async function creditLifetime({ referralId, activityId, baseReward, idempotencyKey = `referral:lifetime:${activityId}` }) { if (!referralId || !activityId || !baseReward) throw new Error('referralId, activityId and baseReward are required'); return db.creditLifetimeReferralReward(referralId, activityId, baseReward, idempotencyKey); }
  async function getQualifiedCount(referrerUserId) { return db.countQualifiedReferrals(referrerUserId); }
  return { attribute, attributeByCode, qualify, activate, creditLifetime, getQualifiedCount };
}

const dbAdapter = {
  async findUserById(userId) { const result = await query('SELECT id FROM users WHERE id=$1', [userId]); return result.rows[0] || null; },
  async findReferralByReferredUserId(referredUserId) { const result = await query('SELECT * FROM referrals WHERE referred_user_id=$1', [referredUserId]); return result.rows[0] || null; },
  async findReferralById(referralId) { const result = await query('SELECT * FROM referrals WHERE id=$1', [referralId]); return result.rows[0] || null; },
  async createReferral(referrerUserId, referredUserId, code) { try { const result = await query(`INSERT INTO referrals(referrer_user_id,referred_user_id,referral_code) VALUES($1,$2,$3) RETURNING *`, [referrerUserId, referredUserId, code]); return result.rows[0]; } catch (error) { if (error.code === '23505') throw new Error('referred user is already attributed'); throw error; } },
  async countQualifiedReferrals(referrerUserId) { const result = await query(`SELECT COUNT(*)::int AS count FROM referrals WHERE referrer_user_id=$1 AND status='qualified'`, [referrerUserId]); return result.rows[0].count; },
  async markQualified(referralId, activityId) { const result = await query(`UPDATE referrals SET status='qualified',qualification_activity_id=$2,qualified_at=NOW(),updated_at=NOW() WHERE id=$1 AND status='pending' RETURNING *`, [referralId, activityId]); if (result.rowCount) return result.rows[0]; const existing = await this.findReferralById(referralId); if (!existing) throw new Error('referral not found'); return existing; },
  async activateReferral(referralId, idempotencyKey) { return withTransaction(async client => { const referral = await client.query('SELECT * FROM referrals WHERE id=$1 FOR UPDATE', [referralId]); if (!referral.rowCount) throw new Error('referral not found'); if (referral.rows[0].status !== 'qualified') throw new Error('referral is not qualified'); const settings = await client.query(`SELECT key,value FROM admin_settings WHERE key IN ('referral.reward_coin','referral.reward_dzx','referral.reward_dzp')`); const values = Object.fromEntries(settings.rows.map(row => [row.key, Number(row.value)])); return creditActivityRewardOnClient(client, { idempotencyKey, userId: referral.rows[0].referrer_user_id, source: 'referral', coin: values['referral.reward_coin'] || 0, dzx: values['referral.reward_dzx'] || 0, dzp: values['referral.reward_dzp'] || 0, modifiers: [] }); }); },
  async creditLifetimeReferralReward(referralId, activityId, baseReward, idempotencyKey) { return withTransaction(async client => { const referral = await client.query(`SELECT * FROM referrals WHERE id=$1 AND status='qualified' FOR SHARE`, [referralId]); if (!referral.rowCount) throw new Error('qualified referral not found'); const setting = await client.query(`SELECT value FROM admin_settings WHERE key='referral.lifetime_percent'`); const percent = setting.rowCount ? Number(setting.rows[0].value) : 20; if (!Number.isFinite(percent) || percent < 0) throw new Error('Invalid referral lifetime percent'); const multiplier = percent / 100; return creditActivityRewardOnClient(client, { idempotencyKey, userId: referral.rows[0].referrer_user_id, source: 'referral', coin: Number(baseReward.coin || 0) * multiplier, dzx: Number(baseReward.dzx || 0) * multiplier, dzp: Number(baseReward.dzp || 0) * multiplier, modifiers: [] }); }); }
};

const referralService = createReferralService(dbAdapter);
module.exports = { createReferralService, referralService, referralCode, parseReferralCode, qualifyReferralForActivityOnClient };
