const assert = require('assert');
const { createStrictObjectValidator } = require('../src/http/input-validation');

function run() {
  const validate = createStrictObjectValidator({
    title: value => typeof value === 'string' && value.trim().length > 0,
    target: value => Number.isInteger(value) && value >= 1000 && value % 1000 === 0,
    idempotencyKey: value => typeof value === 'string' && value.trim().length > 0,
    config: value => value && typeof value === 'object' && !Array.isArray(value)
  });

  const valid = validate({ title: 'Campaign', target: 1000, idempotencyKey: 'key-1', config: {} });
  assert.deepStrictEqual(valid, { title: 'Campaign', target: 1000, idempotencyKey: 'key-1', config: {} });

  assert.throws(() => validate({ title: 'Campaign', target: 1000, idempotencyKey: 'key-1', config: {}, unexpected: true }), /unexpected/);
  assert.throws(() => validate({ title: '', target: 1000, idempotencyKey: 'key-1', config: {} }), /title/);
  assert.throws(() => validate({ title: 'Campaign', target: 999, idempotencyKey: 'key-1', config: {} }), /target/);
  assert.throws(() => validate({ title: 'Campaign', target: 1000, idempotencyKey: '', config: {} }), /idempotencyKey/);

  console.log('Strict input validation contract: PASS');
}

run();
