const assert = require('assert');
const { isAdminTelegramUser } = require('../src/http/admin-auth');

assert.strictEqual(isAdminTelegramUser(null, ''), false);
assert.strictEqual(isAdminTelegramUser({ id: 123 }, ''), false);
assert.strictEqual(isAdminTelegramUser({ id: 123 }, '123'), true);
assert.strictEqual(isAdminTelegramUser({ id: 123 }, '456,123'), true);
assert.strictEqual(isAdminTelegramUser({ id: 123 }, '456'), false);
assert.strictEqual(isAdminTelegramUser({ id: 123 }, '123, 456'), true);
assert.strictEqual(isAdminTelegramUser({ id: 123 }, '1234'), false);
console.log('admin-auth tests passed');
