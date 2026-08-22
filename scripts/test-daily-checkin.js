const assert = require('assert/strict');
const { pool, query } = require('../src/db');
const { addBalance, balance } = require('../src/services/economy-service');
const { startDailyCheckinClaim, verifyDailyCheckinAd, finalizeDailyCheckin } = require('../src/services/daily-checkin-service');
const { createAdProviderRegistry } = require('../src/services/ad-provider-service');

async function cleanup(userId) {
  await query('DELETE FROM daily_checkin_claims WHERE user_id = $1', [userId]);
  await query('DELETE FROM ad_events WHERE user_id = $1', [userId]);
  await query('DELETE FROM ledger_entries WHERE user_id = $1', [userId]);
  await query('DELETE FROM balances WHERE user_id = $1', [userId]);
}

async function main() {
  const userId = 990001;
  const registry = createAdProviderRegistry({
    selectProvider: () => ({
      name: 'test',
      verifyCompletion: async () => ({ accepted: true, reference: 'daily-ref-1' })
    })
  });
  try {
    await cleanup(userId);
    const claim = await startDailyCheckinClaim({ userId, idempotencyKey: `daily-${Date.now()}`, providerRegistry: registry });
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
    assert.match(cooldownError.message, /Daily Check-in is on cooldown/);
    assert.strictEqual(cooldownError.statusCode, 429);
    console.log('Daily Check-in invariants: PASS');
  } finally {
    await cleanup(userId);
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Daily Check-in invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
});