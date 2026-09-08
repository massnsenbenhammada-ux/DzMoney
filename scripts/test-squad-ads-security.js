'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const taskRoutes = fs.readFileSync(path.join(root, 'src/http/task-routes.js'), 'utf8');
const dailyRoutes = fs.readFileSync(path.join(root, 'src/http/daily-system-task-routes.js'), 'utf8');
const correlation = fs.readFileSync(path.join(root, 'src/services/adsgram-correlation-service.js'), 'utf8');
const taskAdvertisement = fs.readFileSync(path.join(root, 'src/services/task-advertisement-service.js'), 'utf8');
const squad = fs.readFileSync(path.join(root, 'public/squad.js'), 'utf8');

assert.match(taskRoutes, /router\.use\(auth\)/);
assert.match(taskRoutes, /sensitiveRateLimit/);
assert.match(taskAdvertisement, /providerRegistry/);
assert.doesNotMatch(taskAdvertisement, /req\.body\.providerId/);
assert.doesNotMatch(taskAdvertisement, /client-supplied.*provider/i);
assert.match(correlation, /a\.context IN \('task','squad'\)/);
assert.match(correlation, /u\.telegram_user_id=\$1/);
assert.match(correlation, /a\.metadata->>'adsgram_block_id'=\$2/);
assert.match(correlation, /client_started === true/);
assert.match(correlation, /client_completed === true/);
assert.match(correlation, /provider_confirmed === true/);
assert.match(dailyRoutes, /router\.use\(auth\)/);
assert.match(dailyRoutes, /sensitiveRateLimit/);
assert.match(squad, /response\.adEventId/);
assert.doesNotMatch(squad, /providerId:\s*['"]adsgram['"]/);

console.log('Squad Ads security gate: PASS');
