const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('Phase 1: automatic Squad provisioning service is removed and no runtime reference remains', () => {
  const servicePath = path.join(__dirname, '../src/services/squad-provisioning-service.js');
  assert.equal(fs.existsSync(servicePath), false);

  const meRoute = read('src/http/me-routes.js');
  assert.doesNotMatch(meRoute, /squad-provisioning-service/);
  assert.doesNotMatch(meRoute, /provisionSquadForUsers/);
  assert.doesNotMatch(meRoute, /withTransaction/);
});

test('Phase 1: /api/me bootstrap performs no Squad creation work even with ten or more unassigned users', async () => {
  const routePath = require.resolve('../src/http/me-routes.js');
  const originalLoad = Module._load;
  const queries = [];
  let registeredHandler;
  let walletCreateCalls = 0;

  Module._load = function load(request, parent, isMain) {
    if (request === 'express') {
      return {
        Router() {
          return {
            use() {},
            get(_path, handler) {
              registeredHandler = handler;
            }
          };
        }
      };
    }
    if (request === '../db/pool') {
      return {
        async query(sql, params) {
          queries.push({ sql, params });
          return { rows: [{ id: 1 }] };
        }
      };
    }
    if (request === '../services/wallet-service') {
      return {
        async createUser() {
          walletCreateCalls += 1;
          return {
            id: 1,
            telegram_user_id: 'telegram-1',
            username: 'test-user',
            first_name: 'Test',
            photo_url: null,
            referral_code: 'REF1'
          };
        },
        async getUserWallets() {
          return [];
        }
      };
    }
    if (request === '../services/referral-service') {
      return { async createAttribution() {} };
    }
    if (request === '../config/telegram') {
      return { buildReferralLink: code => `https://t.me/example?start=${code}` };
    }
    if (request === './telegram-auth') {
      return { telegramAuth: (_req, _res, next) => next() };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[routePath];
    require(routePath);
    assert.equal(typeof registeredHandler, 'function');

    const response = {};
    await registeredHandler(
      {
        telegramUser: {
          id: 'telegram-1',
          username: 'test-user',
          first_name: 'Test'
        },
        telegramStartParam: null
      },
      {
        json(payload) {
          Object.assign(response, payload);
        }
      }
    );

    assert.equal(walletCreateCalls, 1);
    assert.equal(response.ok, true);
    assert.equal(queries.some(({ sql }) => /squad_memberships|INSERT INTO squads|squad-provisioning/i.test(sql)), false);
  } finally {
    Module._load = originalLoad;
    delete require.cache[routePath];
  }
});

test('Squad read route does not contain the removed automatic provisioning hook', () => {
  const squadRoute = read('src/http/squad-routes.js');
  const meRoute = read('src/http/me-routes.js');
  assert.doesNotMatch(squadRoute, /provisionSquadForUsers/);
  assert.doesNotMatch(meRoute, /provisionSquadForUsers/);
});

require('./test-squad-membership-invite.js');
