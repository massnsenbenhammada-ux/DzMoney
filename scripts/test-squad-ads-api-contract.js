'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const {
  createDailySystemTaskRouter,
} = require('../src/http/daily-system-task-routes');

function request(server, method, path, body) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: address.port,
        method,
        path,
        headers: { 'content-type': 'application/json' },
      },
      (res) => {
        let text = '';
        res.on('data', (chunk) => {
          text += chunk;
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            body: text ? JSON.parse(text) : {},
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

async function main() {
  const calls = [];
  const app = express();
  app.use(express.json());
  const auth = (req, _res, next) => {
    req.telegramUser = { id: 987654321, username: 'api-test' };
    next();
  };
  const wallet = { createUser: async () => ({ id: 77 }) };
  const correlation = {
    markClientStarted: async (input) => {
      calls.push(['started', input]);
      return { started: true, duplicate: false };
    },
    markClientCompleted: async (input) => {
      calls.push(['completed', input]);
      return { ready: false, rewarded: false };
    },
  };
  const router = createDailySystemTaskRouter({
    auth,
    wallet,
    adsgram: correlation,
    tasks: {},
    verification: {},
    advertisement: {},
    providerRegistry: {},
    referralService: {},
  });
  router.stack = router.stack.filter(
    (layer) =>
      layer.route?.path === '/advertisement/client-started' ||
      layer.route?.path === '/advertisement/client-complete' ||
      !layer.route,
  );
  app.use('/api/daily-tasks', router);
  const server = app.listen(0);
  try {
    const invalid = await request(
      server,
      'POST',
      '/api/daily-tasks/advertisement/client-started',
      { adEventId: 0 },
    );
    assert.equal(invalid.status, 400);

    const unknown = await request(
      server,
      'POST',
      '/api/daily-tasks/advertisement/client-started',
      { adEventId: 9, unexpected: true },
    );
    assert.equal(unknown.status, 400);

    const arrayBody = await request(
      server,
      'POST',
      '/api/daily-tasks/advertisement/client-started',
      [9],
    );
    assert.equal(arrayBody.status, 400);

    const started = await request(
      server,
      'POST',
      '/api/daily-tasks/advertisement/client-started',
      { adEventId: 9 },
    );
    assert.equal(started.status, 200);
    assert.equal(started.body.started, true);

    const completed = await request(
      server,
      'POST',
      '/api/daily-tasks/advertisement/client-complete',
      { adEventId: 9 },
    );
    assert.equal(completed.status, 200);
    assert.deepEqual(calls, [
      ['started', { userId: 77, adEventId: 9 }],
      ['completed', { userId: 77, adEventId: 9 }],
    ]);

    console.log('Squad Ads API contract and edge cases: PASS');
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error('Squad Ads API contract and edge cases: FAIL');
  console.error(error);
  process.exit(1);
});
