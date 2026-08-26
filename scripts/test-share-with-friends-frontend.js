const assert = require('assert');
const fs = require('fs');

const indexHtml = fs.readFileSync('./public/index.html', 'utf8');
const shareJs = fs.readFileSync('./public/share.js', 'utf8');
const migration = fs.readFileSync('./migrations/020_daily_share_with_friends.sql', 'utf8');

assert.match(indexHtml, /id="shareReferral"/);
assert.match(indexHtml, /share\.js\?v=__ASSET_VERSION__/);
assert.match(shareJs, /systemKey: 'share_with_friends'/);
assert.match(shareJs, /\/api\/tasks\/click/);
assert.match(shareJs, /\/api\/daily-tasks\/execute/);
assert.match(shareJs, /referralLink/);
assert.match(migration, /systemKey\\\":\\\"share_with_friends/);
assert.match(migration, /dailyPolicy\\\":\\\"utc_plus_one_calendar_day/);
assert.match(migration, /urlSource\\\":\\\"user_referral_link/);

console.log('Share with Friends frontend/integration contract: PASS');
