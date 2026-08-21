const assert = require('assert');
const express = require('express');
const { createAdminProviderRouter } = require('../src/http/admin-provider-routes');

async function run() {
  const original = require('../src/services/admin-provider-config-service');
  const calls = [];
  const servicePath = require.resolve('../src/services/admin-provider-config-service');
  require.cache[servicePath].exports = {
    ...original,
    loadProviderConfigurations: async () => [{ providerId: 'test-provider', enabled: true, priority: 1, contexts: ['task'], timeoutMs: 5000 }],
    saveProviderConfiguration: async args => {
      calls.push(args);
      return args.configurations;
    }
  };

  const app = express();
  app.use(express.json());
  const router = createAdminProviderRouter({ listRegistered: () => ['test-provider'] });
  app.use((req, _res, next) => { req.telegramUser = { id: 123 }; next(); });
  app.use('/api/admin/ad-providers', router);

  const http = require('http');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  const request = (method, path, body) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers: { 'content-type': 'application/json' } }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });

  const get = await request('GET', '/api/admin/ad-providers');
  assert.strictEqual(get.status, 200);
  assert.strictEqual(get.body.providers[0].providerId, 'test-provider');

  const put = await request('PUT', '/api/admin/ad-providers', {
    configurations: [{ providerId: 'test-provider', enabled: true, priority: 1, contexts: ['task'], timeoutMs: 5000 }]
  });
  assert.strictEqual(put.status, 200);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].actorTelegramUserId, '123');
  assert.deepStrictEqual(calls[0].registeredProviderIds, ['test-provider']);

  const invalid = await request('PUT', '/api/admin/ad-providers', { configurations: [{ providerId: 'unknown', contexts: ['task'] }] });
  assert.notStrictEqual(invalid.status, 500);

  await new Promise(resolve => server.close(resolve));
  console.log('admin-provider HTTP boundary tests passed');
}

run().catch(error => { console.error(error); process.exit(1); });
