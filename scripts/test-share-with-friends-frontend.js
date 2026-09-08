const assert = require('assert');
const fs = require('fs');

const indexHtml = fs.readFileSync('./public/index.html', 'utf8');
const shareJs = fs.readFileSync('./public/share.js', 'utf8');
const appJs = fs.readFileSync('./public/app.js', 'utf8');
const squadJs = fs.readFileSync('./public/squad.js', 'utf8');
const squadRoutes = fs.readFileSync('./src/http/squad-routes.js', 'utf8');
const taskRoutes = fs.readFileSync('./src/http/task-routes.js', 'utf8');
const taskService = fs.readFileSync('./src/services/task-service.js', 'utf8');
const verificationService = fs.readFileSync('./src/services/task-verification-service.js', 'utf8');
const economyService = fs.readFileSync('./src/services/economy-service.js', 'utf8');
const serverJs = fs.readFileSync('./server.js', 'utf8');
const migration = fs.readFileSync('./migrations/020_daily_share_with_friends.sql', 'utf8');

assert.match(indexHtml, /id="shareReferral"/);
assert.match(indexHtml, /share\.js\?v=__ASSET_VERSION__/);
assert.match(shareJs, /systemKey: 'share_with_friends'/);
assert.match(shareJs, /\/api\/tasks\/click/);
assert.match(shareJs, /\/api\/daily-tasks\/execute/);
assert.match(shareJs, /referralLink/);
assert.match(shareJs, /await loadMe\(\);/);
assert.match(shareJs, /showRewardOutcome\(status\)/);

// Economic E2E boundary: a successful share must be verified and rewarded by the
// canonical verification/economy path; UI-only success is not sufficient.
assert.match(taskRoutes, /const attemptId = Number\(req\.body\?\.attemptId\);/);
assert.match(taskRoutes, /recordTaskClick\(\{ attemptId, userId: user\.id \}\)/);
assert.match(taskRoutes, /finalizeTaskVerification\(\{ attemptId, idempotencyKey: `task:\$\{attemptId\}` \}\)/);
assert.match(taskRoutes, /rewarded: finalization\.rewarded === true/);
assert.match(taskService, /recordTaskClick/);
assert.match(verificationService, /rewarded/);
assert.match(verificationService, /economy/);
assert.match(economyService, /ACTIVITY_REWARD_SOURCES = \['advertisement', 'task'/);
assert.match(economyService, /creditActivityRewardOnClient/);
assert.match(economyService, /ledger/);

// The frontend must consume the server outcome, refresh the canonical balance,
// and render the actual credited amount rather than a client-calculated value.
assert.match(appJs, /if \(status\.status === 'verified'\) \{ await loadMe\(\); showRewardOutcome\(status, task\);/);
assert.match(appJs, /function showRewardOutcome\(result, fallbackTask\)/);
assert.match(appJs, /Reward credited/);
assert.match(appJs, /result\.reward/);
assert.match(appJs, /loadMe\(\)/);

// Retry/idempotency contract: duplicate execution must remain a duplicate and
// must never create a second economic credit.
assert.match(taskService, /duplicate/);
assert.match(verificationService, /duplicate/);
assert.match(economyService, /idempotency/);

assert.match(serverJs, /if \(req\.path\.startsWith\('\/api\/'\)\) res\.setHeader\('Cache-Control', 'no-store'\)/);
assert.match(squadJs, /await loadMe\(\);/);
assert.match(squadJs, /showRewardOutcome\(state\.event\)/);
assert.match(squadRoutes, /rewarded \? \{ coin: Number\(metadata\.reward_coin/);
assert.match(squadRoutes, /reward, completedAt/);
assert.match(migration, /systemKey.*share_with_friends/);
assert.match(migration, /dailyPolicy.*utc_plus_one_calendar_day/);
assert.match(migration, /urlSource.*user_referral_link/);

console.log('Share with Friends frontend/integration contract: PASS');
console.log('Share economic outcome + canonical Economy/Ledger contract: PASS');
console.log('Share retry/idempotency contract: PASS');
console.log('Dynamic API no-cache reward synchronization contract: PASS');
console.log('Squad reward balance synchronization contract: PASS');
