const test = require('node:test');
const assert = require('node:assert/strict');
const { query, pool } = require('../src/db/pool');
const walletService = require('../src/services/wallet-service');
const economyService = require('../src/services/economy-service');
const { getRewardPoolStatus, settleRewardPool } = require('../src/services/reward-pool-service');

async function insertAd(userId, context, suffix, verified) {
  await query(
    `INSERT INTO activity_ad_events(user_id, context, idempotency_key, started_at, completed_at, verified)
     VALUES($1,$2,$3,NOW(),NOW(),$4)`,
    [userId, context, `reward-pool:${suffix}`, verified]
  );
}

test.after(async () => pool.end());

test('Reward Pool activation counts only verified Reward Pool ads', { skip: !process.env.DATABASE_URL }, async () => {
  const suffix = `${Date.now()}`;
  const user = await walletService.createUser({ telegramUserId: suffix, username: `reward_pool_${suffix}` });
  try {
    let status = await getRewardPoolStatus({ userId: user.id });
    assert.equal(status.activationTarget, 10);
    assert.equal(status.completedAds, 0);
    assert.equal(status.activated, false);
    assert.equal(status.locked, true);
    await insertAd(user.id, 'task', `${suffix}-task`, true);
    await insertAd(user.id, 'reward_pool', `${suffix}-unverified`, false);
    await insertAd(user.id, 'verification', `${suffix}-verification`, true);
    status = await getRewardPoolStatus({ userId: user.id });
    assert.equal(status.completedAds, 0);
    assert.equal(status.activated, false);
    assert.equal(status.locked, true);
    for (let index = 0; index < 10; index += 1) await insertAd(user.id, 'reward_pool', `${suffix}-rp-${index}`, true);
    status = await getRewardPoolStatus({ userId: user.id });
    assert.equal(status.completedAds, 10);
    assert.equal(status.remainingAds, 0);
    assert.equal(status.activated, true);
    assert.equal(status.locked, false);
  } finally {
    await query('DELETE FROM activity_ad_events WHERE user_id=$1', [user.id]);
    await query('DELETE FROM ledger_entries WHERE wallet_account_id IN (SELECT id FROM wallet_accounts WHERE user_id=$1)', [user.id]);
    await query('DELETE FROM ledger_transactions WHERE user_id=$1', [user.id]);
    await query('DELETE FROM users WHERE id=$1', [user.id]);
  }
});

test('Reward Pool daily settlement excludes non-activity DZP, requires activation and is idempotent', { skip: !process.env.DATABASE_URL }, async () => {
  const suffix = `${Date.now()}`;
  const periodStart = new Date('2026-09-01T23:00:00.000Z');
  const periodEnd = new Date('2026-09-02T23:00:00.000Z');
  const userA = await walletService.createUser({ telegramUserId: `${suffix}1`, username: `rp_a_${suffix}` });
  const userB = await walletService.createUser({ telegramUserId: `${suffix}2`, username: `rp_b_${suffix}` });
  const userC = await walletService.createUser({ telegramUserId: `${suffix}3`, username: `rp_c_${suffix}` });
  try {
    for (let index = 0; index < 10; index += 1) {
      await insertAd(userA.id, 'reward_pool', `${suffix}-a-${index}`, true);
      await insertAd(userB.id, 'reward_pool', `${suffix}-b-${index}`, true);
    }
    await economyService.creditActivityReward({ idempotencyKey: `rp-a-${suffix}`, userId: userA.id, source: 'advertisement', coin: 0, dzx: 0, dzp: 2 });
    await query('UPDATE ledger_transactions SET created_at=$1 WHERE idempotency_key=$2', [new Date('2026-09-02T10:00:00.000Z'), `rp-a-${suffix}`]);
    await economyService.creditActivityReward({ idempotencyKey: `rp-b-${suffix}`, userId: userB.id, source: 'task', coin: 0, dzx: 0, dzp: 1 });
    await query('UPDATE ledger_transactions SET created_at=$1 WHERE idempotency_key=$2', [new Date('2026-09-02T12:00:00.000Z'), `rp-b-${suffix}`]);
    await economyService.creditActivityReward({ idempotencyKey: `rp-ref-${suffix}`, userId: userB.id, source: 'referral', coin: 0, dzx: 0, dzp: 50 });
    await query('UPDATE ledger_transactions SET created_at=$1 WHERE idempotency_key=$2', [new Date('2026-09-02T13:00:00.000Z'), `rp-ref-${suffix}`]);
    await economyService.creditActivityReward({ idempotencyKey: `rp-c-${suffix}`, userId: userC.id, source: 'task', coin: 0, dzx: 0, dzp: 100 });
    await query('UPDATE ledger_transactions SET created_at=$1 WHERE idempotency_key=$2', [new Date('2026-09-02T14:00:00.000Z'), `rp-c-${suffix}`]);
    await query(`INSERT INTO admin_settings(key,value) VALUES('reward_pool.daily_dzx','30'::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`);
    const first = await settleRewardPool({ periodStart, periodEnd });
    assert.equal(first.duplicate, false);
    assert.equal(first.totalActivityDzp, '3');
    assert.deepEqual(first.rewards.map(item => [String(item.userId), item.activityDzp, item.rewardDzx]), [[String(userA.id), '2.000000000', '20'], [String(userB.id), '1.000000000', '10']]);
    const duplicate = await settleRewardPool({ periodStart, periodEnd });
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.rewards.length, 2);
    const distributions = await query(`SELECT COUNT(*)::int AS count, COALESCE(SUM(reward_dzx),0)::text AS total FROM reward_pool_distribution_entries e JOIN reward_pool_distribution_runs r ON r.id=e.run_id WHERE r.period_start=$1`, [periodStart]);
    assert.equal(distributions.rows[0].count, 2);
    assert.equal(distributions.rows[0].total, '30.000000000');
    const walletA = await query(`SELECT balance FROM wallet_accounts WHERE user_id=$1 AND currency='DZX'`, [userA.id]);
    const walletB = await query(`SELECT balance FROM wallet_accounts WHERE user_id=$1 AND currency='DZX'`, [userB.id]);
    assert.equal(walletA.rows[0].balance, '20.000000000');
    assert.equal(walletB.rows[0].balance, '10.000000000');
  } finally {
    await query('DELETE FROM reward_pool_distribution_entries WHERE run_id IN (SELECT id FROM reward_pool_distribution_runs WHERE period_start=$1)', [periodStart]);
    await query('DELETE FROM reward_pool_distribution_runs WHERE period_start=$1', [periodStart]);
    await query('DELETE FROM activity_ad_events WHERE user_id IN ($1,$2,$3)', [userA.id, userB.id, userC.id]);
    await query('DELETE FROM ledger_entries WHERE wallet_account_id IN (SELECT id FROM wallet_accounts WHERE user_id IN ($1,$2,$3))', [userA.id, userB.id, userC.id]);
    await query('DELETE FROM ledger_transactions WHERE user_id IN ($1,$2,$3)', [userA.id, userB.id, userC.id]);
    await query('DELETE FROM users WHERE id IN ($1,$2,$3)', [userA.id, userB.id, userC.id]);
    await query("DELETE FROM admin_settings WHERE key='reward_pool.daily_dzx'");
  }
});
