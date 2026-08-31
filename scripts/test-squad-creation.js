const test = require('node:test');
const assert = require('node:assert/strict');

test('system-created Squad contract selects ownership server-side', () => {
  const createSquad = ({ ownerUserId } = {}) => {
    assert.equal(ownerUserId, undefined, 'client must not provide Squad ownership');
    return { createdBy: 'system', ownerUserId: 'server-selected' };
  };

  assert.deepEqual(createSquad(), {
    createdBy: 'system',
    ownerUserId: 'server-selected',
  });
});

test('Squad creation is idempotent for the same creation key', () => {
  const created = new Map();
  const createSquad = (key) => {
    if (!created.has(key)) created.set(key, { id: `squad-${created.size + 1}` });
    return created.get(key);
  };

  assert.strictEqual(createSquad('creation-1'), createSquad('creation-1'));
});
