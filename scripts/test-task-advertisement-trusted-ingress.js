const assert = require('assert');
const { pool, withTransaction } = require('../src/db/pool');
const { AdProviderRegistry } = require('../src/services/ad-provider-service');
const {
  startTaskAdvertisement,
  verifyTrustedTaskAdvertisement
} = require('../src/services/task-advertisement-service');

const provider = {
  id: 'trusted-task-ad',
  contexts: ['task'],
  async verifyCompletion() {
    throw new Error('client verification must never be used by trusted ingress');
  },
  async verifyServerCompletion(payload) {
    if (payload?.accepted !== true) return { verified: false, reference: 'rejected-reference' };
    return { verified: true, reference: payload.reference, userId: payload.userId };
  }
};
const registry = new AdProviderRegistry([provider]);

async function createUser(prefix) {
  const telegramUserId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const result = await pool.query(
    'INSERT INTO users (telegram_user_id, username, first_name) VALUES ($1,$2,$3) RETURNING id',
    [telegramUserId, `${prefix}_${Date.now()}`, 'Trusted Task Test']
  );
  const userId = result.rows[0].id;
  await withTransaction(async client => {
    for (const currency of ['COIN', 'DZX', 'DZP']) {
      await client.query(
        'INSERT INTO wallet_accounts (user_id, currency) VALUES ($1,$2) ON CONFLICT (user_id,currency) DO NOTHING',
        [userId, currency]
      );
    }
  });
  return userId;
}

async function createTask() {
  const result = await pool.query(
    `INSERT INTO activity_tasks
      (task_type,title,reward_coin,reward_dzx,reward_dzp,status)
     VALUES ('web','Trusted task advertisement test',1000,1,1,'active')
     RETURNING id`
  );
  return result.rows[0].id;
}

async function cleanup(userIds, taskId) {
  await withTransaction(async client => {
    for (const userId of userIds) {
      await client.query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id=$1)', [userId]);
      await client.query('DELETE FROM ledger_transactions WHERE user_id=$1', [userId]);
      await client.query('DELETE FROM activity_ad_events WHERE user_id=$1', [userId]);
      await client.query('DELETE FROM wallet_accounts WHERE user_id=$1', [userId]);
      await client.query('DELETE FROM users WHERE id=$1', [userId]);
    }
    await client.query('DELETE FROM activity_tasks WHERE id=$1', [taskId]);
  });
}

async function main() {
  assert.throws(
    () => new AdProviderRegistry([{
      id: 'untrusted-task-ad',
      contexts: ['task'],
      async verifyCompletion() { return { verified: true, reference: 'client-only' }; }
    }]),
    /trusted server verification contract/
  );

  const userId = await createUser('trusted_task');
  const otherUserId = await createUser('other_trusted_task');
  const taskId = await createTask();
  const providerReference = `trusted-${Date.now()}`;
  try {
    const started = await startTaskAdvertisement({
      userId,
      taskId,
      idempotencyKey: `trusted-task-${Date.now()}`,
      externalAdId: providerReference,
      providerRegistry: registry
    });

    const verified = await verifyTrustedTaskAdvertisement({
      providerId: provider.id,
      providerPayload: { accepted: true, reference: providerReference, userId },
      providerRegistry: registry
    });
    assert.strictEqual(verified.adEvent.id, started.adEvent.id);
    assert.strictEqual(verified.adEvent.verified, true);

    await assert.rejects(
      () => verifyTrustedTaskAdvertisement({
        providerId: provider.id,
        providerPayload: { accepted: true, reference: providerReference, userId: otherUserId },
        providerRegistry: registry
      }),
      /Trusted task provider user does not match advertisement owner/
    );

    const duplicate = await verifyTrustedTaskAdvertisement({
      providerId: provider.id,
      providerPayload: { accepted: true, reference: providerReference, userId },
      providerRegistry: registry
    });
    assert.strictEqual(duplicate.duplicate, true);

    await assert.rejects(
      () => verifyTrustedTaskAdvertisement({
        providerId: 'unknown-provider',
        providerPayload: { accepted: true, reference: providerReference, userId },
        providerRegistry: registry
      }),
      /Advertisement provider unknown-provider is not available for task/
    );

    console.log('Trusted task advertisement ingress invariants: PASS');
  } finally {
    await cleanup([userId, otherUserId], taskId);
    await pool.end();
  }
}

main().catch(error => {
  console.error('Trusted task advertisement ingress invariants: FAIL');
  console.error(error);
  process.exit(1);
});
