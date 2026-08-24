'use strict';

const assert = require('assert');
const express = require('express');
const http = require('http');
const { createTaskRouter } = require('../src/http/task-routes');

function request(server, method, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port: server.address().port, method, path }, (res) => {
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
    listActiveTasks: async () => ([{
      id: 'task-1',
      type: 'web',
      title: 'Open link',
      completion: { mode: 'open_link', verificationRequired: true }
    }])
  }));

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  try {
    const response = await request(server, 'GET', '/api/tasks');
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
