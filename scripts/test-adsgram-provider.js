const assert = require('assert');
process.env.ADSGRAM_ENABLED = 'true';
process.env.ADSGRAM_BLOCK_ID = '44442';
process.env.ADSGRAM_REWARD_TOKEN = 'test-secret';
const { createAdsgramProvider } = require('../src/services/adsgram-adapter');
const { AdProviderRegistry, selectNextProvider } = require('../src/services/ad-provider-service');

async function main() {
  const provider = createAdsgramProvider();
  assert.strictEqual(provider.id, 'adsgram');
  assert.deepStrictEqual(provider.contexts, ['task']);
  assert.strictEqual((await provider.verifyServerCompletion({ userId: '123', blockId: '44442', reference: 'adsgram:1', providerConfirmed: true, clientCompleted: false })).verified, false);
  assert.strictEqual((await provider.verifyServerCompletion({ userId: '123', blockId: '99999', reference: 'adsgram:1', providerConfirmed: true, clientCompleted: true })).verified, false);
  assert.strictEqual((await provider.verifyServerCompletion({ userId: '123', blockId: '44442', reference: 'adsgram:1', providerConfirmed: true, clientCompleted: true })).verified, true);
  const fakeMonetag = { id: 'monetag', contexts: ['task'], enabled: true, verifyCompletion: async () => ({ verified: false }), verifyServerCompletion: async () => ({ verified: false }) };
  const registry = new AdProviderRegistry([fakeMonetag, provider]);
  assert.strictEqual(selectNextProvider(registry, { context: 'task' }).id, 'monetag');
  assert.strictEqual(selectNextProvider(registry, { context: 'task', previousProviderId: 'monetag' }).id, 'adsgram');
  assert.strictEqual(selectNextProvider(registry, { context: 'task', previousProviderId: 'adsgram' }).id, 'monetag');
  console.log('AdsGram provider/rotation tests: PASS');
}
main().catch(error => { console.error(error); process.exit(1); });
