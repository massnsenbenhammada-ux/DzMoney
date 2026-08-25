const assert = require('assert');
const { pool, withTransaction } = require('../src/db/pool');
const { AdProviderRegistry } = require('../src/services/ad-provider-service');
const {
  startTaskAdvertisement,
  verifyTrustedTaskAdvertisement,
  finalizeTaskAdvertisement
} = require('../src/services/task-advertisement-service');

function makeProvider(id, contexts = ['task'], { reportedProviderId = id } = {}) {
  return {
    id,
    contexts,
    async verifyCompletion() {
      throw new Error('client verification must never be used for task advertisements');
    },
    async verifyServerCompletion(payload) {
      return payload?.accepted === true
        ? {
            verified: true,
            reference: payload.reference,
            userId: payload.userId,
            providerId: reportedProviderId,
            context: payload.context || 'task'
          }
        : { verified: false, reference: payload?.reference || 'rejected' };
    }
  };
}

const provider = makeProvider('edge-task-provider');
const otherProvider = makeProvider('other-task-provider');
const mismatchedIdentityProvider = makeProvider('mismatched-task-provider', ['task'], {
  reportedProviderId: 'unexpected-provider'
});
const registry = new AdProviderRegistry([provider, otherProvider, mismatchedIdentityProvider]);

async function createUser(marker) {
  const result = await pool.query(
    'INSERT INTO users (telegram_user_id, username, first_name) VALUES ($1,$2,$3) RETURNING id',
    [String(marker), `edge_${marker}`, 'Edge Test']
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

async function createTask(title) {
  const result = await pool.query(
    `INSERT INTO activity_tasks
      (task_type,title,reward_coin,reward_dzx,reward_dzp,status)
     VALUES ('web',$1,1000,1,1,'active')
     RETURNING id`,
    [title]
  );
  return result.rows[0].id;
}

async function cleanup(userIds, taskIds) {
  await withTransaction(async client => {
    for (const userId of userIds) {
      await client.query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id=$1)', [userId]);
      await client.query('DELETE FROM ledger_transactions WHERE user_id=$1', [userId]);
      await client.query('DELETE FROM activity_ad_events WHERE user_id=$1', [userId]);
      await client.query('DELETE FROM task_verification_gates WHERE attempt_id IN (SELECT id FROM task_attempts WHERE user_id=$1)', [userId]);
      await client.query('DELETE FROM task_attempts WHERE user_id=$1', [userId]);
      await client.query('DELETE FROM wallet_accounts WHERE user_id=$1', [userId]);
      await client.query('DELETE FROM users WHERE id=$1', [userId]);
    }
    for (const taskId of taskIds) {
      await client.query('DELETE FROM activity_tasks WHERE id=$1', [taskId]);
    }
  });
}

async function main() {
  const userA = await createUser(`${Date.now()}1`);
  const userB = await createUser(`${Date.now()}2`);
  const taskA = await createTask('Task advertisement edge A');
  const taskB = await createTask('Task advertisement edge B');
  const sharedKey = `edge-shared-${Date.now()}`;

  try {
    const startedA = await startTaskAdvertisement({
      userId: userA,
      taskId: taskA,
      idempotencyKey: sharedKey,
      providerId: 'attacker-provider',
      externalAdId: 'attacker-reference',
      providerRegistry: registry
    });
    assert.strictEqual(startedA.providerId, provider.id);
    assert.notStrictEqual(startedA.adEvent.external_ad_id, 'attacker-reference');

    const duplicateA = await startTaskAdvertisement({ userId: userA, taskId: taskA, idempotencyKey: sharedKey, providerRegistry: registry });
    assert.strictEqual(duplicateA.duplicate, true);
    assert.strictEqual(duplicateA.adEvent.id, startedA.adEvent.id);

    await assert.rejects(
      () => startTaskAdvertisement({ userId: userB, taskId: taskA, idempotencyKey: sharedKey, providerRegistry: registry }),
      /Advertisement idempotency key belongs to another user/
    );

    await assert.rejects(
      () => startTaskAdvertisement({ userId: userA, taskId: taskB, idempotencyKey: sharedKey, providerRegistry: registry }),
      /Advertisement idempotency key is bound to another task/
    );

    const reference = startedA.adEvent.external_ad_id;

    await assert.rejects(
      () => verifyTrustedTaskAdvertisement({ providerId: provider.id, providerPayload: { accepted: true, userId: userA }, providerRegistry: registry }),
      /Trusted task provider reference is required/
    );

    await assert.rejects(
      () => verifyTrustedTaskAdvertisement({ providerId: provider.id, providerPayload: { accepted: true, reference, userId: userA, context: 'verification' }, providerRegistry: registry }),
      /Trusted task provider context must be task/
    );

    await assert.rejects(
      () => verifyTrustedTaskAdvertisement({ providerId: mismatchedIdentityProvider.id, providerPayload: { accepted: true, reference, userId: userA }, providerRegistry: registry }),
      /Trusted task provider identity does not match/
    );

    await assert.rejects(
      () => verifyTrustedTaskAdvertisement({ providerId: otherProvider.id, providerPayload: { accepted: true, reference, userId: userA }, providerRegistry: registry }),
      /Trusted task provider reference cannot be verified/
    );

    await assert.rejects(
      () => verifyTrustedTaskAdvertisement({ providerId: provider.id, providerPayload: { accepted: true, reference, userId: userB }, providerRegistry: registry }),
      /Trusted task provider user does not match advertisement owner/
    );

    const verified = await verifyTrustedTaskAdvertisement({ providerId: provider.id, providerPayload: { accepted: true, reference, userId: userA }, providerRegistry: registry });
    assert.strictEqual(verified.adEvent.verified, true);

    const replay = await verifyTrustedTaskAdvertisement({ providerId: provider.id, providerPayload: { accepted: true, reference, userId: userA }, providerRegistry: registry });
    assert.strictEqual(replay.duplicate, true);

    await assert.rejects(
      () => finalizeTaskAdvertisement({ userId: userB, adEventId: startedA.adEvent.id }),
      /Task advertisement event not found/
    );

    const rewarded = await finalizeTaskAdvertisement({ userId: userA, adEventId: startedA.adEvent.id });
    assert.strictEqual(rewarded.rewarded, true);

    const secondFinalize = await finalizeTaskAdvertisement({ userId: userA, adEventId: startedA.adEvent.id });
    assert.strictEqual(secondFinalize.duplicate, true);

    console.log('Task advertisement edge hardening invariants: PASS');
  } finally {
    await cleanup([userA, userB], [taskA, taskB]);
    await pool.end();
  }
}

main().catch(error => {
  console.error('Task advertisement edge hardening invariants: FAIL');
  console.error(error);
  process.exit(1);
});
