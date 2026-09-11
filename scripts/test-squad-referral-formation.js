const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function loadFormationService(membershipRows, squadId = 77) {
  const servicePath = require.resolve('../src/services/squad-membership-service.js');
  const originalLoad = Module._load;
  const queries = [];

  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (/INSERT INTO squads/i.test(sql)) {
        return { rowCount: 1, rows: [{ id: squadId, owner_user_id: 1 }] };
      }
      if (/INSERT INTO squad_memberships/i.test(sql)) {
        const createsTwo = /VALUES \(\$1, \$2, 'inactive'\), \(\$1, \$3, 'inactive'\)/i.test(sql);
        return {
          rowCount: createsTwo ? 2 : 1,
          rows: createsTwo
            ? [
                { id: 101, squad_id: squadId, user_id: 1, status: 'inactive' },
                { id: 102, squad_id: squadId, user_id: 2, status: 'inactive' }
              ]
            : [{ id: 102, squad_id: squadId, user_id: 2, status: 'inactive' }]
        };
      }
      if (/SELECT id FROM users WHERE id IN/i.test(sql)) {
        return { rowCount: 2, rows: [{ id: 1 }, { id: 2 }] };
      }
      if (/FROM squad_memberships/i.test(sql)) {
        return { rowCount: membershipRows.length, rows: membershipRows };
      }
      throw new Error(`Unexpected SQL in formation test: ${sql}`);
    }
  };

  Module._load = function load(request, parent, isMain) {
    if (request === '../db/pool') {
      return { query: async () => ({ rows: [], rowCount: 0 }), withTransaction: callback => callback(client) };
    }
    if (request === './economy-service') {
      return {
        DZP_DZX: 1,
        decimalToScaled: () => 1n,
        multiplyRatioScaled: () => 1n,
        multiplyScaled: () => 1n,
        scaledToDecimal: value => String(value),
        postEconomyTransactionOnClient: async () => ({ transaction: null })
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[servicePath];
  const service = require(servicePath);

  return {
    service,
    queries,
    restore() {
      Module._load = originalLoad;
      delete require.cache[servicePath];
    }
  };
}

test('Phase 2: first referral between two unassigned users creates one Squad and assigns referrer as owner', async () => {
  const harness = loadFormationService([]);
  try {
    const result = await harness.service.ensureReferralSquadFormation({ referrerUserId: 1, referredUserId: 2 });
    assert.equal(result.formed, true);
    assert.equal(result.ownerUserId, 1);
    assert.equal(result.squadId, 77);
    assert.equal(result.memberships.length, 2);
    const squadInsert = harness.queries.findLast(({ sql }) => /INSERT INTO squads/i.test(sql));
    const membershipInsert = harness.queries.findLast(({ sql }) => /INSERT INTO squad_memberships/i.test(sql));
    assert.ok(squadInsert, 'expected a Squad INSERT query');
    assert.ok(membershipInsert, 'expected a membership INSERT query');
    assert.match(squadInsert.sql, /owner_user_id/);
    assert.match(membershipInsert.sql, /'inactive'/);
  } finally {
    harness.restore();
  }
});

test('Phase 2: referred user joins referrer Squad when referrer already has one', async () => {
  const harness = loadFormationService([{ user_id: 1, squad_id: 55, status: 'inactive' }], 55);
  try {
    const result = await harness.service.ensureReferralSquadFormation({ referrerUserId: 1, referredUserId: 2 });
    assert.equal(result.joined, true);
    assert.equal(result.rejected, false);
    assert.equal(result.squadId, 55);
    assert.equal(harness.queries.some(({ sql }) => /INSERT INTO squads/i.test(sql)), false);
  } finally {
    harness.restore();
  }
});

test('Phase 2: defensive Case C rejects a referred user that already has a Squad while referrer has none', async () => {
  const harness = loadFormationService([{ user_id: 2, squad_id: 66, status: 'active' }]);
  try {
    const result = await harness.service.ensureReferralSquadFormation({ referrerUserId: 1, referredUserId: 2 });
    assert.equal(result.reason, 'referrer_without_squad_referred_with_squad');
    assert.equal(result.rejected, true);
    assert.equal(harness.queries.some(({ sql }) => /INSERT INTO squads|INSERT INTO squad_memberships/i.test(sql)), false);
  } finally {
    harness.restore();
  }
});

test('Phase 2: referral into the same existing Squad is idempotent no-op', async () => {
  const harness = loadFormationService([
    { user_id: 1, squad_id: 55, status: 'inactive' },
    { user_id: 2, squad_id: 55, status: 'active' }
  ], 55);
  try {
    const result = await harness.service.ensureReferralSquadFormation({ referrerUserId: 1, referredUserId: 2 });
    assert.equal(result.reason, 'already_same_squad');
    assert.equal(result.rejected, false);
    assert.equal(harness.queries.some(({ sql }) => /INSERT INTO squads|INSERT INTO squad_memberships/i.test(sql)), false);
  } finally {
    harness.restore();
  }
});

test('Phase 2: referral connecting two different Squads is a hard reject with no membership mutation', async () => {
  const harness = loadFormationService([
    { user_id: 1, squad_id: 55, status: 'active' },
    { user_id: 2, squad_id: 66, status: 'active' }
  ]);
  try {
    const result = await harness.service.ensureReferralSquadFormation({ referrerUserId: 1, referredUserId: 2 });
    assert.equal(result.reason, 'different_squads');
    assert.equal(result.rejected, true);
    assert.equal(harness.queries.some(({ sql }) => /INSERT INTO squads|INSERT INTO squad_memberships/i.test(sql)), false);
  } finally {
    harness.restore();
  }
});

test('Phase 2: /api/me performs formation synchronously after successful attribution', () => {
  const route = read('src/http/me-routes.js');
  const attributionIndex = route.indexOf('await referralService.createAttribution');
  const formationIndex = route.indexOf('await squadMembershipService.ensureReferralSquadFormation');
  assert.ok(attributionIndex >= 0);
  assert.ok(formationIndex > attributionIndex);
});

test('Phase 2: formation uses only bounded database work and no external or background mechanism', () => {
  const service = read('src/services/squad-membership-service.js');
  assert.doesNotMatch(service, /fetch\(|axios|https\.request|setTimeout|setInterval|queue|bull|agenda/i);
  assert.match(service, /SELECT id FROM users WHERE id IN/);
  assert.match(service, /FOR UPDATE/);
});
