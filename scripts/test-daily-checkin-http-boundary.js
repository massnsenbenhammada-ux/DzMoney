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
  const dailyTasksPath = require.resolve('../src/services/daily-system-task-service');
  const verificationPath = require.resolve('../src/services/task-verification-service');
  const walletPath = require.resolve('../src/services/wallet-service');
  const poolPath = require.resolve('../src/db/pool');
  const originalDailyTasks = require(dailyTasksPath);
  const originalVerification = require(verificationPath);
  const originalWallet = require(walletPath);
  const originalPool = require(poolPath);
  const calls = [];

  require.cache[dailyTasksPath].exports = {
    ...originalDailyTasks,
    getSystemTask: async () => ({ id: 11, config: { dailyPolicy: 'rolling_24h' } }),
    assertAvailable: async () => true,
    executeSystemTask: async args => {
      calls.push(args);
      return {
        attempt: { id: 42 },
        gate: { idempotency_key: 'gate-1' },
        duplicate: false
      };
    }
  };
  require.cache[verificationPath].exports = {
    ...originalVerification,
    startTaskVerificationAd: async args => ({
      gate: { idempotency_key: args.idempotencyKey },
      adEvent: { id: 7, external_ad_id: 'ad-7' },
      providerId: 'test-provider',
      duplicate: false
    })
  };
  require.cache[walletPath].exports = { ...originalWallet, createUser: async () => ({ id: 42 }) };
  require.cache[poolPath].exports = {
    ...originalPool,
    query: async text => text.includes('SELECT id FROM task_attempts')
      ? { rows: [{ id: 42 }], rowCount: 1 }
      : { rows: [], rowCount: 0 }
  };

  const { createDailyCheckinRouter } = require('../src/http/daily-checkin-routes');
  const app = express();
  app.use(express.json());
  app.use('/api/daily-checkin', createDailyCheckinRouter({ providerRegistry: {} }));
  const http = require('http');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  const request = (method, requestPath, body, initData) => new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/json' };
    if (initData) headers['X-Telegram-Init-Data'] = initData;
    const req = http.request({ hostname: '127.0.0.1', port, path: requestPath, method, headers }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const isJson = String(res.headers['content-type'] || '').includes('application/json');
        resolve({ status: res.statusCode, body: isJson && data ? JSON.parse(data) : null });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });

  assert.strictEqual((await request('GET', '/api/daily-checkin/status', null)).status, 401);
  const auth = buildInitData(123);
  const status = await request('GET', '/api/daily-checkin/status', null, auth);
  assert.strictEqual(status.status, 200);
  assert.strictEqual(status.body.status, 'pending');
  assert.strictEqual(status.body.attemptId, 42);

  assert.strictEqual((await request('POST', '/api/daily-checkin/claim', { idempotencyKey: 'claim-1' })).status, 401);
  const claim = await request('POST', '/api/daily-checkin/claim', { idempotencyKey: 'claim-1' }, auth);
  assert.strictEqual(claim.status, 200);
  assert.strictEqual(claim.body.adEvent.external_ad_id, 'ad-7');
  assert.strictEqual(claim.body.attemptId, 42);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].userId, 42);
  assert.strictEqual(calls[0].systemKey, 'daily_check_in');
  assert.strictEqual(calls[0].idempotencyKey, 'claim-1');
  assert.strictEqual((await request('POST', '/api/daily-checkin/verify', { adEventId: 7 }, auth)).status, 404);
  assert.strictEqual((await request('POST', '/api/daily-checkin/finalize', { claimIdempotencyKey: 'claim-1' }, auth)).status, 404);

  await new Promise(resolve => server.close(resolve));
  require.cache[dailyTasksPath].exports = originalDailyTasks;
  require.cache[verificationPath].exports = originalVerification;
  require.cache[walletPath].exports = originalWallet;
  require.cache[poolPath].exports = originalPool;
  console.log('daily-checkin HTTP boundary tests passed');
}

run().catch(error => { console.error(error); process.exit(1); });
