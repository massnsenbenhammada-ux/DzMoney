const assert = require('assert');
const fs = require('fs');

async function main() {
  const app = fs.readFileSync('public/app.js', 'utf8');
  const adapter = fs.readFileSync('public/monetag-adapter-entry.js', 'utf8');
  const start = app.indexOf('async function startDailyCheckinAd');
  const end = app.indexOf('\n}\n\nasync function startDailyCheckinAdFlow', start);
  assert.ok(start >= 0 && end > start, 'Daily Check-in Monetag function must exist');
  const body = app.slice(start, end);

  assert.match(body, /await\s+handler\(\{[\s\S]*?type:\s*['"]preload['"][\s\S]*?ymid[\s\S]*?requestVar:\s*['"]daily_checkin['"][\s\S]*?\}\)/, 'Daily Check-in must await Monetag preload with ymid and requestVar');
  assert.match(body, /await\s+handler\(\{\s*ymid\s*,\s*requestVar:\s*['"]daily_checkin['"]\s*\}\)/, 'Daily Check-in must show the same ymid with requestVar');
  assert.match(body, /type:\s*['"]preload['"]/, 'Daily Check-in must preload the Rewarded Interstitial before showing it');

  const monetagSdk = await import('monetag-tg-sdk');
  assert.strictEqual(typeof monetagSdk.default, 'function', 'Official Monetag TMA package must expose createAdHandler as its default export');
  assert.match(adapter, /import\s+createAdHandler\s+from\s+['"]monetag-tg-sdk['"]/, 'Monetag adapter must use the official TMA package');
  assert.match(adapter, /createAdHandler\(['"]11627577['"]\)/, 'Monetag adapter must use the configured main zone');
  assert.match(adapter, /window\.DzMoneyMonetag/, 'Monetag adapter must expose the shared application adapter');

  console.log('DAILY CHECK-IN MONETAG CONTRACT: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
