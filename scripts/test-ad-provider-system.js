const assert = require('assert');
const {
  AD_PROVIDER_CONTEXTS,
  AdProviderRegistry,
  ProviderUnavailableError,
  selectProvider,
  verifyWithProvider
} = require('../src/services/ad-provider-service');

function provider(id, contexts, overrides = {}) {
  return {
    id,
    contexts,
    enabled: true,
    priority: 100,
    verifyCompletion: async () => ({ verified: true, reference: `${id}-ref` }),
    ...overrides
  };
}

async function testContextSelection() {
  const registry = new AdProviderRegistry([
    provider('daily-only', ['daily_checkin']),
    provider('verification', ['verification'], { priority: 10 })
  ]);
  assert.strictEqual(selectProvider(registry, { context: 'verification' }).id, 'verification');
  assert.strictEqual(selectProvider(registry, { context: 'daily_checkin' }).id, 'daily-only');
  assert.strictEqual(AD_PROVIDER_CONTEXTS.includes('reward_pool'), true);
}

function testProviderValidation() {
  assert.throws(() => new AdProviderRegistry([provider('duplicate', ['verification']), provider('duplicate', ['verification'])]), /Duplicate advertisement provider/);
  assert.throws(() => new AdProviderRegistry([provider('bad-context', ['unknown'])]), /Invalid advertisement context/);
  assert.throws(() => new AdProviderRegistry([provider('no-verify', ['verification'], { verifyCompletion: null })]), /verifyCompletion/);
}

async function testDisabledAndExplicitSelection() {
  const registry = new AdProviderRegistry([
    provider('disabled', ['verification'], { enabled: false, priority: 1 }),
    provider('preferred', ['verification'], { priority: 20 }),
    provider('fallback', ['verification'], { priority: 10 })
  ]);
  assert.strictEqual(selectProvider(registry, { context: 'verification' }).id, 'preferred');
  assert.strictEqual(selectProvider(registry, { context: 'verification', providerId: 'fallback' }).id, 'fallback');
  assert.throws(() => selectProvider(registry, { context: 'verification', providerId: 'disabled' }), /not available/);
}

async function testVerifiedResult() {
  const registry = new AdProviderRegistry([provider('trusted', ['verification'])]);
  const result = await verifyWithProvider(registry, { context: 'verification', providerId: 'trusted', payload: { externalId: 'x' } });
  assert.deepStrictEqual(result, { providerId: 'trusted', verification: { verified: true, reference: 'trusted-ref' } });
}

async function testInvalidProviderResultFailsClosed() {
  const registry = new AdProviderRegistry([provider('malformed', ['verification'], { verifyCompletion: async () => ({ verified: true }) })]);
  await assert.rejects(() => verifyWithProvider(registry, { context: 'verification', providerId: 'malformed', payload: {} }), /invalid verification result/);
}

async function testUnavailableProviderCanFailOver() {
  const registry = new AdProviderRegistry([
    provider('down', ['verification'], { priority: 20, verifyCompletion: async () => { throw new ProviderUnavailableError('down'); } }),
    provider('healthy', ['verification'], { priority: 10 })
  ]);
  const result = await verifyWithProvider(registry, { context: 'verification', payload: {} });
  assert.strictEqual(result.providerId, 'healthy');
  assert.strictEqual(result.verification.reference, 'healthy-ref');
}

async function testRejectedVerificationNeverFailsOver() {
  const registry = new AdProviderRegistry([
    provider('rejecting', ['verification'], { priority: 20, verifyCompletion: async () => ({ verified: false, reference: 'rejected' }) }),
    provider('healthy', ['verification'], { priority: 10 })
  ]);
  const result = await verifyWithProvider(registry, { context: 'verification', payload: {} });
  assert.strictEqual(result.providerId, 'rejecting');
  assert.strictEqual(result.verification.verified, false);
}

async function testNoProviderFailsClosed() {
  const registry = new AdProviderRegistry([]);
  await assert.rejects(() => verifyWithProvider(registry, { context: 'verification', payload: {} }), /No advertisement provider available/);
}

(async () => {
  try {
    await testContextSelection();
    testProviderValidation();
    await testDisabledAndExplicitSelection();
    await testVerifiedResult();
    await testInvalidProviderResultFailsClosed();
    await testUnavailableProviderCanFailOver();
    await testRejectedVerificationNeverFailsOver();
    await testNoProviderFailsClosed();
    console.log('Multi-provider advertisement system invariants: PASS');
  } catch (error) {
    console.error('Multi-provider advertisement system invariants: FAIL');
    console.error(error);
    process.exitCode = 1;
  }
})();
