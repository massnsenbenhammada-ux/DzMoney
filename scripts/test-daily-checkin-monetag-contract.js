const assert = require('assert');
const fs = require('fs');

async function main() {
  const app = fs.readFileSync('public/app.js', 'utf8');
  const adapter = fs.readFileSync('public/monetag-adapter-entry.js', 'utf8');
  const index = fs.readFileSync('public/index.html', 'utf8');
  const start = app.indexOf('async function startDailyCheckinAd');
  const end = app.indexOf('\n}\n\nasync function startDailyCheckinAdFlow', start);
  assert.ok(start >= 0 && end > start, 'Daily Check-in Monetag function must exist');
  const body = app.slice(start, end);

  assert.match(body, /await\s+handler\(\{[\s\S]*?type:\s*['"]preload['"][\s\S]*?ymid[\s\S]*?requestVar:\s*['"]daily_checkin['"][\s\S]*?\}\)/, 'Daily Check-in must await Monetag preload with ymid and requestVar');
  assert.match(body, /await\s+handler\(\{\s*ymid\s*,\s*requestVar:\s*['"]daily_checkin['"]\s*\}\)/, 'Daily Check-in must show the same ymid with requestVar');
  assert.match(body, /type:\s*['"]preload['"]/, 'Daily Check-in must preload the Rewarded Interstitial before showing it');

  assert.match(index, /<script\s+src=["']https:\/\/yoszi\.com\/sdk\.js["']\s+data-zone=["']11627577["']\s+data-sdk=["']show_11627577["']\s*><\/script>/, 'HTML must load the official Monetag SDK tag for the configured zone');
  assert.doesNotMatch(adapter, /monetag-tg-sdk/, 'Monetag adapter must not dynamically load a second SDK copy');
  assert.match(adapter, /MONETAG_HANDLER_NAME\s*=\s*`show_\$\{MONETAG_ZONE_ID\}`/, 'Monetag adapter must derive the official global SDK handler name from the configured zone');
  assert.match(adapter, /window\[MONETAG_HANDLER_NAME\]/, 'Monetag adapter must resolve the official global SDK handler');
  assert.match(adapter, /window\.DzMoneyMonetag/, 'Monetag adapter must expose the shared application adapter');

  console.log('DAILY CHECK-IN MONETAG CONTRACT: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
