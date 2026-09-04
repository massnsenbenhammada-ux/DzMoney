const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'migrations/044_squad_ads_task.sql'), 'utf8');
const squadRoutes = fs.readFileSync(path.join(root, 'src/http/squad-routes.js'), 'utf8');
const squadFrontend = fs.readFileSync(path.join(root, 'public/squad.js'), 'utf8');
const taskRoutes = fs.readFileSync(path.join(root, 'src/http/task-routes.js'), 'utf8');

assert.match(migration, /systemKey":"squad_ads/);
assert.match(migration, /advertisementTarget":10/);
assert.match(migration, /advertisementContext":"squad/);
assert.match(migration, /placement":"squad/);
assert.match(squadRoutes, /GET|router\.get\('\/ads'/);
assert.match(squadRoutes, /router\.post\('\/ads\/start'/);
assert.match(squadRoutes, /context: 'squad'/);
assert.match(squadRoutes, /metadata: \{ task_id: Number\(task\.id\) \}/);
assert.match(squadFrontend, /\/api\/squad\/ads/);
assert.doesNotMatch(squadFrontend, /verifiedAdTarget/);
assert.doesNotMatch(taskRoutes, /systemKey !== 'squad_ads'/);

console.log('Squad Ads contract: PASS');
