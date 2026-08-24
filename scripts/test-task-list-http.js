'use strict';

const assert = require('assert');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { createTaskRouter } = require('../src/http/task-routes');

const BOT_TOKEN = '123456:TEST_TOKEN_FOR_TASK_LIST_HTTP';
process.env.BOT_TOKEN = BOT_TOKEN;

function buildInitData() {
  const user = JSON.stringify({ id: 10001, username: 'task_test', first_name: 'Task' });
  const authDate = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({ auth_date: String(authDate), user });
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

function request(server, method, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port: server.address().port, method, path, headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const app = express();
  app.use('/api/tasks', createTaskRouter({
    tasks: {
      listActiveTasks: async () => ([{
        id: 'task-1',
        type: 'web',
        title: 'Open link',
        completion: { mode: 'open_link', verificationRequired: true }
      }])
    }
  }));

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  try {
    const response = await request(server, 'GET', '/api/tasks', {
      'X-Telegram-Init-Data': buildInitData()
    });
    assert.strictEqual(response.status, 200);
    const payload = JSON.parse(response.body);
    assert.strictEqual(payload.success, true);
    assert.deepStrictEqual(payload.tasks, [{
      id: 'task-1',
      type: 'web',
      title: 'Open link',
      completion: { mode: 'open_link', verificationRequired: true }
    }]);
    console.log('test-task-list-http: PASS');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error('test-task-list-http: FAIL');
  console.error(error);
  process.exitCode = 1;
});
