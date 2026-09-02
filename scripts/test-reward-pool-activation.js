const test = require('node:test');
const assert = require('node:assert/strict');
const { query, pool } = require('../src/db/pool');
const walletService = require('../src/services/wallet-service');
const { getRewardPoolStatus } = require('../src/services/reward-pool-service');

async function insertAd(userId, context, suffix, verified) {
  await query(
    `INSERT INTO activity_ad_events(user_id, context, idempotency_key, started_at, completed_at, verified)
     VALUES($1,$2,$3,NOW(),NOW(),$4)`,
    [userId, context, `reward-pool:${suffix}`, verified]
  );
}

test('Reward Pool activation counts only verified Reward Pool ads', { skip: !process.env.DATABASE_URL }, async () => {
  const suffix = `${Date.now()}`;
  const user = await walletService.createUser({ telegramUserId: `rp_${suffix}`, username: `reward_pool_${suffix}` });
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

    for (let index = 0; index < 10; index += 1) {
      await insertAd(user.id, 'reward_pool', `${suffix}-rp-${index}`, true);
    }
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
    await pool.end();
  }
});
