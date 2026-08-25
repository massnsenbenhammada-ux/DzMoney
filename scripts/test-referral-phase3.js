const assert = require('assert');
const { pool, withTransaction } = require('../src/db/pool');
const { ensureReferralCode, attributeReferral, qualifyReferralFromActivityOnClient, getReferralOverview, startAchievementClaim, finalizeAchievementClaim } = require('../src/services/referral-service');
const { creditActivityRewardOnClient } = require('../src/services/economy-service');

async function createUser(marker) {
  const result = await pool.query(
    'INSERT INTO users (telegram_user_id, username, first_name) VALUES ($1,$2,$3) RETURNING id',
    [String(marker), `ref_${marker}`, 'Referral Test']
  );
  const userId = result.rows[0].id;
  await withTransaction(async client => {
    for (const currency of ['COIN', 'DZX', 'DZP']) {
      await client.query('INSERT INTO wallet_accounts(user_id,currency) VALUES($1,$2) ON CONFLICT(user_id,currency) DO NOTHING', [userId, currency]);
    }
  });
  return userId;
}

async function cleanup(userIds) {
  await withTransaction(async client => {
    for (const userId of userIds) {
      await client.query('DELETE FROM referral_achievement_claims WHERE user_id=$1', [userId]);
      await client.query('DELETE FROM referral_lifetime_rewards WHERE referred_user_id=$1 OR referral_attribution_id IN (SELECT id FROM referral_attributions WHERE referrer_user_id=$1)', [userId]);
      await client.query('DELETE FROM referral_attributions WHERE referrer_user_id=$1 OR referred_user_id=$1', [userId]);
      await client.query('DELETE FROM referral_codes WHERE user_id=$1', [userId]);
      await client.query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id=$1)', [userId]);
      await client.query('DELETE FROM ledger_transactions WHERE user_id=$1', [userId]);
      await client.query('DELETE FROM wallet_accounts WHERE user_id=$1', [userId]);
      await client.query('DELETE FROM users WHERE id=$1', [userId]);
    }
  });
}

async function main() {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const referrer = await createUser(`${suffix}1`);
  const referred = await createUser(`${suffix}2`);
  const other = await createUser(`${suffix}3`);
  try {
    const code = await ensureReferralCode(referrer);
    assert.ok(code.code);
    const duplicateCode = await ensureReferralCode(referrer);
    assert.strictEqual(duplicateCode.code, code.code);

    const attribution = await attributeReferral({ referredUserId: referred, referralCode: code.code });
    assert.strictEqual(attribution.duplicate, false);
    assert.strictEqual(attribution.attribution.status, 'pending');

    const duplicateAttribution = await attributeReferral({ referredUserId: referred, referralCode: code.code });
    assert.strictEqual(duplicateAttribution.duplicate, true);

    const otherCode = await ensureReferralCode(other);
    await assert.rejects(() => attributeReferral({ referredUserId: referrer, referralCode: code.code }), /Self-referral/);
    await assert.rejects(() => attributeReferral({ referredUserId: referred, referralCode: otherCode.code }), /already assigned/);

    await withTransaction(async client => {
      const reward = await creditActivityRewardOnClient(client, {
        idempotencyKey: `referral-test-activity:${suffix}`,
        userId: referred,
        source: 'task',
        coin: 1000,
        dzx: 1,
        dzp: 1,
        modifiers: [{ type: 'squad', rate: 0.5 }]
      });
      assert.strictEqual(reward.reward.coin, 1500);
      assert.strictEqual(reward.reward.dzx, 1.5);
      assert.strictEqual(reward.referral.qualified, true);
    });

    const overview = await getReferralOverview(referrer);
    assert.strictEqual(overview.qualifiedCount, 1);
    assert.ok(overview.achievements.some(item => item.milestone === 1 && item.eligible));

    const lifetime = await pool.query('SELECT * FROM referral_lifetime_rewards WHERE referred_user_id=$1', [referred]);
    assert.strictEqual(lifetime.rowCount, 1);
    assert.strictEqual(Number(lifetime.rows[0].base_dzx), 1);
    assert.strictEqual(Number(lifetime.rows[0].reward_dzx), 0.2);

    const activation = await pool.query("SELECT * FROM ledger_transactions WHERE user_id=$1 AND transaction_type='REFERRAL_ACTIVATION'", [referrer]);
    assert.strictEqual(activation.rowCount, 1);

    const achievement = await startAchievementClaim({ userId: referrer, milestone: 1, providerRegistry: { get: () => ({ id: 'test', enabled: true, contexts: ['verification'], verifyServerCompletion: async payload => ({ verified: true, reference: payload.reference, userId: referrer, providerId: 'test', context: 'verification' }) }) }, providerId: 'test' });
    assert.ok(achievement.adEvent.id);

    await pool.query('UPDATE activity_ad_events SET verified=TRUE, completed_at=NOW(), metadata=metadata || $2::jsonb WHERE id=$1', [achievement.adEvent.id, JSON.stringify({ provider_reference: achievement.adEvent.external_ad_id })]);
    const claimed = await finalizeAchievementClaim({ userId: referrer, milestone: 1 });
    assert.strictEqual(claimed.rewarded, true);
    const duplicateClaim = await finalizeAchievementClaim({ userId: referrer, milestone: 1 });
    assert.strictEqual(duplicateClaim.duplicate, true);

    console.log('Phase 3 referral invariants: PASS');
  } finally {
    await cleanup([referrer, referred, other]);
    await pool.end();
  }
}

main().catch(error => {
  console.error('Phase 3 referral invariants: FAIL');
  console.error(error);
  process.exit(1);
});
