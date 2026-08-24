const assert = require('assert');
const http = require('http');
const express = require('express');
const { createTaskRouter } = require('../src/http/task-routes');

async function request(port, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: '/api/tasks/execute', method: 'POST', headers: { 'content-type': 'application/json' } }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} }));
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

async function run() {
  const calls = [];
  const tasks = { async executeTask(input) { calls.push(input); return { attempt: { id: 41 }, gate: { id: 9 }, duplicate: false }; } };
  const wallet = { async createUser(input) { calls.push({ createUser: input }); return { id: 7 }; } };
  const auth = (req, _res, next) => { req.telegramUser = { id: 123, username: 'tester', first_name: 'Test' }; next(); };
  const app = express();
  app.use(express.json());
  app.use('/api/tasks', createTaskRouter({ wallet, tasks, auth }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const result = await request(server.address().port, { taskId: 12, idempotencyKey: 'exec-http-1', metadata: { source: 'ui' } });
    assert.strictEqual(result.status, 200);
    assert.deepStrictEqual(result.body, { ok: true, attemptId: 41, gateId: 9, duplicate: false });
    assert.deepStrictEqual(calls, [
      { createUser: { telegramUserId: '123', username: 'tester', firstName: 'Test', photoUrl: null } },
      { taskId: 12, userId: 7, idempotencyKey: 'exec-http-1', metadata: { source: 'ui' } }
    ]);
    console.log('Task execution HTTP boundary: PASS');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });