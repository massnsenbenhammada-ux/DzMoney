const assert = require('assert');
const { pool, withTransaction } = require('../src/db/pool');
const { AdProviderRegistry } = require('../src/services/ad-provider-service');
const {
  startTaskAdvertisement,
  verifyTaskAdvertisement,
  finalizeTaskAdvertisement
} = require('../src/services/task-advertisement-service');

const provider = {
  id: 'test-task-ad',
  contexts: ['task'],
  async verifyCompletion(payload) {
    return payload?.accepted === true
      ? { verified: true, reference: payload.reference || 'task-ad-ref' }
      : { verified: false, reference: 'task-ad-rejected' };
  }
};
const registry = new AdProviderRegistry([provider]);

async function createUser() {
  const marker = `${Date.now()}-${Math.random()}`;
  const result = await pool.query(
    'INSERT INTO users (telegram_user_id, username, first_name) VALUES ($1,$2,$3) RETURNING id',
    [marker, `task_ad_${Date.now()}`, 'Task Ad Test']
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
     VALUES ('web','Task advertisement test',1000,1,1,'active')
     RETURNING id`,
    []
  );
  return result.rows[0].id;
}

async function balance(userId, currency) {
  const result = await pool.query(
    'SELECT balance FROM wallet_accounts WHERE user_id=$1 AND currency=$2',
    [userId, currency]
  );
  return Number(result.rows[0].balance);
}

async function cleanup(userId, taskId) {
  await withTransaction(async client => {
    await client.query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id=$1)', [userId]);
    await client.query('DELETE FROM ledger_transactions WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM activity_ad_events WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM wallet_accounts WHERE user_id=$1', [userId]);
    await client.query('DELETE FROM users WHERE id=$1', [userId]);
    await client.query('DELETE FROM activity_tasks WHERE id=$1', [taskId]);
  });
}

async function main() {
  const userId = await createUser();
  const taskId = await createTask();
  try {
    const started = await startTaskAdvertisement({
      userId,
      taskId,
      idempotencyKey: `task-ad-${Date.now()}`,
      providerRegistry: registry
    });
    assert.strictEqual(started.providerId, provider.id);
    assert.strictEqual(started.adEvent.context, 'task');
    assert.strictEqual(started.adEvent.metadata.task_id, taskId);
    assert.strictEqual(started.adEvent.verified, false);

    await assert.rejects(
      () => verifyTaskAdvertisement({
        userId,
        adEventId: started.adEvent.id,
        providerRegistry: registry,
        providerPayload: { accepted: false }
      }),
      /Advertisement provider verification failed/
    );

    const verified = await verifyTaskAdvertisement({
      userId,
      adEventId: started.adEvent.id,
      providerRegistry: registry,
      providerPayload: { accepted: true, reference: 'task-ad-ref-1' }
    });
    assert.strictEqual(verified.adEvent.verified, true);

    const rewarded = await finalizeTaskAdvertisement({
      userId,
      adEventId: started.adEvent.id,
      idempotencyKey: `task-ad-reward-${Date.now()}`
    });
    assert.strictEqual(rewarded.rewarded, true);
    assert.strictEqual(await balance(userId, 'COIN'), 1000);
    assert.strictEqual(await balance(userId, 'DZX'), 1);
    assert.strictEqual(await balance(userId, 'DZP'), 1);

    const duplicate = await finalizeTaskAdvertisement({
      userId,
      adEventId: started.adEvent.id,
      idempotencyKey: rewarded.rewardIdempotencyKey
    });
    assert.strictEqual(duplicate.duplicate, true);
    assert.strictEqual(await balance(userId, 'COIN'), 1000);

    await assert.rejects(
      () => finalizeTaskAdvertisement({
        userId,
        adEventId: started.adEvent.id,
        idempotencyKey: `task-ad-reward-${Date.now()}-other`
      }),
      /already finalized/
    );

    console.log('Task advertisement flow invariants: PASS');
  } finally {
    await cleanup(userId, taskId);
    await pool.end();
  }
}

main().catch(error => {
  console.error('Task advertisement flow invariants: FAIL');
  console.error(error);
  process.exit(1);
});
