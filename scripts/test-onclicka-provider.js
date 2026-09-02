const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { ONCLICKA_PROVIDER_ID, createOnclickaProvider } = require('../src/services/onclicka-adapter');
const runtimeProviderRegistry = require('../src/services/ad-provider-registry-runtime');
const { AdProviderRegistry } = require('../src/services/ad-provider-service');

async function testProviderContract() {
  const provider = createOnclickaProvider({ enabled: true, spotId: '6134799' });
  assert.strictEqual(provider.id, ONCLICKA_PROVIDER_ID);
  assert.deepStrictEqual(provider.contexts, ['task', 'daily_checkin', 'verification', 'gaming']);
  const result = await provider.verifyCompletion({ USERID: '12345', spot_id: '6134799', postbackConfirmed: true });
  assert.strictEqual(result.verified, true);
  assert.strictEqual(result.reference, 'onclicka:6134799:12345');
  const serverResult = await provider.verifyServerCompletion({ USERID: '12345', spot_id: '6134799', postbackConfirmed: true, reference: 'daily-ad-event-1' });
  assert.strictEqual(serverResult.userId, '12345');
  assert.strictEqual(serverResult.providerId, ONCLICKA_PROVIDER_ID);
  assert.strictEqual(serverResult.context, 'task');
  assert.strictEqual(serverResult.reference, 'daily-ad-event-1');
}

async function testRejectsUnconfirmedCompletion() {
  const provider = createOnclickaProvider({ enabled: true, spotId: '6134799' });
  await assert.rejects(
    () => provider.verifyCompletion({ USERID: '12345', spot_id: '6134799' }),
    /OnClickA postback confirmation is required/
  );
}

async function testRejectsWrongSpot() {
  const provider = createOnclickaProvider({ enabled: true, spotId: '6134799' });
  await assert.rejects(
    () => provider.verifyCompletion({ USERID: '12345', spot_id: '9999999', postbackConfirmed: true }),
    /Spot ID mismatch/
  );
}

async function testRejectsMissingUser() {
  const provider = createOnclickaProvider({ enabled: true, spotId: '6134799' });
  await assert.rejects(
    () => provider.verifyCompletion({ spot_id: '6134799', postbackConfirmed: true }),
    /USERID is required/
  );
}

function testEnabledRegistryContract() {
  const registry = new AdProviderRegistry([createOnclickaProvider({ enabled: true, spotId: '6134799' })]);
  for (const context of ['task', 'daily_checkin', 'verification', 'gaming']) {
    assert.strictEqual(registry.listAvailable(context)[0].id, ONCLICKA_PROVIDER_ID);
  }
}

function testRuntimeRegistryWiring() {
  const provider = runtimeProviderRegistry.get(ONCLICKA_PROVIDER_ID);
  assert(provider, 'Runtime registry must register OnClickA');
  assert.strictEqual(provider.id, ONCLICKA_PROVIDER_ID);
  if (process.env.ONCLICKA_ENABLED === 'true') {
    for (const context of ['task', 'daily_checkin', 'verification', 'gaming']) {
      assert.strictEqual(runtimeProviderRegistry.listAvailable(context)[0].id, ONCLICKA_PROVIDER_ID);
    }
  }
}

function testProviderSdkIsNotHardcodedToLoadAlongsideAnotherProvider() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(html, /__MONETAG_SCRIPTS__/);
  assert.doesNotMatch(html, /<script[^>]+src=["']\/\/libtl\.com\/sdk\.js/);
}

(async () => {
  try {
    await testProviderContract();
    await testRejectsUnconfirmedCompletion();
    await testRejectsWrongSpot();
    await testRejectsMissingUser();
    testEnabledRegistryContract();
    testRuntimeRegistryWiring();
    testProviderSdkIsNotHardcodedToLoadAlongsideAnotherProvider();
    console.log('OnClickA provider contract: PASS');
  } catch (error) {
    console.error('OnClickA provider contract: FAIL');
    console.error(error);
    process.exitCode = 1;
  }
})();
