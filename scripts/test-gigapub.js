const assert = require('assert');
const { createGigaPubProvider, GIGAPUB_PROVIDER_ID, GIGAPUB_PROJECT_ID } = require('../src/services/gigapub-adapter');

const provider = createGigaPubProvider();
assert.strictEqual(provider.id, GIGAPUB_PROVIDER_ID);
assert.deepStrictEqual(provider.contexts, ['gaming']);
assert.strictEqual(provider.clientConfig.projectId, GIGAPUB_PROJECT_ID);
assert.strictEqual(provider.enabled, process.env.GIGAPUB_ENABLED === 'true');

(async () => {
  const result = await provider.verifyCompletion({ userId: '123', adEventId: '456' });
  assert.strictEqual(result.verified, true);
  assert.strictEqual(result.reference, `gigapub:${GIGAPUB_PROJECT_ID}:456`);
  assert.strictEqual(result.metadata.provider_id, 'gigapub');
  await assert.rejects(() => provider.verifyCompletion({ userId: '123' }), /ad event/);
  console.log('GigaPub standard ad provider tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
