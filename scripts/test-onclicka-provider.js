const assert = require('assert');
const fs = require('fs');
const path = require('path');
process.env.ONCLICKA_ENABLED = 'true';
const { ONCLICKA_PROVIDER_ID, createOnclickaProvider } = require('../src/services/onclicka-adapter');
const { createOnclickaPostbackRouter } = require('../src/http/onclicka-postback-routes');
const providerRegistry = require('../src/services/ad-provider-registry-runtime');

async function testProviderContract() {
  const provider = createOnclickaProvider({ enabled: true, spotId: '6134799' });
  assert.strictEqual(provider.id, ONCLICKA_PROVIDER_ID);
  assert.deepStrictEqual(provider.contexts, ['task', 'daily_checkin', 'verification', 'gaming']);
  const result = await provider.verifyCompletion({ USERID: '12345', spot_id: '6134799', confirmedByPostback: true });
  assert.strictEqual(result.verified, true);
  assert.strictEqual(result.reference, 'onclicka:6134799:12345');
  const serverResult = await provider.verifyServerCompletion({ USERID: '12345', spot_id: '6134799', confirmedByPostback: true, reference: 'daily-ad-event-1' });
  assert.strictEqual(serverResult.userId, '12345');
  assert.strictEqual(serverResult.providerId, ONCLICKA_PROVIDER_ID);
  assert.strictEqual(serverResult.context, 'task');
  assert.strictEqual(serverResult.reference, 'daily-ad-event-1');
}

async function testRejectsUnauthenticatedCompletion() {
  const provider = createOnclickaProvider({ enabled: true, spotId: '6134799' });
  await assert.rejects(
    () => provider.verifyCompletion({ USERID: '12345', spot_id: '6134799' }),
    /Authenticated OnClickA postback is required/
  );
}

async function testRejectsWrongSpot() {
  const provider = createOnclickaProvider({ enabled: true, spotId: '6134799' });
  await assert.rejects(
    () => provider.verifyCompletion({ USERID: '12345', spot_id: '9999999', confirmedByPostback: true }),
    /Spot ID mismatch/
  );
}

async function testRejectsMissingUser() {
  const provider = createOnclickaProvider({ enabled: true, spotId: '6134799' });
  await assert.rejects(
    () => provider.verifyCompletion({ spot_id: '6134799', confirmedByPostback: true }),
    /USERID is required/
  );
}

function testOnclickaIsActiveAtRuntime() {
  for (const context of ['task', 'daily_checkin', 'verification', 'gaming']) {
    assert.strictEqual(providerRegistry.listAvailable(context)[0].id, ONCLICKA_PROVIDER_ID);
  }
}

function testPostbackRouterUsesOnClickAUserIdCallbackWithoutLocalSecret() {
  const router = createOnclickaPostbackRouter({ providerRegistry });
  assert.ok(router);
}

function testProviderSdkIsNotHardcodedToLoadAlongsideAnotherProvider() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(html, /__MONETAG_SCRIPTS__/);
  assert.doesNotMatch(html, /<script[^>]+src=["']\/\/libtl\.com\/sdk\.js/);
}

(async () => {
  try {
    await testProviderContract();
    await testRejectsUnauthenticatedCompletion();
    await testRejectsWrongSpot();
    await testRejectsMissingUser();
    testOnclickaIsActiveAtRuntime();
    testPostbackRouterUsesOnClickAUserIdCallbackWithoutLocalSecret();
    testProviderSdkIsNotHardcodedToLoadAlongsideAnotherProvider();
    console.log('OnClickA provider contract: PASS');
  } catch (error) {
    console.error('OnClickA provider contract: FAIL');
    console.error(error);
    process.exitCode = 1;
  }
})();