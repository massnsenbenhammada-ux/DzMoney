const assert = require('assert');
const {
  AD_PROVIDER_CONTEXTS,
  SQUAD_PROVIDER_ORDER,
  AdProviderRegistry,
  ProviderUnavailableError,
  selectNextProvider,
  getProviderForVerification,
  verifyWithProvider
} = require('../src/services/ad-provider-service');

function provider(id, contexts, overrides = {}) {
  return {
    id,
    contexts,
    enabled: true,
    verifyCompletion: async () => ({ verified: true, reference: `${id}-ref` }),
    verifyServerCompletion: async () => ({ verified: true, reference: `${id}-server-ref` }),
    ...overrides
  };
}

function testContextSelection() {
  const registry = new AdProviderRegistry([provider('first', ['verification']), provider('second', ['verification'])]);
  assert.strictEqual(selectNextProvider(registry, { context: 'verification' }).id, 'first');
  assert.strictEqual(selectNextProvider(registry, { context: 'verification', previousProviderId: 'first' }).id, 'second');
  assert.strictEqual(selectNextProvider(registry, { context: 'verification', previousProviderId: 'second' }).id, 'first');
  assert.strictEqual(AD_PROVIDER_CONTEXTS.includes('gaming'), true);
  assert.strictEqual(AD_PROVIDER_CONTEXTS.includes('squad'), true);
  assert.strictEqual(AD_PROVIDER_CONTEXTS.includes('reward_pool'), false);
}

function testSquadRotationOrder() {
  const registry = new AdProviderRegistry([
    provider('gigapub', ['squad']),
    provider('onclicka', ['squad']),
    provider('monetag', ['squad'])
  ]);
  assert.deepStrictEqual(SQUAD_PROVIDER_ORDER, ['monetag', 'onclicka']);
  assert.strictEqual(selectNextProvider(registry, { context: 'squad' }).id, 'monetag');
  assert.strictEqual(selectNextProvider(registry, { context: 'squad', previousProviderId: 'monetag' }).id, 'onclicka');
  assert.strictEqual(selectNextProvider(registry, { context: 'squad', previousProviderId: 'onclicka' }).id, 'monetag');
  registry.setContextEnabled('monetag', 'squad', false);
  assert.strictEqual(selectNextProvider(registry, { context: 'squad' }).id, 'onclicka');
}

function testProviderValidation() {
  assert.throws(() => new AdProviderRegistry([provider('duplicate', ['verification']), provider('duplicate', ['verification'])]), /Duplicate advertisement provider/);
  assert.throws(() => new AdProviderRegistry([provider('bad-context', ['unknown'])]), /Invalid advertisement context/);
  assert.throws(() => new AdProviderRegistry([provider('no-verify', ['verification'], { verifyCompletion: null })]), /verifyCompletion/);
}

function testDisabledProviderIsSkipped() {
  const registry = new AdProviderRegistry([provider('first', ['verification']), provider('disabled', ['verification'], { enabled: false }), provider('third', ['verification'])]);
  assert.strictEqual(selectNextProvider(registry, { context: 'verification', previousProviderId: 'first' }).id, 'third');
  assert.strictEqual(selectNextProvider(registry, { context: 'verification', previousProviderId: 'third' }).id, 'first');
}

async function testVerificationUsesRecordedProviderOnly() {
  const registry = new AdProviderRegistry([
    provider('first', ['verification'], { verifyCompletion: async () => { throw new ProviderUnavailableError('first'); } }),
    provider('second', ['verification'])
  ]);
  await assert.rejects(() => verifyWithProvider(registry, { context: 'verification', providerId: 'first', payload: {} }), /timed out|first/);
  assert.strictEqual(getProviderForVerification(registry, { context: 'verification', providerId: 'second' }).id, 'second');
}

async function testVerifiedResult() {
  const registry = new AdProviderRegistry([provider('trusted', ['verification'])]);
  const result = await verifyWithProvider(registry, { context: 'verification', providerId: 'trusted', payload: { externalId: 'x' } });
  assert.deepStrictEqual(result, { providerId: 'trusted', verification: { verified: true, reference: 'trusted-ref' } });
}

async function testInvalidProviderResultFailsClosed() {
  const registry = new AdProviderRegistry([provider('malformed', ['verification'], { verifyCompletion: async () => ({ verified: true }) })]);
  await assert.rejects(() => verifyWithProvider(registry, { context: 'verification', providerId: 'malformed', payload: {} }), /requires a provider reference/);
}

function testNoProviderFailsClosed() {
  const registry = new AdProviderRegistry([]);
  assert.throws(() => selectNextProvider(registry, { context: 'verification' }), /No advertisement provider available/);
}

function testAdminCanDisableOneContextOnly() {
  const registry = new AdProviderRegistry([provider('multi', ['task', 'verification', 'daily_checkin', 'gaming'])]);
  registry.setContextEnabled('multi', 'daily_checkin', false);
  assert.strictEqual(selectNextProvider(registry, { context: 'task' }).id, 'multi');
  assert.strictEqual(selectNextProvider(registry, { context: 'verification' }).id, 'multi');
  assert.throws(() => selectNextProvider(registry, { context: 'daily_checkin' }), /No advertisement provider available/);
  assert.strictEqual(selectNextProvider(registry, { context: 'gaming' }).id, 'multi');
}

function testContextEnablementRejectsUnknownContext() {
  const registry = new AdProviderRegistry([provider('multi', ['task'])]);
  assert.throws(() => registry.setContextEnabled('multi', 'unknown', false), /Invalid advertisement context/);
}

(async () => {
  try {
    testContextSelection();
    testSquadRotationOrder();
    testProviderValidation();
    testDisabledProviderIsSkipped();
    await testVerificationUsesRecordedProviderOnly();
    await testVerifiedResult();
    await testInvalidProviderResultFailsClosed();
    testNoProviderFailsClosed();
    testAdminCanDisableOneContextOnly();
    testContextEnablementRejectsUnknownContext();
    console.log('Multi-provider advertisement rotation invariants: PASS');
  } catch (error) {
    console.error('Multi-provider advertisement rotation invariants: FAIL');
    console.error(error);
    process.exitCode = 1;
  }
})();
