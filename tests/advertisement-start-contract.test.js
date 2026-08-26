const test = require('node:test');
const assert = require('node:assert/strict');
const { createTaskRouter } = require('../src/http/task-routes');

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

function createRequest(body) {
  return { body, telegramUser: { id: 12345 } };
}

async function invoke(router, req) {
  const layer = router.stack.find(item => item.route?.path === '/advertisement/start' && item.route.methods.post);
  assert.ok(layer, 'POST /advertisement/start route must exist');
  const res = createResponse();
  let error;
  const next = err => { error = err; };
  await layer.route.stack[0].handle(req, res, next);
  if (error) throw error;
  return res;
}

test('POST /advertisement/start rejects missing idempotencyKey', async () => {
  const router = createTaskRouter({ auth: (req, res, next) => next() });
  const res = await invoke(router, { ...createRequest({ taskId: 1 }), body: { taskId: 1 } });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { ok: false, error: 'idempotencyKey is required' });
});

test('POST /advertisement/start rejects unknown fields', async () => {
  const router = createTaskRouter({ auth: (req, res, next) => next() });
  const res = await invoke(router, { ...createRequest({ taskId: 1, idempotencyKey: 'key', unexpected: true }), body: { taskId: 1, idempotencyKey: 'key', unexpected: true } });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { ok: false, error: 'unknown request field' });
});

test('POST /advertisement/start rejects non-positive or non-integer taskId', async () => {
  const router = createTaskRouter({ auth: (req, res, next) => next() });
  for (const taskId of [0, -1, '1', 1.5]) {
    const res = await invoke(router, { ...createRequest({ taskId, idempotencyKey: 'key' }), body: { taskId, idempotencyKey: 'key' } });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { ok: false, error: 'taskId must be a positive integer' });
  }
});

test('POST /advertisement/start accepts a valid strict request and preserves response contract', async () => {
  const calls = [];
  const router = createTaskRouter({
    auth: (req, res, next) => next(),
    wallet: { createUser: async () => ({ id: 77 }) },
    advertisement: {
      startTaskAdvertisement: async args => { calls.push(args); return { adEvent: { id: 88 }, providerId: 'provider-a', duplicate: false }; }
    }
  });
  const res = await invoke(router, { ...createRequest({ taskId: 5, idempotencyKey: 'key-1' }), body: { taskId: 5, idempotencyKey: 'key-1' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, adEventId: 88, providerId: 'provider-a', duplicate: false });
  assert.deepEqual(calls[0], { userId: 77, taskId: 5, idempotencyKey: 'key-1', providerRegistry: undefined });
});
