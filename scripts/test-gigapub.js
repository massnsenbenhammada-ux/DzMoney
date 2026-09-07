const assert = require('assert');
const { createGigaPubProvider, GIGAPUB_PROVIDER_ID, GIGAPUB_PROJECT_ID } = require('../src/services/gigapub-adapter');

const provider = createGigaPubProvider();
assert.strictEqual(provider.id, GIGAPUB_PROVIDER_ID);
assert.deepStrictEqual(provider.contexts, ['gaming']);
assert.strictEqual(provider.clientConfig.projectId, GIGAPUB_PROJECT_ID);
assert.strictEqual(provider.enabled, false);
assert.strictEqual(typeof provider.verifyServerCompletion, 'undefined');

(async () => {
  await assert.rejects(
    () => provider.verifyCompletion({ userId: '123', adEventId: '456' }),
    /trusted provider verification/
  );
  console.log('GigaPub standard ad provider safety contract passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
