const assert = require('assert');
process.env.ADSGRAM_ENABLED = 'true';
process.env.ADSGRAM_BLOCK_ID = '44442';
const { createAdsgramProvider } = require('../src/services/adsgram-adapter');
const {
  AdProviderRegistry,
  selectNextProvider,
} = require('../src/services/ad-provider-service');

async function main() {
  const provider = createAdsgramProvider();
  assert.strictEqual(provider.id, 'adsgram');
  assert.deepStrictEqual(provider.contexts, ['task', 'squad']);
  assert.strictEqual(
    (
      await provider.verifyServerCompletion({
        userId: '123',
        blockId: '44442',
        reference: 'adsgram:1',
        providerConfirmed: true,
        clientCompleted: false,
        context: 'squad',
      })
    ).verified,
    false,
  );
  assert.strictEqual(
    (
      await provider.verifyServerCompletion({
        userId: '123',
        blockId: '99999',
        reference: 'adsgram:1',
        providerConfirmed: true,
        clientCompleted: true,
        context: 'squad',
      })
    ).verified,
    false,
  );
  assert.strictEqual(
    (
      await provider.verifyServerCompletion({
        userId: '123',
        blockId: '44442',
        reference: 'adsgram:1',
        providerConfirmed: true,
        clientCompleted: true,
        context: 'gaming',
      })
    ).verified,
    false,
  );
  assert.strictEqual(
    (
      await provider.verifyServerCompletion({
        userId: '123',
        blockId: '44442',
        reference: 'adsgram:1',
        providerConfirmed: true,
        clientCompleted: true,
        context: 'task',
      })
    ).verified,
    true,
  );
  assert.strictEqual(
    (
      await provider.verifyServerCompletion({
        userId: '123',
        blockId: '44442',
        reference: 'adsgram:1',
        providerConfirmed: true,
        clientCompleted: true,
        context: 'squad',
      })
    ).verified,
    true,
  );
  const fakeMonetag = {
    id: 'monetag',
    contexts: ['squad'],
    enabled: true,
    verifyCompletion: async () => ({ verified: false }),
    verifyServerCompletion: async () => ({ verified: false }),
  };
  const registry = new AdProviderRegistry([fakeMonetag, provider]);
  assert.strictEqual(
    selectNextProvider(registry, { context: 'squad' }).id,
    'monetag',
  );
  assert.strictEqual(
    selectNextProvider(registry, {
      context: 'squad',
      previousProviderId: 'monetag',
    }).id,
    'adsgram',
  );
  assert.strictEqual(
    selectNextProvider(registry, {
      context: 'squad',
      previousProviderId: 'adsgram',
    }).id,
    'monetag',
  );
  console.log('AdsGram provider/rotation tests: PASS');
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
