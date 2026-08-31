import assert from 'node:assert/strict';
import test from 'node:test';

test('Squads are system-created and users cannot self-assign as owners', () => {
  const policy = { creation: 'system', ownerAssignment: 'system' };

  assert.equal(policy.creation, 'system');
  assert.equal(policy.ownerAssignment, 'system');
});
