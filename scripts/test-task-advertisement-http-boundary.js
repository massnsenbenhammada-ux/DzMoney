const assert = require('assert');
const http = require('http');
const express = require('express');
const { createTaskRouter } = require('../src/http/task-routes');

function request(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const payload = JSON.stringify(body || {});
      const req = http.request({ hostname: '127.0.0.1', port, path, method, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } }, res => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          server.close();
          let parsed = null;
          try { parsed = JSON.parse(data); } catch {}
          resolve({ status: res.statusCode, body: parsed });
        });
      });
      req.on('error', error => { server.close(); reject(error); });
      req.end(payload);
    });
  });
}

async function main() {
  const calls = [];
  const app = express();
  app.use(express.json());
  const tasks = {
    startTaskAdvertisement: async input => { calls.push(['start', input]); return { adEvent: { id: 1, context: 'task', verified: false }, providerId: 'test-task-ad', duplicate: false }; },
    finalizeTaskAdvertisement: async input => { calls.push(['finalize', input]); return { rewarded: true, duplicate: false }; }
  };
  const auth = (req, _res, next) => { req.telegramUser = { id: 12345, username: 'test-user' }; next(); };
  app.use('/api/tasks', createTaskRouter({ advertisement: tasks, auth, wallet: { createUser: async () => ({ id: 77 }) } }));
  app.use((error, _req, res, _next) => res.status(500).json({ ok: false, error: error.message }));

  const start = await request(app, 'POST', '/api/tasks/advertisement/start', { taskId: 42, idempotencyKey: 'task-ad-http-1' });
  assert.strictEqual(start.status, 200);
  assert.strictEqual(start.body.ok, true);
  assert.strictEqual(start.body.adEventId, 1);
  assert.strictEqual(start.body.providerId, 'test-task-ad');

  const clientVerify = await request(app, 'POST', '/api/tasks/advertisement/verify', { adEventId: 1, providerPayload: { providerReference: 'untrusted-client-input' } });
  assert.strictEqual(clientVerify.status, 404);

  const finalize = await request(app, 'POST', '/api/tasks/advertisement/finalize', { adEventId: 1 });
  assert.strictEqual(finalize.status, 200);
  assert.strictEqual(finalize.body.rewarded, true);

  assert.deepStrictEqual(calls.map(call => call[0]), ['start', 'finalize']);
  assert.strictEqual(calls[0][1].userId, 77);
  assert.strictEqual(calls[1][1].userId, 77);

  console.log('Task advertisement HTTP boundary invariants: PASS');
}

main().catch(error => {
  console.error('Task advertisement HTTP boundary invariants: FAIL');
  console.error(error);
  process.exit(1);
});
