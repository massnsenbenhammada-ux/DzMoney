const assert = require('assert');
const fs = require('fs');

const app = fs.readFileSync('public/app.js', 'utf8');
const start = app.indexOf('async function startDailyCheckinAd');
const body = app.slice(start, app.indexOf('\n}\n\nasync function startDailyCheckinAdFlow', start));

assert.ok(body.includes("ymid, requestVar: 'daily_checkin'"), 'Daily Check-in must pass ymid and requestVar to Monetag');
assert.ok(body.includes("type: 'preload'"), 'Daily Check-in must preload the Rewarded Interstitial before showing it');
assert.ok(body.includes("await handler({ type: 'preload'"), 'Daily Check-in must await Monetag preload');
assert.ok(body.includes("await handler({ ymid, requestVar: 'daily_checkin' })"), 'Daily Check-in must show the same preloaded ymid');
assert.ok(!body.includes("type: 'end'"), 'Daily Check-in must not use unsupported end mode for Rewarded Interstitial');
assert.ok(!body.includes('type: "end"'), 'Daily Check-in must not use unsupported end mode for Rewarded Interstitial');

console.log('DAILY CHECK-IN MONETAG CONTRACT: PASS');
