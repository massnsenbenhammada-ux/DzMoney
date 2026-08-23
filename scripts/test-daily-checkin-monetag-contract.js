const assert = require('assert');
const fs = require('fs');

const app = fs.readFileSync('public/app.js', 'utf8');
const adapter = fs.readFileSync('public/monetag-adapter-entry.js', 'utf8');
const start = app.indexOf('async function startDailyCheckinAd');
const end = app.indexOf('\n}\n\nasync function startDailyCheckinAdFlow', start);
assert.ok(start >= 0 && end > start, 'Daily Check-in Monetag function must exist');
const body = app.slice(start, end);

assert.match(body, /await\s+handler\(\{[\s\S]*?type:\s*['"]preload['"][\s\S]*?ymid[\s\S]*?requestVar:\s*['"]daily_checkin['"][\s\S]*?\}\)/, 'Daily Check-in must await Monetag preload with ymid and requestVar');
assert.match(body, /await\s+handler\(\{\s*ymid\s*,\s*requestVar:\s*['"]daily_checkin['"]\s*\}\)/, 'Daily Check-in must show the same ymid with requestVar');
assert.match(body, /type:\s*['"]preload['"]/, 'Daily Check-in must preload the Rewarded Interstitial before showing it');
assert.ok(!body.includes("type: 'end'"), 'Daily Check-in must not use unsupported end mode for Rewarded Interstitial');
assert.ok(!body.includes('type: "end"'), 'Daily Check-in must not use unsupported end mode for Rewarded Interstitial');

assert.match(adapter, /yoszi\.com\/sdk\.js/, 'Monetag adapter must load the official SDK host directly');
assert.match(adapter, /data-zone/, 'Monetag adapter must provide the main zone to the SDK script');
assert.match(adapter, /data-sdk/, 'Monetag adapter must provide the SDK handler name');
assert.ok(!adapter.includes("from 'monetag-tg-sdk'"), 'Monetag adapter must not depend on the broken npm loader path');

console.log('DAILY CHECK-IN MONETAG CONTRACT: PASS');
