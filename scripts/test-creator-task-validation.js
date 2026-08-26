'use strict';

const assert = require('node:assert/strict');
const { createStrictObjectValidator } = require('../src/http/input-validation');

const isNonEmptyString = value => typeof value === 'string' && value.trim().length > 0;
const isTaskType = value => value === 'social' || value === 'visit' || value === 'custom';
const isHttpUrl = value => {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const validateCreateTask = createStrictObjectValidator({
  taskType: isTaskType,
  title: isNonEmptyString,
  description: value => value === undefined || typeof value === 'string',
  target: isNonEmptyString,
  idempotencyKey: isNonEmptyString,
  config: value => value === undefined || (value !== null && typeof value === 'object' && !Array.isArray(value)),
});

const validInput = {
  taskType: 'visit',
  title: 'Visit site',
  description: 'Open the website',
  target: 'https://example.com',
  idempotencyKey: 'creator-test-1',
  config: { completion: { url: 'https://example.com' } },
};

validateCreateTask(validInput);

assert.throws(() => validateCreateTask({ ...validInput, unknown: true }), /Unexpected field/);
assert.throws(() => validateCreateTask({ ...validInput, title: '' }), /Invalid field: title/);
assert.throws(() => validateCreateTask({ ...validInput, taskType: 'invalid' }), /Invalid field: taskType/);
assert.throws(() => validateCreateTask({ ...validInput, idempotencyKey: '' }), /Invalid field: idempotencyKey/);
assert.throws(() => validateCreateTask({ ...validInput, config: [] }), /Invalid field: config/);
assert.equal(isHttpUrl(validInput.config.completion.url), true);

console.log('creator task validation contract: PASS');
