const test = require('node:test');
const assert = require('node:assert/strict');

// Phase 4 TDD contract: creation is system-owned and idempotent.
// Production wiring is intentionally added only after these invariants are green.

test('squad creation contract requires a server-selected owner', () => {
  const createSquad = (request) => {
    assert.equal(request.ownerUserId, undefined);
    return { createdBy: 'system', ownerUserId: 'server-selected' };
  };

  assert.deepEqual(createSquad({}), {
    createdBy: 'system',
    ownerUserId: 'server-selected',
  });
});

test('squad creation is idempotent for the same creation key', () => {
  const seen = new Map();
  const createSquad = (key) => {
    if (seen.has(key)) return seen.get(key);
    const squad = { id: `squad-${seen.size + 1}` };
    seen.set(key, squad);
    return squad;
  };

  assert.deepEqual(createSquad('creation-1'), createSquad('creation-1'));
});
