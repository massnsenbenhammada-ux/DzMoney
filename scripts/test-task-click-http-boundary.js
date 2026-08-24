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
  const { createTaskRouter } = require('../src/http/task-routes');
  const calls = [];
  const wallet = {
    createUser: async args => ({ id: 42, ...args })
  };
  const tasks = {
    recordTaskClick: async args => {
      calls.push({ recordTaskClick: args });
      return { clicked: true, duplicate: false };
    }
  };
  const verification = {
    finalizeTaskVerification: async args => {
      calls.push({ finalizeTaskVerification: args });
      return { duplicate: false, status: 'verification_pending', rewarded: false, reason: 'advertisement_pending' };
    }
  };

  const app = express();
  app.use(express.json());
  app.use('/api/tasks', createTaskRouter({ wallet, tasks, verification, providerRegistry: {} }));
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

  assert.strictEqual((await request('POST', '/api/tasks/click', { attemptId: 'attempt-1' })).status, 401);

  const auth = buildInitData(123);
  const click = await request('POST', '/api/tasks/click', { attemptId: 'attempt-1' }, auth);
  assert.strictEqual(click.status, 200);
  assert.deepStrictEqual(click.body, {
    ok: true,
    clicked: true,
    duplicate: false,
    verification: { duplicate: false, status: 'verification_pending', rewarded: false, reason: 'advertisement_pending' }
  });
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0].recordTaskClick.attemptId, 'attempt-1');
  assert.strictEqual(calls[0].recordTaskClick.userId, 42);
  assert.deepStrictEqual(calls[1], { finalizeTaskVerification: { attemptId: 'attempt-1', idempotencyKey: 'task-reward:attempt-1' } });

  const missingAttempt = await request('POST', '/api/tasks/click', {}, auth);
  assert.strictEqual(missingAttempt.status, 400);

  await new Promise(resolve => server.close(resolve));
  console.log('task-click HTTP boundary tests passed');
}

run().catch(error => { console.error(error); process.exit(1); });