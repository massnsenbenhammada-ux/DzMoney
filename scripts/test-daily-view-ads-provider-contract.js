const assert = require('assert');
const fs = require('fs');
const path = require('path');

const taskAdvertisementSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'task-advertisement-service.js'), 'utf8');
const adEventSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'ad-event-service.js'), 'utf8');
const dailyTaskMigration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '030_daily_view_ads_monetag_provider.sql'), 'utf8');
const dailyTaskRoute = fs.readFileSync(path.join(__dirname, '..', 'src', 'http', 'daily-system-task-routes.js'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

assert.match(dailyTaskMigration, /systemKey.*view_ads/);
assert.match(dailyTaskMigration, /advertisementProvider.*monetag/);
assert.match(taskAdvertisementSource, /advertisementProvider/);
assert.match(taskAdvertisementSource, /startPinnedAdvertisementEventOnClient/);
assert.match(adEventSource, /startPinnedAdvertisementEventOnClient/);
assert.match(dailyTaskRoute, /systemKey === DAILY_SYSTEM_TASKS\.VIEW_ADS/);
assert.match(dailyTaskRoute, /providerId: result\.providerId/);
assert.match(appSource, /ensureMonetagSdk\(\)/);
assert.match(appSource, /requestVar: 'task'/);

console.log('Daily View Ads Monetag-only provider contract: PASS');
