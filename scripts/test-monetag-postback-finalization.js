const assert = require('assert');
const express = require('express');

process.env.MONETAG_POSTBACK_SECRET = 'test-secret';

async function run() {
  const dbPath = require.resolve('../src/db/pool');
  const adProviderPath = require.resolve('../src/services/ad-provider-service');
  const adEventPath = require.resolve('../src/services/ad-event-service');
  const dailyCheckinPath = require.resolve('../src/services/daily-checkin-service');

  const originalDb = require(dbPath);
  const originalProvider = require(adProviderPath);
  const originalAdEvent = require(adEventPath);
  const originalDailyCheckin = require(dailyCheckinPath);
  const calls = [];

  require.cache[dbPath].exports = {
    ...originalDb,
    query: async () => ({ rowCount: 1, rows: [{ id: 7, user_id: 42, context: 'daily_checkin', external_ad_id: 'ymid-1', verified: false, telegram_user_id: '123' }] })
  };
  require.cache[adProviderPath].exports = {
    ...originalProvider,
    verifyWithProvider: async () => ({ providerId: 'monetag', verification: { verified: true, reference: 'monetag-ref', metadata: {} } })
  };
  require.cache[adEventPath].exports = {
    ...originalAdEvent,
    markAdvertisementVerified: async args => { calls.push(['verify', args]); return { duplicate: false }; }
  };
  require.cache[dailyCheckinPath].exports = {
    ...originalDailyCheckin,
    finalizeDailyCheckin: async args => { calls.push(['finalize', args]); return { rewarded: true, duplicate: false }; }
  };

  const { createMonetagPostbackRouter } = require('../src/http/monetag-postback-routes');
  const app = express();
  app.use('/api/ads/monetag/postback', createMonetagPostbackRouter({ providerRegistry: {}, secret: 'test-secret' }));
  const http = require('http');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  const path = '/api/ads/monetag/postback?token=test-secret&telegram_id=123&zone_id=11627577&event_type=impression&reward_event_type=yes&estimated_price=0.01000&ymid=ymid-1&request_var=daily_checkin';
  const response = await new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    }).on('error', reject);
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(calls[0][0], 'verify');
  assert.strictEqual(calls[1][0], 'finalize');
  assert.strictEqual(calls[1][1].userId, 42);
  assert.strictEqual(calls[1][1].claimIdempotencyKey, 'daily-ad:claim-1');

  await new Promise(resolve => server.close(resolve));
  console.log('Monetag postback finalization test passed');
}

run().catch(error => { console.error(error); process.exit(1); });
