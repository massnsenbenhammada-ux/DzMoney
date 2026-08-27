'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimit, clearRateLimitBuckets } = require('../src/http/rate-limit');

test('rate limiter keys authenticated requests by Telegram user and returns 429 after the limit', () => {
  clearRateLimitBuckets();
  const middleware = createRateLimit({ windowMs: 60_000, max: 1 });
  const responses = [];
  const makeResponse = () => ({
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
  });

  const first = { telegramUser: { id: 123 }, ip: '10.0.0.1' };
  middleware(first, makeResponse(), error => responses.push(error || null));
  middleware(first, makeResponse(), error => responses.push(error || null));

  assert.equal(responses.length, 2);
  assert.equal(responses[0], null);
  assert.equal(responses[1].statusCode, 429);
  clearRateLimitBuckets();
});

test('rate limiter isolates different authenticated users sharing an IP', () => {
  clearRateLimitBuckets();
  const middleware = createRateLimit({ windowMs: 60_000, max: 1 });
  const responses = [];
  const response = { setHeader() {} };
  middleware({ telegramUser: { id: 1 }, ip: '10.0.0.1' }, response, error => responses.push(error || null));
  middleware({ telegramUser: { id: 2 }, ip: '10.0.0.1' }, response, error => responses.push(error || null));
  assert.deepEqual(responses, [null, null]);
  clearRateLimitBuckets();
});
