const fs = require('fs');
const path = require('path');
const assert = require('assert');

function readApp() {
  return fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
}

function assertDailyCheckinStartsClaim(source) {
  assert.match(source, /daily-checkin\/claim/, 'Daily Check-in must start a server claim');
}

function assertDailyCheckinUsesMonetag(source) {
  assert.match(source, /show_11627577/, 'Daily Check-in must use the configured Monetag SDK');
}

function assertDailyCheckinPassesServerYmid(source) {
  assert.match(source, /ymid/, 'Daily Check-in must pass the server-generated YMID to Monetag');
}

function run() {
  const source = readApp();
  assertDailyCheckinStartsClaim(source);
  assertDailyCheckinUsesMonetag(source);
  assertDailyCheckinPassesServerYmid(source);
  console.log('Monetag Rewarded SDK contract: expected frontend integration is not implemented yet.');
}

run();
