const assert = require('assert');
const crypto = require('crypto');
const express = require('express');

process.env.BOT_TOKEN = 'test-bot-token';

function buildInitData(userId) {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('user', JSON.stringify({ id: userId, first_name: 'Test' }));
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  params.set('hash', crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));
  return params.toString();
}

async function run() {
  const servicePath = require.resolve('../src/services/daily-checkin-service');
  const walletPath = require.resolve('../src/services/wallet-service');
  const originalService = require(servicePath);
  const originalWallet = require(walletPath);
  const calls = [];

  require.cache[servicePath].exports = {
    ...originalService,
    startDailyCheckinClaim: async args => { calls.push(['start', args]); return { claimIdempotencyKey: args.idempotencyKey, adEvent: { id: 7 }, providerId: 'test-provider' }; },
    verifyDailyCheckinAd: async args => { calls.push(['verify', args]); return { id: args.adEventId, verified: true }; },
    finalizeDailyCheckin: async args => { calls.push(['finalize', args]); return { rewarded: true, duplicate: false }; }
  };
  require.cache[walletPath].exports = { ...originalWallet, createUser: async () => ({ id: 42 }) };

  const { createDailyCheckinRouter } = require('../src/http/daily-checkin-routes');
  const app = express();
  app.use(express.json());
  app.use('/api/daily-checkin', createDailyCheckinRouter({ providerRegistry: {} }));
  const http = require('http');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  const request = (method, path, body, initData) => new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/json' };
    if (initData) headers['X-Telegram-Init-Data'] = initData;
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });

  assert.strictEqual((await request('POST', '/api/daily-checkin/claim', { idempotencyKey: 'claim-1' })).status, 401);
  const auth = buildInitData(123);
  const claim = await request('POST', '/api/daily-checkin/claim', { idempotencyKey: 'claim-1' }, auth);
  assert.strictEqual(claim.status, 200);
  assert.strictEqual(claim.body.adEvent.id, 7);
  assert.strictEqual(calls[0][0], 'start');
  assert.strictEqual(calls[0][1].userId, 42);

  const verify = await request('POST', '/api/daily-checkin/verify', { adEventId: 7, providerPayload: { token: 'verified' } }, auth);
  assert.strictEqual(verify.status, 200);
  assert.strictEqual(calls[1][1].userId, 42);
  assert.strictEqual(calls[1][1].adEventId, 7);

  const finalize = await request('POST', '/api/daily-checkin/finalize', { claimIdempotencyKey: 'claim-1' }, auth);
  assert.strictEqual(finalize.status, 200);
  assert.strictEqual(calls[2][1].userId, 42);
  assert.strictEqual(calls[2][1].claimIdempotencyKey, 'claim-1');

  await new Promise(resolve => server.close(resolve));
  console.log('daily-checkin HTTP boundary tests passed');
}

run().catch(error => { console.error(error); process.exit(1); });
