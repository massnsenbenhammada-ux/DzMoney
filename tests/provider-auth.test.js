'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { safeSecretEquals, getProviderSecret } = require('../src/http/provider-auth');

test('provider secret comparison is exact and rejects length mismatches', () => {
  assert.equal(safeSecretEquals('secret', 'secret'), true);
  assert.equal(safeSecretEquals('secret', 'Secret'), false);
  assert.equal(safeSecretEquals('secret', 'secretx'), false);
  assert.equal(safeSecretEquals('secret', ''), false);
});

test('provider authentication prefers the dedicated header over query parameters', () => {
  const req = {
    query: { token: 'query-secret' },
    get(name) { return name === 'x-provider-token' ? 'header-secret' : undefined; },
  };
  assert.equal(getProviderSecret(req), 'header-secret');
});
