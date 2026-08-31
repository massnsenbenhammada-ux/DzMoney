const test = require('node:test');
const assert = require('node:assert/strict');

const { provisionSquadForUsers } = require('../src/services/squad-provisioning-service');

test('provisions one Squad from the oldest ten unassigned users and assigns the oldest as owner', async () => {
  const calls = [];
  const db = { async transaction(work) { return work({ query: async (sql, params) => { calls.push({ sql, params }); return { rows: [{ squad_id: 1, owner_user_id: 10 }] }; } }); } };
  const result = await provisionSquadForUsers(db);
  assert.deepEqual(result, { squadId: 1, ownerUserId: 10 });
  assert.match(calls[0].sql, /ORDER BY created_at ASC, id ASC/);
  assert.match(calls[0].sql, /LIMIT 10/);
});

test('returns null when fewer than ten unassigned users exist', async () => {
  const db = { async transaction(work) { return work({ query: async () => ({ rows: [] }) }); } };
  assert.equal(await provisionSquadForUsers(db), null);
});
