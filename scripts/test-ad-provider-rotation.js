const assert = require('assert');
const {
  AdProviderRegistry,
  selectNextProvider
} = require('../src/services/ad-provider-service');

function provider(id, contexts = ['gaming']) {
  return {
    id,
    contexts,
    enabled: true,
    verifyCompletion: async () => ({ verified: true, reference: `${id}-ref` })
  };
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

console.log('Advertisement provider rotation contract tests passed.');
