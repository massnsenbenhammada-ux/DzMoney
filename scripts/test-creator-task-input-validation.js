'use strict';

const assert = require('node:assert/strict');
const { createStrictObjectValidator } = require('../src/http/input-validation');

const isNonEmptyString = value => typeof value === 'string' && value.trim().length > 0;
const isTaskType = value => value === 'link' || value === 'telegram';
const isOptionalString = value => value === undefined || isNonEmptyString(value);
const isPositiveInteger = value => Number.isInteger(value) && value > 0;

const validateCreateTask = createStrictObjectValidator({
  taskType: isTaskType,
  title: isNonEmptyString,
  description: isOptionalString,
  target: isOptionalString,
  rewardCoin: isOptionalString,
  rewardDzx: isOptionalString,
  rewardDzp: isOptionalString,
  verificationAdSeconds: value => value === undefined || isPositiveInteger(value),
  idempotencyKey: isNonEmptyString,
  config: value => value === undefined || (value !== null && typeof value === 'object' && !Array.isArray(value)),
});

const validInput = {
  taskType: 'link',
  title: 'Join channel',
  description: 'Join the channel',
  target: 'https://t.me/example',
  rewardCoin: '100',
  rewardDzx: '1',
  rewardDzp: '1',
  verificationAdSeconds: 5,
  idempotencyKey: 'creator-test-1',
  config: { completion: { url: 'https://t.me/example' } },
};

validateCreateTask(validInput);
assert.throws(() => validateCreateTask({ ...validInput, title: '' }), /Invalid field: title/);
assert.throws(() => validateCreateTask({ ...validInput, taskType: 'invalid' }), /Invalid field: taskType/);
assert.throws(() => validateCreateTask({ ...validInput, idempotencyKey: '' }), /Invalid field: idempotencyKey/);
assert.throws(() => validateCreateTask({ ...validInput, unknownField: true }), /Unexpected field: unknownField/);
assert.throws(() => validateCreateTask({ ...validInput, verificationAdSeconds: 0 }), /Invalid field: verificationAdSeconds/);

console.log('Creator task input validation contract: PASS');
