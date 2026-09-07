'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const route = fs.readFileSync(path.join(__dirname, '..', 'src', 'http', 'admin-task-campaign-routes.js'), 'utf8');
const service = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'admin-task-campaign-service.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

assert.match(route, /adminAuth/);
assert.match(route, /createRateLimit/);
assert.match(route, /router\.get\('\/'/);
assert.match(route, /router\.post\('\/:taskId\/review'/);
assert.match(route, /approve/);
assert.match(route, /reject/);
assert.match(route, /reason/);
assert.match(route, /idempotencyKey/);
assert.match(service, /approveCreatorCampaign/);
assert.match(service, /rejectCreatorCampaign/);
assert.match(service, /admin_audit_log/);
assert.match(service, /idempotency_records/);
assert.match(service, /reason is required/);
assert.match(service, /actorTelegramUserId is required/);
assert.match(server, /createAdminTaskCampaignRouter/);
assert.match(server, /\/api\/admin\/tasks/);

console.log('Admin task/campaign contract: PASS');
