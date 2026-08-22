const assert = require('assert');
const { pool, withTransaction } = require('../src/db/pool');
const { AdProviderRegistry } = require('../src/services/ad-provider-service');
const { startDailyCheckinClaim, verifyDailyCheckinAd, finalizeDailyCheckin } = require('../src/services/daily-checkin-service');

const provider = {
  id: 'test-daily-checkin',
  contexts: ['daily_checkin'],
  async verifyCompletion(payload) {
    return payload?.accepted === true ? { verified: true, reference: payload.reference || 'daily-test-ref', metadata: {} } : { verified: false };
  }
};
const registry = new AdProviderRegistry([provider]);

async function createUser() {
  const marker = Date.now();
  const result = await pool.query('INSERT INTO users (telegram_user_id, username, first_name) VALUES ($1,$2,$3) RETURNING id', [String(marker), `daily_${marker}`, 'Daily Test']);
  const userId = result.rows[0].id;
  await withTransaction(async client => {
    for (const currency of ['COIN', 'DZX', 'DZP']) await client.query('INSERT INTO wallet_accounts (user_id, currency) VALUES ($1,$2) ON CONFLICT (user_id,currency) DO NOTHING', [userId, currency]);
  });
  return userId;
}

async function balance(userId, currency) {
  const result = await pool.query('SELECT balance FROM wallet_accounts WHERE user_id=$1 AND currency=$2', [userId, currency]);
  return Number(result.rows[0].balance);
}

async function cleanup(userId) {
  await withTransaction(async client => {
    await client.query('DELETE FROM daily_checkins WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id=$1) OR wallet_account_id IN (SELECT id FROM wallet_accounts WHERE user_id=$1)', [userId]);
    await client.query('DELETE FROM ledger_transactions WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM activity_ad_events WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM users WHERE id=$1', [userId]);
  });
}

async function main() {
  const userId = await createUser();
  try {
    const claim = await startDailyCheckinClaim({ userId, idempotencyKey: `daily-${Date.now()}`, providerRegistry: registry });
    assert.strictEqual(claim.providerId, provider.id);
    await assert.rejects(() => finalizeDailyCheckin({ userId, claimIdempotencyKey: claim.claimIdempotencyKey }), /Daily Check-in advertisement must be verified first/);
    await assert.rejects(() => verifyDailyCheckinAd({ userId: userId + 1, adEventId: claim.adEvent.id, providerRegistry: registry, providerPayload: { accepted: true } }), /does not belong to the user/);
    await assert.rejects(() => verifyDailyCheckinAd({ userId, adEventId: claim.adEvent.id, providerRegistry: registry, providerPayload: { accepted: false } }), /Advertisement provider verification failed/);
    await verifyDailyCheckinAd({ userId, adEventId: claim.adEvent.id, providerRegistry: registry, providerPayload: { accepted: true, reference: 'daily-ref-1' } });
    const rewarded = await finalizeDailyCheckin({ userId, claimIdempotencyKey: claim.claimIdempotencyKey });
    assert.strictEqual(rewarded.rewarded, true);
    assert.strictEqual(await balance(userId, 'COIN'), 1000);
    assert.strictEqual(await balance(userId, 'DZX'), 1);
    assert.strictEqual(await balance(userId, 'DZP'), 1);
    const duplicate = await finalizeDailyCheckin({ userId, claimIdempotencyKey: claim.claimIdempotencyKey });
    assert.strictEqual(duplicate.duplicate, true);
    assert.strictEqual(await balance(userId, 'COIN'), 1000);
    let cooldownError;
    try {
      await startDailyCheckinClaim({ userId, idempotencyKey: `daily-${Date.now()}-second`, providerRegistry: registry });
    } catch (error) {
      cooldownError = error;
    }
    assert.ok(cooldownError, 'Expected a cooldown error');
    assert.match(cooldownError.message, /Daily Check-in is on cooldown/);
    assert.strictEqual(cooldownError.statusCode, 429);
    assert.ok(cooldownError.nextEligibleAt, 'Cooldown error must expose nextEligibleAt');
    assert.ok(new Date(cooldownError.nextEligibleAt).getTime() > Date.now(), 'nextEligibleAt must be in the future');
    console.log('Daily Check-in invariants: PASS');
  } finally {
    await cleanup(userId);
    await pool.end();
  }
}

main().catch(error => { console.error('Daily Check-in invariants: FAIL'); console.error(error); process.exit(1); });
