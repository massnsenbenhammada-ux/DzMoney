const test = require('node:test');
const assert = require('node:assert/strict');
const { query, pool } = require('../src/db/pool');
const walletService = require('../src/services/wallet-service');
const economyService = require('../src/services/economy-service');
const { settleRewardPool } = require('../src/services/reward-pool-service');

async function reward(userId, amount, source, suffix, createdAt) {
  await economyService.creditActivityReward({
    idempotencyKey: `reward-pool-daily:${suffix}`,
    userId,
    source,
    coin: 0,
    dzx: 0,
    dzp: amount,
    activityContext: source === 'advertisement' ? 'task' : null,
  });
  if (createdAt) await query('UPDATE ledger_transactions SET created_at=$1 WHERE idempotency_key=$2', [createdAt, `reward-pool-daily:${suffix}`]);
}

async function verifiedRewardPoolAd(userId, suffix) {
  await query(
    `INSERT INTO activity_ad_events(user_id,context,idempotency_key,started_at,completed_at,verified)
     VALUES($1,'reward_pool',$2,NOW(),NOW(),TRUE)`,
    [userId, `reward-pool-daily-ad:${suffix}`]
  );
}

test('Reward Pool daily accounting uses only earned activity DZP and settles idempotently', { skip: !process.env.DATABASE_URL }, async () => {
  const suffix = `${Date.now()}`;
  const dayStart = new Date('2026-09-01T23:00:00.000Z');
  const dayEnd = new Date('2026-09-02T23:00:00.000Z');
  const userA = await walletService.createUser({ telegramUserId: `${suffix}1`, username: `rp_a_${suffix}` });
  const userB = await walletService.createUser({ telegramUserId: `${suffix}2`, username: `rp_b_${suffix}` });
  const userC = await walletService.createUser({ telegramUserId: `${suffix}3`, username: `rp_c_${suffix}` });
  try {
    for (let index = 0; index < 10; index += 1) {
      await verifiedRewardPoolAd(userA.id, `${suffix}-a-${index}`);
      await verifiedRewardPoolAd(userB.id, `${suffix}-b-${index}`);
    }
    await reward(userA.id, 2, 'advertisement', `${suffix}-a-activity`, new Date('2026-09-02T10:00:00.000Z'));
    await reward(userB.id, 1, 'task', `${suffix}-b-activity`, new Date('2026-09-02T12:00:00.000Z'));
    await reward(userB.id, 50, 'referral', `${suffix}-b-referral`, new Date('2026-09-02T13:00:00.000Z'));
    await reward(userC.id, 100, 'task', `${suffix}-c-activity`, new Date('2026-09-02T14:00:00.000Z'));

    await query(`INSERT INTO admin_settings(key,value) VALUES('reward_pool.daily_dzx','30'::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`);
    const first = await settleRewardPool({ periodStart: dayStart, periodEnd: dayEnd });
    assert.equal(first.duplicate, false);
    assert.equal(first.totalActivityDzp, '3');
    assert.deepEqual(first.rewards.map(item => [String(item.userId), item.activityDzp, item.rewardDzx]), [
      [String(userA.id), '2', '20'],
      [String(userB.id), '1', '10'],
    ]);

    const duplicate = await settleRewardPool({ periodStart: dayStart, periodEnd: dayEnd });
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.rewards.length, 2);

    const distributions = await query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(reward_dzx),0)::text AS total
       FROM reward_pool_distribution_entries e
       JOIN reward_pool_distribution_runs r ON r.id=e.run_id
       WHERE r.period_start=$1`,
      [dayStart]
    );
    assert.equal(distributions.rows[0].count, 2);
    assert.equal(distributions.rows[0].total, '30');

    const walletA = await query(`SELECT balance FROM wallet_accounts WHERE user_id=$1 AND currency='DZX'`, [userA.id]);
    const walletB = await query(`SELECT balance FROM wallet_accounts WHERE user_id=$1 AND currency='DZX'`, [userB.id]);
    assert.equal(walletA.rows[0].balance, '20');
    assert.equal(walletB.rows[0].balance, '10');
  } finally {
    await query('DELETE FROM reward_pool_distribution_entries WHERE run_id IN (SELECT id FROM reward_pool_distribution_runs WHERE period_start=$1)', [dayStart]);
    await query('DELETE FROM reward_pool_distribution_runs WHERE period_start=$1', [dayStart]);
    await query('DELETE FROM activity_ad_events WHERE user_id IN ($1,$2,$3)', [userA.id, userB.id, userC.id]);
    await query('DELETE FROM ledger_entries WHERE wallet_account_id IN (SELECT id FROM wallet_accounts WHERE user_id IN ($1,$2,$3))', [userA.id, userB.id, userC.id]);
    await query('DELETE FROM ledger_transactions WHERE user_id IN ($1,$2,$3)', [userA.id, userB.id, userC.id]);
    await query('DELETE FROM users WHERE id IN ($1,$2,$3)', [userA.id, userB.id, userC.id]);
    await query("DELETE FROM admin_settings WHERE key='reward_pool.daily_dzx'");
    await pool.end();
  }
});
