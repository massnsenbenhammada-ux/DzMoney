'use strict';

process.env.ADSGRAM_ENABLED = 'true';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createAdsgramProvider,
  ADSGRAM_BLOCK_ID,
} = require('../src/services/adsgram-adapter');
const {
  AdProviderRegistry,
  selectNextProvider,
} = require('../src/services/ad-provider-service');

test('AdsGram Squad provider is configured for the canonical block and context', () => {
  assert.equal(ADSGRAM_BLOCK_ID, '44442');
  const provider = createAdsgramProvider();
  assert.deepEqual(provider.contexts, ['task', 'squad']);
  assert.equal(provider.id, 'adsgram');
});

test('AdsGram trusted verification requires both confirmations and Squad context', async () => {
  const provider = createAdsgramProvider();
  const accepted = await provider.verifyServerCompletion({
    providerConfirmed: true,
    clientCompleted: true,
    blockId: ADSGRAM_BLOCK_ID,
    context: 'squad',
    userId: '10001',
    reference: 'provider-ref',
  });
  assert.equal(accepted.verified, true);
  const missingClient = await provider.verifyServerCompletion({
    providerConfirmed: true,
    clientCompleted: false,
    blockId: ADSGRAM_BLOCK_ID,
    context: 'squad',
    userId: '10001',
    reference: 'provider-ref',
  });
  assert.equal(missingClient.verified, false);
  const wrongContext = await provider.verifyServerCompletion({
    providerConfirmed: true,
    clientCompleted: true,
    blockId: ADSGRAM_BLOCK_ID,
    context: 'gaming',
    userId: '10001',
    reference: 'provider-ref',
  });
  assert.equal(wrongContext.verified, false);
});

test('Squad rotation remains Monetag -> AdsGram -> OnClickA', () => {
  const registry = new AdProviderRegistry([
    ...['monetag', 'adsgram', 'onclicka'].map((id) => ({
      id,
      contexts: ['squad'],
      async verifyCompletion() {
        return { verified: false };
      },
    })),
  ]);
  assert.equal(
    selectNextProvider(registry, { context: 'squad' }).id,
    'monetag',
  );
  assert.equal(
    selectNextProvider(registry, {
      context: 'squad',
      previousProviderId: 'monetag',
    }).id,
    'adsgram',
  );
  assert.equal(
    selectNextProvider(registry, {
      context: 'squad',
      previousProviderId: 'adsgram',
    }).id,
    'onclicka',
  );
});

console.log('Squad Ads unit tests: PASS');
