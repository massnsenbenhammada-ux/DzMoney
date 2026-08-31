const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { provisionSquadForUsers } = require('../src/services/squad-provisioning-service');

function fakeDb(rows) {
  const calls = [];
  return {
    calls,
    async transaction(work) {
      return work({ query: async (sql, params) => {
        calls.push({ sql, params });
        if (/SELECT pg_advisory_xact_lock/.test(sql)) return { rows: [] };
        if (/FROM users/.test(sql)) return { rows };
        if (/INSERT INTO squads/.test(sql)) return { rows: [{ id: 1, owner_user_id: rows[0].id }] };
        return { rows: [] };
      } });
    }
  };
}

test('provisions a Squad from the oldest ten unassigned users and assigns the oldest as owner', async () => {
  const users = Array.from({ length: 10 }, (_, index) => ({ id: index + 10 }));
  const db = fakeDb(users);
  const result = await provisionSquadForUsers(db.transaction.bind(db));
  assert.deepEqual(result, { squadId: 1, ownerUserId: 10 });
  const selection = db.calls.find(call => /FROM users/.test(call.sql));
  assert.match(selection.sql, /ORDER BY u\.created_at ASC, u\.id ASC/);
  assert.match(selection.sql, /LIMIT 10/);
});

test('returns null when fewer than ten unassigned users exist', async () => {
  const db = fakeDb([{ id: 1 }]);
  assert.equal(await provisionSquadForUsers(db.transaction.bind(db)), null);
});

test('Squad read route does not provision and user bootstrap does', () => {
  const squadRoute = fs.readFileSync(path.join(__dirname, '../src/http/squad-routes.js'), 'utf8');
  const meRoute = fs.readFileSync(path.join(__dirname, '../src/http/me-routes.js'), 'utf8');
  assert.doesNotMatch(squadRoute, /provisionSquadForUsers/);
  assert.match(meRoute, /provisionSquadForUsers\(withTransaction\)/);
});

require('./test-squad-membership-invite.js');
