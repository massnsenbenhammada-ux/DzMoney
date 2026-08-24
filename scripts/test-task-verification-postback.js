const assert = require('assert');
const express = require('express');

async function run() {
  const dbPath = require.resolve('../src/db/pool');
  const providerPath = require.resolve('../src/services/ad-provider-service');
  const adEventPath = require.resolve('../src/services/ad-event-service');
  const verificationPath = require.resolve('../src/services/task-verification-service');
  const originalDb = require(dbPath);
  const originalProvider = require(providerPath);
  const originalAdEvent = require(adEventPath);
  const originalVerification = require(verificationPath);
  const calls = [];

  require.cache[dbPath].exports = {
    ...originalDb,
    query: async () => ({ rowCount: 1, rows: [{ id: 17, user_id: 42, context: 'verification', external_ad_id: 'verification-ymid-1', verified: false, telegram_user_id: '123', claim_idempotency_key: null, attempt_id: 99 }] })
  };
  require.cache[providerPath].exports = {
    ...originalProvider,
    verifyWithProvider: async ({ context, providerId }) => ({ providerId: providerId || 'monetag', verification: { verified: true, reference: `${context}-ref`, metadata: {} } })
  };
  require.cache[adEventPath].exports = {
    ...originalAdEvent,
    markAdvertisementVerified: async args => { calls.push(['verify', args]); return { duplicate: false }; }
  };
  require.cache[verificationPath].exports = {
    ...originalVerification,
    verifyTaskAdvertisement: async args => {
      calls.push(['verifyTaskAdvertisement', args]);
      return { duplicate: false, verification: { verified: true, reference: 'verification-ref', metadata: {} } };
    },
    finalizeTaskVerification: async args => { calls.push(['finalize', args]); return { duplicate: false, status: 'verification_pending', rewarded: false, reason: 'link_click_required' }; }
  };

  const { createMonetagPostbackRouter } = require('../src/http/monetag-postback-routes');
  const app = express();
  app.use('/api/ads/monetag/postback', createMonetagPostbackRouter({ providerRegistry: {}, secret: 'test-secret' }));
  const http = require('http');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  const response = await new Promise((resolve, reject) => {
    const path = '/api/ads/monetag/postback?token=test-secret&telegram_id=123&zone_id=11627577&event_type=impression&reward_event_type=valued&estimated_price=0.01000&ymid=verification-ymid-1&request_var=verification';
    http.get({ hostname: '127.0.0.1', port, path }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, rawBody: data }));
    }).on('error', reject);
  });

  assert.strictEqual(response.status, 200, `Unexpected response: ${response.rawBody}`);
  const body = JSON.parse(response.rawBody);
  assert.strictEqual(body.context, 'verification');
  assert.strictEqual(body.verified, true);
  assert.strictEqual(body.status, 'verification_pending');
  assert.strictEqual(body.rewarded, false);
  assert.deepStrictEqual(calls[0][0], 'verifyTaskAdvertisement');
  assert.strictEqual(calls[0][1].adEventId, 17);
  assert.deepStrictEqual(calls[1], ['finalize', { attemptId: 99, idempotencyKey: 'task:99' }]);

  await new Promise(resolve => server.close(resolve));
  require.cache[dbPath].exports = originalDb;
  require.cache[providerPath].exports = originalProvider;
  require.cache[adEventPath].exports = originalAdEvent;
  require.cache[verificationPath].exports = originalVerification;
  console.log('Task verification postback finalization test passed');
}

run().catch(error => { console.error(error); process.exit(1); });
