const assert = require('assert');
const fs = require('fs');

async function main() {
  const app = fs.readFileSync('public/app.js', 'utf8');
  const adapter = fs.readFileSync('public/monetag-adapter-entry.js', 'utf8');
  const index = fs.readFileSync('public/index.html', 'utf8');
  const server = fs.readFileSync('server.js', 'utf8');

  const start = app.indexOf('async function showTaskVerificationAd');
  const end = app.indexOf('\n}\nasync function finalizeDailySystemTask', start);
  assert.ok(start >= 0 && end > start, 'Daily Check-in must use the canonical task verification ad function');
  const body = app.slice(start, end);

  assert.match(body, /async function showTaskVerificationAd\(ymid\)/, 'Canonical task verification ad function must accept the verification advertisement id');
  assert.match(body, /const handler = await ensureMonetagSdk\(\)/, 'Canonical verification ad must await the Monetag SDK adapter before showing an ad');
  assert.match(body, /await\s+handler\(\{\s*type:\s*['"]preload['"][\s\S]*?ymid[\s\S]*?requestVar:\s*['"]verification['"][\s\S]*?\}\)/, 'Canonical verification ad must await Monetag preload with the verification requestVar');
  assert.match(body, /await\s+handler\(\{\s*ymid\s*,\s*requestVar:\s*['"]verification['"]\s*\}\)/, 'Canonical verification ad must show the same ymid with the verification requestVar');

  const dailyFlowStart = app.indexOf('async function startDailySystemTaskFlow');
  const dailyFlowEnd = app.indexOf('\n}\nfunction setDailyTaskButton', dailyFlowStart);
  assert.ok(dailyFlowStart >= 0 && dailyFlowEnd > dailyFlowStart, 'Canonical Daily System Task flow must exist');
  const dailyFlow = app.slice(dailyFlowStart, dailyFlowEnd);
  assert.match(dailyFlow, /await\s+showTaskVerificationAd\(result\.verificationAdId\)/, 'Daily Check-in must pass the server-issued verification advertisement id to the canonical verification ad flow');

  assert.match(index, /__MONETAG_SCRIPTS__/, 'HTML must keep Monetag SDK loading behind the server-side provider selection boundary');
  assert.match(server, /function monetagScriptsForClient\(\)/, 'Server must own Monetag SDK selection');
  assert.match(server, /provider\?\.id === ['"]monetag['"]/, 'Server must load Monetag only when Monetag is selected');
  assert.match(server, /11627577/, 'Server must load the configured Monetag zone 11627577');
  assert.match(server, /show_11627577/, 'Server must load the configured Monetag handler show_11627577');
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
