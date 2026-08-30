const assert = require('assert');
const fs = require('fs');

const app = fs.readFileSync('public/app.js', 'utf8');
const creator = fs.readFileSync('public/creator-task.js', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');

assert.match(app, /function taskActionLabel\(task\)/);
assert.match(app, /systemKey === 'view_ads'/);
assert.match(app, /startDailyAdvertisementFlow\(button\)/);
assert.match(app, /\/api\/daily-tasks\/execute/);
assert.match(app, /externalAdId/);
assert.match(app, /\/api\/daily-tasks\/advertisement\/finalize/);
assert.match(app, /DAILY_AD_FINALIZE_POLL_MS/);
assert.match(app, /await wait\(DAILY_AD_FINALIZE_POLL_MS\)/);

assert.match(creator, /function setCreatorPanelVisible\(visible\)/);
assert.match(creator, /data-task-mode/);
assert.match(creator, /data-task-category/);
assert.match(creator, /data-task-back/);

assert.match(server, /CLIENT_AD_CONTEXTS = \['task', 'daily_checkin', 'verification'\]/);
assert.match(server, /clientAdConfig\(\)/);

console.log('RUNTIME_TASK_UI_CONTRACT: PASS');
console.log('WATCH_TASK_BINDING: PASS');
console.log('CREATOR_CATEGORY_SCOPE: PASS');
console.log('TASK_AD_PROVIDER_CLIENT_CONTEXT: PASS');
