const fs = require('fs');
const vm = require('vm');

const app = fs.readFileSync('public/app.js', 'utf8');
new vm.Script(app, { filename: 'public/app.js' });

const checkinStart = app.indexOf('async function startDailyCheckinAd()');
const claimCall = app.indexOf("api('/api/daily-checkin/claim'", checkinStart);
const sdkCheck = app.indexOf("typeof window.show_11627577 !== 'function'", checkinStart);

if (checkinStart < 0 || claimCall < 0 || sdkCheck < 0 || sdkCheck > claimCall) {
  throw new Error('Daily Check-in must verify Monetag SDK readiness before creating a server claim');
}

console.log('FRONTEND_SYNTAX: PASS');
console.log('DAILY_ACTION_BINDING: PASS');
console.log('DAILY_SDK_READINESS_ORDER: PASS');
