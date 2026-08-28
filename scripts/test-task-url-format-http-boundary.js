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
  const wallet = { createUser: async args => ({ id: 42, ...args }) };
  const verification = {
    finalizeTaskVerification: async args => {
      calls.push(args);
      return { status: 'verified', rewarded: true, duplicate: false };
    }
  };
  const app = express();
  app.use(express.json());
  app.use('/api/tasks', createTaskRouter({ wallet, verification }));
  const http = require('http');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const request = (body, initData) => new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/json' };
    if (initData) headers['X-Telegram-Init-Data'] = initData;
    const req = http.request({ hostname: '127.0.0.1', port, path: '/api/tasks/url-format', method: 'POST', headers }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });

  assert.strictEqual((await request({ attemptId: 1, userUrl: 'https://t.me/MBuxBot/app?startapp=r_8654896543' })).status, 401);
  const auth = buildInitData(123);
  const result = await request({ attemptId: 1, userUrl: 'https://t.me/MBuxBot/app?startapp=r_8654896543' }, auth);
  assert.strictEqual(result.status, 200);
  assert.deepStrictEqual(result.body, { ok: true, status: 'verified', rewarded: true, duplicate: false });
  assert.deepStrictEqual(calls, [{ attemptId: 1, idempotencyKey: 'task:1', userSubmittedUrl: 'https://t.me/MBuxBot/app?startapp=r_8654896543' }]);

  const missingUrl = await request({ attemptId: 1 }, auth);
  assert.strictEqual(missingUrl.status, 400);
  const unknownField = await request({ attemptId: 1, userUrl: 'https://t.me/MBuxBot/app?startapp=r_8654896543', extra: true }, auth);
  assert.strictEqual(unknownField.status, 400);
  await new Promise(resolve => server.close(resolve));
  console.log('task URL-format HTTP boundary tests passed');
}

run().catch(error => { console.error(error); process.exit(1); });
