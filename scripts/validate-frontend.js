const fs = require('fs');
const vm = require('vm');

const app = fs.readFileSync('public/app.js', 'utf8');
const index = fs.readFileSync('public/index.html', 'utf8');
new vm.Script(app, { filename: 'public/app.js' });

const checkinStart = app.indexOf('async function startDailyCheckinAdFlow()');
const sdkWait = app.indexOf('await ensureMonetagSdk();', checkinStart);
const claimCall = app.indexOf("api('/api/daily-checkin/claim'", checkinStart);
const statusCall = app.indexOf("api('/api/daily-checkin/status'", checkinStart);
const verificationPoll = app.indexOf('waitForDailyVerification', checkinStart);
const sdkBundle = index.includes('/monetag-adapter.bundle.js');

if (checkinStart < 0 || sdkWait < 0 || claimCall < 0 || sdkWait > claimCall || !sdkBundle) {
  throw new Error('Daily Check-in must wait for the Monetag adapter before creating a server claim');
}

if (statusCall < 0 || verificationPoll < 0 || statusCall > verificationPoll) {
  throw new Error('Daily Check-in must synchronize UI state with server verification');
}

console.log('FRONTEND_SYNTAX: PASS');
console.log('DAILY_ACTION_BINDING: PASS');
console.log('DAILY_SDK_READINESS_ORDER: PASS');
console.log('DAILY_VERIFICATION_STATUS_SYNC: PASS');
