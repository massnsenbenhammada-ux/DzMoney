const assert = require('assert');
const express = require('express');
const http = require('http');
const fs = require('fs');

async function run() {
  const poolPath = require.resolve('../src/db/pool');
  const adEventPath = require.resolve('../src/services/ad-event-service');
  const providerPath = require.resolve('../src/services/ad-provider-service');
  const adapterPath = require.resolve('../src/services/monetag-adapter');
  const dailyCheckinPath = require.resolve('../src/services/daily-checkin-service');
  const postbackPath = require.resolve('../src/services/monetag-postback-service');
  const routeSource = fs.readFileSync(require.resolve('../src/http/monetag-postback-routes'), 'utf8');
  const originalPool = require(poolPath);
  const originalAdEvent = require(adEventPath);
  const originalProvider = require(providerPath);
  const originalAdapter = require(adapterPath);
  const originalDailyCheckin = require(dailyCheckinPath);
  const { validateMonetagPostback } = require(postbackPath);

  assert(routeSource.includes("a.metadata->>'provider_id'=$2"));
  assert(routeSource.includes('a.verified=FALSE'));

  const validPayload = {
    telegram_id: '123', zone_id: '11627577', event_type: 'impression',
    reward_event_type: 'valued', estimated_price: '0.01000',
    ymid: 'attempt-1', request_var: 'daily_checkin'
  };
  assert.doesNotThrow(() => validateMonetagPostback(validPayload));
  assert.doesNotThrow(() => validateMonetagPostback({ ...validPayload, telegram_id: '', reward_event_type: 'yes' }));
  assert.throws(() => validateMonetagPostback({ ...validPayload, reward_event_type: 'non_valued' }), /not a rewarded event/);

  require.cache[poolPath].exports = {
    ...originalPool,
    query: async () => ({ rowCount: 1, rows: [{ id: 9, user_id: 7, context: 'daily_checkin', external_ad_id: 'attempt-1', verified: false, telegram_user_id: '123', claim_idempotency_key: 'claim-1' }] })
  };
  require.cache[adEventPath].exports = { ...originalAdEvent, markAdvertisementVerified: async args => ({ duplicate: false, verified: true, args }) };
  require.cache[providerPath].exports = { ...originalProvider, verifyWithProvider: async () => ({ providerId: 'monetag', verification: { verified: true, reference: 'attempt-1', metadata: {} } }) };
  require.cache[adapterPath].exports = { ...originalAdapter, MONETAG_PROVIDER_ID: 'monetag' };
  require.cache[dailyCheckinPath].exports = { ...originalDailyCheckin, finalizeDailyCheckin: async ({ userId, claimIdempotencyKey }) => ({ duplicate: false, rewarded: true, userId, claimIdempotencyKey }) };

  delete require.cache[require.resolve('../src/http/monetag-postback-routes')];
  const { createMonetagPostbackRouter } = require('../src/http/monetag-postback-routes');
  const app = express();
  app.use('/api/ads/monetag/postback', createMonetagPostbackRouter({ providerRegistry: {}, secret: 'secret' }));
  app.use((error, _req, res, _next) => {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    res.status(status).json({ ok: false, error: status === 500 ? 'Internal server error' : error.message });
  });
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  const request = path => new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const body = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, body });
        } catch (_error) {
          resolve({ status: res.statusCode, body: null });
        }
      });
    }).on('error', reject);
  });

  assert.strictEqual((await request('/api/ads/monetag/postback?token=bad')).status, 401);
  const ok = await request('/api/ads/monetag/postback?token=secret&telegram_id=123&zone_id=11627577&event_type=impression&reward_event_type=valued&estimated_price=0.01000&ymid=attempt-1&request_var=daily_checkin');
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.verified, true);
  assert.strictEqual(ok.body.rewarded, true);

  const missingTelegramId = await request('/api/ads/monetag/postback?token=secret&telegram_id=&zone_id=11627577&event_type=impression&reward_event_type=yes&estimated_price=0.01000&ymid=attempt-1&request_var=daily_checkin');
  assert.strictEqual(missingTelegramId.status, 200);
  assert.strictEqual(missingTelegramId.body.verified, true);
  assert.strictEqual(missingTelegramId.body.rewarded, true);

  await new Promise(resolve => server.close(resolve));
  require.cache[poolPath].exports = originalPool;
  require.cache[adEventPath].exports = originalAdEvent;
  require.cache[providerPath].exports = originalProvider;
  require.cache[adapterPath].exports = originalAdapter;
  require.cache[dailyCheckinPath].exports = originalDailyCheckin;
  console.log('Monetag postback HTTP boundary tests passed');
}

run().catch(error => { console.error(error); process.exit(1); });
