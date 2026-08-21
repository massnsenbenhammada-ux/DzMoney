const assert = require('assert');
const { isAdminTelegramUser } = require('../src/http/admin-auth');

function authorize(user, configuredAdmins) {
  return isAdminTelegramUser(user, configuredAdmins);
}

assert.strictEqual(authorize(null, '123'), false);
assert.strictEqual(authorize({ id: 999 }, '123'), false);
assert.strictEqual(authorize({ id: 123 }, '123'), true);
assert.strictEqual(authorize({ id: 123 }, '123,456'), true);

function validateProviderRequest(body, registeredProviderIds) {
  if (!body || typeof body !== 'object') return false;
  if (typeof body.providerId !== 'string' || !registeredProviderIds.includes(body.providerId)) return false;
  if (!Array.isArray(body.contexts) || body.contexts.length === 0) return false;
  if (body.contexts.some(context => !['task', 'daily_checkin', 'reward_claim', 'verification'].includes(context))) return false;
  if (body.priority !== undefined && (!Number.isInteger(body.priority) || body.priority < 0)) return false;
  if (body.timeoutMs !== undefined && (!Number.isInteger(body.timeoutMs) || body.timeoutMs <= 0)) return false;
  return true;
}

assert.strictEqual(validateProviderRequest({ providerId: 'adsgram', contexts: ['task'] }, ['adsgram']), true);
assert.strictEqual(validateProviderRequest({ providerId: 'unknown', contexts: ['task'] }, ['adsgram']), false);
assert.strictEqual(validateProviderRequest({ providerId: 'adsgram', contexts: ['invalid'] }, ['adsgram']), false);
assert.strictEqual(validateProviderRequest({ providerId: 'adsgram', contexts: ['task'], priority: -1 }, ['adsgram']), false);
assert.strictEqual(validateProviderRequest({ providerId: 'adsgram', contexts: ['task'], timeoutMs: 0 }, ['adsgram']), false);
assert.strictEqual(validateProviderRequest({ providerId: 'adsgram', contexts: ['task'], secret: 'must-not-be-executable-code' }, ['adsgram']), true);

console.log('admin-provider-api contract tests passed');
