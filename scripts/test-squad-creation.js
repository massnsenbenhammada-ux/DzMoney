const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('automatic Squad provisioning service and bootstrap trigger are removed', () => {
  const meRoute = fs.readFileSync(path.join(__dirname, '../src/http/me-routes.js'), 'utf8');
  const provisioningServicePath = path.join(__dirname, '../src/services/squad-provisioning-service.js');

  assert.doesNotMatch(meRoute, /squad-provisioning-service/);
  assert.doesNotMatch(meRoute, /provisionSquadForUsers/);
  assert.equal(fs.existsSync(provisioningServicePath), false);
});

test('Squad read route does not contain automatic provisioning', () => {
  const squadRoute = fs.readFileSync(path.join(__dirname, '../src/http/squad-routes.js'), 'utf8');
  assert.doesNotMatch(squadRoute, /provisionSquadForUsers/);
  assert.doesNotMatch(squadRoute, /squad-provisioning-service/);
});

require('./test-squad-membership-invite.js');
