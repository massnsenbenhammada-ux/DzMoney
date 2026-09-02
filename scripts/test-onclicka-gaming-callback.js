'use strict';

const assert = require('assert');
const express = require('express');
const { createOnclickaPostbackRouter } = require('../src/http/onclicka-postback-routes');

async function request(app, path) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const req = http.get({ hostname: '127.0.0.1', port, path }, res => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => server.close(() => resolve({ status: res.statusCode, body })));
      });
      req.on('error', error => server.close(() => reject(error)));
    });
    server.on('error', reject);
  });
}

async function testCallbackRequiresAuthentication() {
  const app = express();
  app.use('/api/ads/onclicka', createOnclickaPostbackRouter({
    providerRegistry: {},
    secret: 'test-secret'
  }));
  const response = await request(app, '/api/ads/onclicka?USERID=12345');
  assert.strictEqual(response.status, 401);
}

async function main() {
  await testCallbackRequiresAuthentication();
  console.log('OnClickA Gaming callback boundary: OK');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
