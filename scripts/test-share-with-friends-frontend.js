const assert = require('assert');
const fs = require('fs');

const indexHtml = fs.readFileSync('./public/index.html', 'utf8');
const shareJs = fs.readFileSync('./public/share.js', 'utf8');
const appJs = fs.readFileSync('./public/app.js', 'utf8');
const squadJs = fs.readFileSync('./public/squad.js', 'utf8');
const squadRoutes = fs.readFileSync('./src/http/squad-routes.js', 'utf8');
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
assert.match(appJs, /if \(status\.status === 'verified'\) \{ await loadMe\(\); showRewardOutcome\(status, task\);/);
assert.match(serverJs, /if \(req\.path\.startsWith\('\/api\/'\)\) res\.setHeader\('Cache-Control', 'no-store'\)/);
assert.match(squadJs, /await loadMe\(\);/);
assert.match(squadJs, /showRewardOutcome\(state\.event\)/);
assert.match(squadRoutes, /rewarded \? \{ coin: Number\(metadata\.reward_coin/);
assert.match(squadRoutes, /reward, completedAt/);
assert.match(migration, /systemKey.*share_with_friends/);
assert.match(migration, /dailyPolicy.*utc_plus_one_calendar_day/);
assert.match(migration, /urlSource.*user_referral_link/);

console.log('Share with Friends frontend/integration contract: PASS');
console.log('Dynamic API no-cache reward synchronization contract: PASS');
console.log('Squad reward balance synchronization contract: PASS');
