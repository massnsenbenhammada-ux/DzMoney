const assert = require('assert');
const crypto = require('crypto');
const express = require('express');
const { createAdminProviderRouter } = require('../src/http/admin-provider-routes');

process.env.BOT_TOKEN = 'test-bot-token';
process.env.ADMIN_TELEGRAM_USER_IDS = '123';

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
  const original = require('../src/services/admin-provider-config-service');
  const calls = [];
  const servicePath = require.resolve('../src/services/admin-provider-config-service');
  require.cache[servicePath].exports = {
    ...original,
    loadProviderConfigurations: async () => [{ providerId: 'test-provider', enabled: true, priority: 1, contexts: ['task'], timeoutMs: 5000 }],
    saveProviderConfiguration: async args => { calls.push(args); return args.configurations; }
  };

  const app = express();
  app.use(express.json());
  const router = createAdminProviderRouter({ registry: { listRegistered: () => ['test-provider'] } });
  app.use('/api/admin/ad-providers', router);

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

  assert.strictEqual((await request('GET', '/api/admin/ad-providers')).status, 401);
  assert.strictEqual((await request('GET', '/api/admin/ad-providers', null, buildInitData(999))).status, 403);

  const admin = buildInitData(123);
  const get = await request('GET', '/api/admin/ad-providers', null, admin);
  assert.strictEqual(get.status, 200);
  assert.strictEqual(get.body.providers[0].providerId, 'test-provider');

  const put = await request('PUT', '/api/admin/ad-providers', {
    configurations: [{ providerId: 'test-provider', enabled: true, priority: 1, contexts: ['task'], timeoutMs: 5000 }]
  }, admin);
  assert.strictEqual(put.status, 200);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].actorTelegramUserId, '123');
  assert.deepStrictEqual(calls[0].registeredProviderIds, ['test-provider']);

  const invalid = await request('PUT', '/api/admin/ad-providers', { configurations: [{ providerId: 'unknown', contexts: ['task'] }] }, admin);
  assert.notStrictEqual(invalid.status, 500);

  await new Promise(resolve => server.close(resolve));
  console.log('admin-provider HTTP boundary tests passed');
}

run().catch(error => { console.error(error); process.exit(1); });
