const assert = require('assert');
const {
  AdProviderRegistry,
  selectNextProvider
} = require('../src/services/ad-provider-service');
const { startRotatedAdvertisementEventOnClient } = require('../src/services/ad-event-service');

function provider(id, contexts = ['gaming']) {
  const result = {
    id,
    contexts,
    enabled: true,
    verifyCompletion: async () => ({ verified: true, reference: `${id}-ref` })
  };
  if (contexts.includes('task')) {
    result.verifyServerCompletion = async () => ({
      verified: true,
      reference: `${id}-ref`,
      userId: 1,
      providerId: id,
      context: 'task'
    });
  }
  return result;
}

const registry = new AdProviderRegistry([
  provider('gigapub'),
  provider('onclicka'),
  provider('monetag')
]);

assert.deepStrictEqual(
  registry.listAvailable('gaming').map(item => item.id),
  ['gigapub', 'onclicka', 'monetag']
);

assert.strictEqual(selectNextProvider(registry, { context: 'gaming' }).id, 'gigapub');
assert.strictEqual(selectNextProvider(registry, { context: 'gaming', previousProviderId: 'gigapub' }).id, 'onclicka');
assert.strictEqual(selectNextProvider(registry, { context: 'gaming', previousProviderId: 'onclicka' }).id, 'monetag');
assert.strictEqual(selectNextProvider(registry, { context: 'gaming', previousProviderId: 'monetag' }).id, 'gigapub');

registry.get('onclicka').enabled = false;
assert.strictEqual(selectNextProvider(registry, { context: 'gaming', previousProviderId: 'gigapub' }).id, 'monetag');
assert.strictEqual(selectNextProvider(registry, { context: 'gaming', previousProviderId: 'onclicka' }).id, 'monetag');
assert.strictEqual(selectNextProvider(registry, { context: 'gaming', previousProviderId: 'monetag' }).id, 'gigapub');

assert.throws(
  () => selectNextProvider(registry, { context: 'gaming', previousProviderId: 'unknown' }),
  /Unknown previous advertisement provider/
);

const taskRegistry = new AdProviderRegistry([
  provider('onclicka', ['task']),
  provider('monetag', ['task'])
]);
assert.strictEqual(selectNextProvider(taskRegistry, { context: 'task' }).id, 'onclicka');
assert.strictEqual(selectNextProvider(taskRegistry, { context: 'task', previousProviderId: 'onclicka' }).id, 'monetag');
assert.strictEqual(selectNextProvider(taskRegistry, { context: 'task', previousProviderId: 'monetag' }).id, 'onclicka');

function fakeClient() {
  const events = [];
  return {
    events,
    async query(sql, params) {
      if (sql.includes('pg_advisory_xact_lock')) return { rowCount: 0, rows: [] };
      if (sql.includes('SELECT * FROM activity_ad_events WHERE idempotency_key')) {
        const row = events.find(event => event.idempotency_key === params[0]);
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }
      if (sql.includes("metadata->>'provider_id' AS provider_id")) {
        const row = [...events].reverse().find(event => event.context === params[0] && event.metadata.provider_id);
        return { rowCount: row ? 1 : 0, rows: row ? [{ provider_id: row.metadata.provider_id }] : [] };
      }
      if (sql.includes('INSERT INTO activity_ad_events')) {
        const event = {
          id: events.length + 1,
          user_id: params[0],
          context: params[1],
          external_ad_id: params[2],
          idempotency_key: params[3],
          metadata: params[4]
        };
        events.push(event);
        return { rowCount: 1, rows: [event] };
      }
      throw new Error(`Unexpected SQL in rotation test: ${sql}`);
    }
  };
}

(async () => {
  const client = fakeClient();
  const first = await startRotatedAdvertisementEventOnClient(client, {
    userId: 1,
    context: 'gaming',
    idempotencyKey: 'ad-1',
    metadata: { game: 'spin' },
    providerRegistry: registry
  });
  assert.strictEqual(first.providerId, 'gigapub');
  const duplicate = await startRotatedAdvertisementEventOnClient(client, {
    userId: 1,
    context: 'gaming',
    idempotencyKey: 'ad-1',
    metadata: { game: 'spin' },
    providerRegistry: registry
  });
  assert.strictEqual(duplicate.providerId, 'gigapub');
  assert.strictEqual(duplicate.duplicate, true);
  assert.strictEqual(client.events.length, 1);

  const second = await startRotatedAdvertisementEventOnClient(client, {
    userId: 1,
    context: 'gaming',
    idempotencyKey: 'ad-2',
    metadata: { game: 'digging' },
    providerRegistry: registry
  });
  assert.strictEqual(second.providerId, 'monetag');
  assert.strictEqual(client.events.length, 2);
  console.log('Advertisement provider rotation contract tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
