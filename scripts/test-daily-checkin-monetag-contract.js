const assert = require('assert');
const fs = require('fs');

async function main() {
  const app = fs.readFileSync('public/app.js', 'utf8');
  const adapter = fs.readFileSync('public/monetag-adapter-entry.js', 'utf8');
  const index = fs.readFileSync('public/index.html', 'utf8');
  const server = fs.readFileSync('server.js', 'utf8');
  const start = app.indexOf('async function startDailyCheckinAd');
  const end = app.indexOf('\n}\nasync function startDailyCheckinAdFlow', start);
  assert.ok(start >= 0 && end > start, 'Daily Check-in Monetag function must exist');
  const body = app.slice(start, end);

  assert.match(body, /await\s+handler\(\{[\s\S]*?type:\s*['"]preload['"][\s\S]*?ymid[\s\S]*?requestVar:\s*['"]daily_checkin['"][\s\S]*?\}\)/, 'Daily Check-in must await Monetag preload with ymid and requestVar');
  assert.match(body, /await\s+handler\(\{\s*ymid\s*,\s*requestVar:\s*['"]daily_checkin['"]\s*\}\)/, 'Daily Check-in must show the same ymid with requestVar');
  assert.match(body, /type:\s*['"]preload['"]/, 'Daily Check-in must preload the Rewarded Interstitial before showing it');

  assert.match(index, /__MONETAG_SCRIPTS__/, 'HTML must keep Monetag SDK loading behind the server-side provider selection boundary');
  assert.match(server, /function monetagScriptsForClient\(\)/, 'Server must own Monetag SDK selection');
  assert.match(server, /provider\?\.id === ['"]monetag['"]/, 'Server must load Monetag only when Monetag is selected');
  assert.ok(server.includes('data-zone=\\"11627577\\" data-sdk=\\"show_11627577\\"'), 'Server must load the configured Monetag SDK tag for zone 11627577');
  assert.doesNotMatch(adapter, /monetag-tg-sdk/, 'Monetag adapter must not dynamically load a second SDK copy');
  assert.match(adapter, /MONETAG_HANDLER_NAME\s*=\s*`show_\$\{MONETAG_ZONE_ID\}`/, 'Monetag adapter must derive the configured global SDK handler name from the zone');
  assert.match(adapter, /window\[MONETAG_HANDLER_NAME\]/, 'Monetag adapter must resolve the configured global SDK handler');
  assert.match(adapter, /window\.DzMoneyMonetag/, 'Monetag adapter must expose the shared application adapter');

  console.log('DAILY CHECK-IN MONETAG CONTRACT: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
