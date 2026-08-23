const assert = require('assert');
const fs = require('fs');

const app = fs.readFileSync('public/app.js', 'utf8');
const adapter = fs.readFileSync('public/monetag-adapter-entry.js', 'utf8');
const start = app.indexOf('async function startDailyCheckinAd');
const end = app.indexOf('\n}\n\nasync function startDailyCheckinAdFlow', start);
assert.ok(start >= 0 && end > start, 'Daily Check-in Monetag function must exist');
const body = app.slice(start, end);

assert.match(
  body,
  /await\s+handler\(\{[\s\S]*?type:\s*['"]preload['"][\s\S]*?ymid[\s\S]*?requestVar:\s*['"]daily_checkin['"][\s\S]*?\}\)/,
  'Daily Check-in must await Monetag preload with ymid and requestVar'
);
assert.match(
  body,
  /await\s+handler\(\{\s*ymid\s*,\s*requestVar:\s*['"]daily_checkin['"]\s*\}\)/,
  'Daily Check-in must show the same ymid with requestVar'
);
assert.match(body, /type:\s*['"]preload['"]/, 'Daily Check-in must preload the Rewarded Interstitial before showing it');
assert.ok(!body.includes("type: 'end'"), 'Daily Check-in must not use unsupported end mode for Rewarded Interstitial');
assert.ok(!body.includes('type: "end"'), 'Daily Check-in must not use unsupported end mode for Rewarded Interstitial');

// Contract-test the adapter's actual DOM assignments rather than requiring
// literal HTML attribute syntax in the source code.
assert.match(adapter, /const\s+MONETAG_ZONE_ID\s*=\s*['"]11627577['"]/, 'Monetag adapter must use the configured main zone');
assert.match(adapter, /const\s+HANDLER_NAME\s*=\s*`show_\$\{MONETAG_ZONE_ID\}`/, 'Monetag adapter must derive the SDK handler from the main zone');
assert.match(adapter, /const\s+SDK_URL\s*=\s*['"]\/\/yoszi\.com\/sdk\.js['"]/, 'Monetag adapter must load the official SDK host directly');
assert.match(adapter, /script\.src\s*=\s*SDK_URL/, 'Monetag adapter must load the SDK through the script element');
assert.match(adapter, /script\.dataset\.zone\s*=\s*MONETAG_ZONE_ID/, 'Monetag adapter must provide the main zone to the SDK script');
assert.match(adapter, /script\.dataset\.sdk\s*=\s*HANDLER_NAME/, 'Monetag adapter must provide the SDK handler name');
assert.match(adapter, /document\.head\.appendChild\(script\)/, 'Monetag adapter must append the SDK script to the document');
assert.match(adapter, /script\.addEventListener\(['"]load['"]/, 'Monetag adapter must handle SDK load completion');
assert.match(adapter, /script\.addEventListener\(['"]error['"]/, 'Monetag adapter must handle SDK load failure');
assert.match(adapter, /window\[HANDLER_NAME\]/, 'Monetag adapter must use the configured SDK handler');
assert.ok(!adapter.includes("from 'monetag-tg-sdk'"), 'Monetag adapter must not depend on the broken npm loader path');
assert.ok(!adapter.includes('from "monetag-tg-sdk"'), 'Monetag adapter must not depend on the broken npm loader path');

console.log('DAILY CHECK-IN MONETAG CONTRACT: PASS');
