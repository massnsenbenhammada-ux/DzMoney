const assert = require('assert');
const { pool, withTransaction } = require('../src/db/pool');
const daily = require('../src/services/daily-checkin-service');

async function createTestUser() {
  const marker = Date.now();
  const result = await pool.query(`INSERT INTO users (telegram_user_id, username, first_name) VALUES ($1,$2,$3) RETURNING id`, [String(marker), `daily_${marker}`, 'Daily Test']);
  const userId = result.rows[0].id;
  for (const currency of ['COIN', 'DZX', 'DZP']) await pool.query(`INSERT INTO wallet_accounts (user_id, currency) VALUES ($1,$2)`, [userId, currency]);
  return userId;
}
async function balance(userId, currency) {
  const result = await pool.query('SELECT balance FROM wallet_accounts WHERE user_id=$1 AND currency=$2', [userId, currency]);
  return Number(result.rows[0].balance);
}
async function cleanup(userId) {
  await withTransaction(async client => {
    await client.query(`DELETE FROM squad_goal_contributions WHERE user_id=$1`, [userId]);
    await client.query(`DELETE FROM squad_activity_events WHERE user_id=$1`, [userId]);
    await client.query(`DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id=$1) OR wallet_account_id IN (SELECT id FROM wallet_accounts WHERE user_id=$1)`, [userId]);
    await client.query('DELETE FROM ledger_transactions WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM daily_checkins WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM activity_ad_events WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM wallet_accounts WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM users WHERE id=$1', [userId]);
  });
}

async function main() {
  let userId;
  try {
    userId = await createTestUser();
    const initial = await daily.getDailyCheckin(userId);
    assert.strictEqual(initial.available, true);
    assert.strictEqual(initial.cooldownHours, 24);

    const adKey = `daily-ad-${Date.now()}`;
    const started = await daily.startDailyCheckinAd({ userId, idempotencyKey: adKey, externalAdId: 'daily-test-ad' });
    assert.strictEqual(started.duplicate, false);
    assert.strictEqual(started.adEvent.verified, false);
    assert.strictEqual((await daily.getDailyCheckin(userId)).status, 'ad_pending');

    await assert.rejects(() => daily.claimDailyCheckin({ userId, adEventId: started.adEvent.id, idempotencyKey: `daily-claim-before-${Date.now()}` }), /advertisement must be completed first/);
    await daily.markDailyCheckinAdCompleted({ userId, adEventId: started.adEvent.id });

    const claimKey = `daily-claim-${Date.now()}`;
    const claimed = await daily.claimDailyCheckin({ userId, adEventId: started.adEvent.id, idempotencyKey: claimKey });
    assert.strictEqual(claimed.duplicate, false);
    assert.strictEqual(claimed.status, 'claimed');
    assert.strictEqual(await balance(userId, 'COIN'), 1000);
    assert.strictEqual(await balance(userId, 'DZX'), 1);
    assert.strictEqual(await balance(userId, 'DZP'), 1);

    const duplicate = await daily.claimDailyCheckin({ userId, adEventId: started.adEvent.id, idempotencyKey: claimKey });
    assert.strictEqual(duplicate.duplicate, true);
    assert.strictEqual(await balance(userId, 'COIN'), 1000);
    assert.strictEqual(await balance(userId, 'DZX'), 1);
    assert.strictEqual(await balance(userId, 'DZP'), 1);

    const status = await daily.getDailyCheckin(userId);
    assert.strictEqual(status.available, false);
    assert.ok(status.nextAvailableAt instanceof Date);

    await assert.rejects(() => daily.startDailyCheckinAd({ userId, idempotencyKey: `daily-ad-cooldown-${Date.now()}` }), /Daily check-in is on cooldown/);

    const ledger = await pool.query(`SELECT COUNT(*)::int AS count FROM ledger_entries le JOIN ledger_transactions lt ON lt.id=le.transaction_id WHERE lt.user_id=$1 AND le.source='daily_checkin'`, [userId]);
    assert.strictEqual(ledger.rows[0].count, 3);
    console.log('Daily Check-in invariants: PASS');
  } catch (error) {
    console.error('Daily Check-in invariants: FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (userId) {
      try { await cleanup(userId); } catch (error) { console.error('Daily test cleanup: FAIL'); console.error(error); process.exitCode = 1; }
    }
    await pool.end();
  }
}
main().catch(error => { console.error(error); process.exit(1); });
