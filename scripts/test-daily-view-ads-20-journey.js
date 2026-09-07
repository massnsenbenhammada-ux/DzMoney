const assert = require('assert');
const { pool, withTransaction } = require('../src/db/pool');
const { AdProviderRegistry } = require('../src/services/ad-provider-service');
const { startTaskAdvertisement, verifyTrustedTaskAdvertisement, finalizeTaskAdvertisement } = require('../src/services/task-advertisement-service');
const { getSystemTask, getAdvertisementProgress } = require('../src/services/daily-system-task-service');

const provider = {
  id: 'phase14-view-ads-20-provider',
  contexts: ['task'],
  async verifyCompletion() { throw new Error('client verification must never be used for task advertisements'); },
  async verifyServerCompletion(payload) {
    if (payload?.accepted !== true) return { verified: false, reference: payload?.reference || 'rejected' };
    return { verified: true, reference: payload.reference, userId: payload.userId, providerId: provider.id, context: 'task' };
  }
};
const registry = new AdProviderRegistry([provider]);

async function createUser() {
  const marker = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
  const result = await pool.query('INSERT INTO users (telegram_user_id, username, first_name) VALUES ($1,$2,$3) RETURNING id, telegram_user_id', [marker, `phase14_ads_${Date.now()}`, 'Phase 14 Ads']);
  const userId = result.rows[0].id;
  await withTransaction(async client => {
    for (const currency of ['COIN', 'DZX', 'DZP']) await client.query('INSERT INTO wallet_accounts (user_id, currency) VALUES ($1,$2) ON CONFLICT (user_id,currency) DO NOTHING', [userId, currency]);
  });
  return { userId, telegramUserId: result.rows[0].telegram_user_id };
}

async function balance(userId, currency) {
  const result = await pool.query('SELECT balance FROM wallet_accounts WHERE user_id=$1 AND currency=$2', [userId, currency]);
  return Number(result.rows[0]?.balance || 0);
}

async function cleanup(userId) {
  await withTransaction(async client => {
    await client.query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id=$1)', [userId]);
    await client.query('DELETE FROM ledger_transactions WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM activity_ad_events WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM wallet_accounts WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM users WHERE id=$1', [userId]);
  });
}

async function assertFinalInvariants(userId, taskId) {
  const events = await pool.query("SELECT COUNT(*)::int AS count FROM activity_ad_events WHERE user_id=$1 AND context='task' AND metadata->>'task_id'=$2 AND verified=TRUE", [userId, String(taskId)]);
  const rewarded = await pool.query("SELECT COUNT(*)::int AS count FROM activity_ad_events WHERE user_id=$1 AND context='task' AND metadata->>'task_id'=$2 AND metadata ? 'reward_transaction_id'", [userId, String(taskId)]);
  const transactions = await pool.query("SELECT COUNT(*)::int AS count FROM ledger_transactions WHERE user_id=$1 AND source='advertisement'", [userId]);
  assert.strictEqual(events.rows[0].count, 20);
  assert.strictEqual(rewarded.rows[0].count, 20);
  assert.strictEqual(transactions.rows[0].count, 20);
  assert.strictEqual(await balance(userId, 'COIN'), 20000);
  assert.strictEqual(await balance(userId, 'DZX'), 20);
  assert.strictEqual(await balance(userId, 'DZP'), 20);
  assert.deepStrictEqual(await getAdvertisementProgress({ id: taskId, config: { systemKey: 'view_ads', advertisementTarget: 20 } }, userId), { completed: 20, target: 20, available: false });
}

async function main() {
  const { userId, telegramUserId } = await createUser();
  try {
    const task = await getSystemTask('view_ads');
    assert.strictEqual(task.status, 'active');
    assert.strictEqual(task.config?.systemKey, 'view_ads');
    assert.strictEqual(Number(task.config?.advertisementTarget), 20);
    assert.deepStrictEqual([Number(task.reward_coin), Number(task.reward_dzx), Number(task.reward_dzp)], [1000, 1, 1]);

    for (let index = 1; index <= 20; index += 1) {
      const key = `phase14-view-ads-${userId}-${index}`;
      const started = await startTaskAdvertisement({ userId, taskId: task.id, idempotencyKey: key, providerRegistry: registry });
      assert.strictEqual(started.duplicate, false);
      assert.strictEqual(started.adEvent.context, 'task');
      assert.strictEqual(started.adEvent.verified, false);

      if (index === 1) {
        await assert.rejects(
          () => verifyTrustedTaskAdvertisement({ providerId: provider.id, providerPayload: { accepted: true, reference: started.adEvent.external_ad_id, userId: `${telegramUserId}-wrong` }, providerRegistry: registry }),
          /user does not match advertisement owner/
        );
      }
      if (index === 2) {
        await assert.rejects(
          () => verifyTrustedTaskAdvertisement({ providerId: provider.id, providerPayload: { accepted: false, reference: started.adEvent.external_ad_id, userId: telegramUserId }, providerRegistry: registry }),
          /Advertisement provider verification failed/
        );
        await assert.rejects(() => finalizeTaskAdvertisement({ userId, adEventId: started.adEvent.id }), /Task advertisement must be verified first/);
      }

      const verified = await verifyTrustedTaskAdvertisement({ providerId: provider.id, providerPayload: { accepted: true, reference: started.adEvent.external_ad_id, userId: telegramUserId }, providerRegistry: registry });
      assert.strictEqual(verified.adEvent.verified, true);

      let rewarded;
      if (index === 10) {
        const results = await Promise.all([
          finalizeTaskAdvertisement({ userId, adEventId: started.adEvent.id }),
          finalizeTaskAdvertisement({ userId, adEventId: started.adEvent.id })
        ]);
        assert.strictEqual(results.filter(result => result.duplicate === false).length, 1);
        assert.strictEqual(results.filter(result => result.duplicate === true).length, 1);
        rewarded = results.find(result => result.duplicate === false);
      } else {
        rewarded = await finalizeTaskAdvertisement({ userId, adEventId: started.adEvent.id });
      }
      assert.strictEqual(rewarded.rewarded, true);
      assert.strictEqual(rewarded.progress.completed, index);
      assert.strictEqual(rewarded.progress.target, 20);
      assert.strictEqual(await balance(userId, 'COIN'), index * 1000);
      assert.strictEqual(await balance(userId, 'DZX'), index);
      assert.strictEqual(await balance(userId, 'DZP'), index);

      const duplicateVerification = await verifyTrustedTaskAdvertisement({ providerId: provider.id, providerPayload: { accepted: true, reference: started.adEvent.external_ad_id, userId: telegramUserId }, providerRegistry: registry });
      assert.strictEqual(duplicateVerification.duplicate, true);
      const duplicateReward = await finalizeTaskAdvertisement({ userId, adEventId: started.adEvent.id });
      assert.strictEqual(duplicateReward.duplicate, true);
      assert.strictEqual(await balance(userId, 'COIN'), index * 1000);

      if (index < 20) assert.deepStrictEqual(await getAdvertisementProgress(task, userId), { completed: index, target: 20, available: true });
    }

    await assertFinalInvariants(userId, task.id);
    await assert.rejects(() => startTaskAdvertisement({ userId, taskId: task.id, idempotencyKey: `phase14-view-ads-${userId}-21`, providerRegistry: registry }), /Task advertisement|Daily advertisement/);
    console.log('Phase 14 Daily View Ads 1-to-20 journey: PASS');
  } finally {
    await cleanup(userId);
    await pool.end();
  }
}

main().catch(error => {
  console.error('Phase 14 Daily View Ads 1-to-20 journey: FAIL');
  console.error(error);
  process.exit(1);
});
