const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'migrations/044_squad_ads_task.sql'), 'utf8');
const contextMigration = fs.readFileSync(path.join(root, 'migrations/046_squad_ad_event_context.sql'), 'utf8');
const squadRoutes = fs.readFileSync(path.join(root, 'src/http/squad-routes.js'), 'utf8');
const squadFrontend = fs.readFileSync(path.join(root, 'public/squad.js'), 'utf8');
const taskRoutes = fs.readFileSync(path.join(root, 'src/http/task-routes.js'), 'utf8');
const advertisementService = fs.readFileSync(path.join(root, 'src/services/task-advertisement-service.js'), 'utf8');
const monetagPostback = fs.readFileSync(path.join(root, 'src/http/monetag-postback-routes.js'), 'utf8');
const onclickaPostback = fs.readFileSync(path.join(root, 'src/http/onclicka-postback-routes.js'), 'utf8');

const squadAdsRoute = squadRoutes.slice(
  squadRoutes.indexOf("router.get('/ads'"),
  squadRoutes.indexOf("router.get('/membership-tiers'")
);

assert.match(migration, /systemKey":"squad_ads/);
assert.match(migration, /advertisementTarget":10/);
assert.match(migration, /advertisementContext":"squad/);
assert.match(migration, /placement":"squad/);
assert.doesNotMatch(migration, /"completion"/);

assert.match(contextMigration, /DROP CONSTRAINT IF EXISTS activity_ad_events_context_check/);
assert.match(contextMigration, /context IN \('task', 'reward_pool', 'daily_checkin', 'verification', 'gaming', 'squad'\)/);

assert.match(squadAdsRoute, /router\.get\('\/ads'/);
assert.doesNotMatch(squadAdsRoute, /router\.post\('\/ads\/start'/);
assert.match(squadAdsRoute, /context='squad'/);
assert.doesNotMatch(squadAdsRoute, /squad_memberships/);
assert.doesNotMatch(squadAdsRoute, /membership/);
assert.doesNotMatch(squadAdsRoute, /Valid Squad membership is required/);

assert.match(squadFrontend, /\/api\/tasks\/advertisement\/start/);
assert.doesNotMatch(squadFrontend, /\/api\/squad\/ads\/start/);
assert.match(squadFrontend, /requestVar: ['"]squad['"]/);
assert.match(taskRoutes, /tasksList\.filter\(task => task\.systemKey !== 'squad_ads'\)/);
assert.match(taskRoutes, /externalAdId: result\.adEvent\?\.external_ad_id/);

assert.match(advertisementService, /config\.advertisementContext \|\| 'task'/);
assert.match(advertisementService, /context IN \('task','squad'\)/);
assert.match(advertisementService, /squad_ads.*config\.systemKey/);
assert.doesNotMatch(advertisementService, /squad_memberships/);
assert.doesNotMatch(advertisementService, /Valid Squad membership is required/);

assert.match(monetagPostback, /taskAdvertisementService\.finalizeTaskAdvertisement/);
assert.match(onclickaPostback, /taskAdvertisementService\.finalizeTaskAdvertisement/);
assert.doesNotMatch(monetagPostback, /finalizeStandardAdvertisement/);
assert.doesNotMatch(onclickaPostback, /finalizeStandardAdvertisement/);

console.log('Squad Ads contract: PASS');
