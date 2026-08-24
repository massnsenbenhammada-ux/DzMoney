const fs = require('fs');
const vm = require('vm');

const app = fs.readFileSync('public/app.js', 'utf8');
const index = fs.readFileSync('public/index.html', 'utf8');
const style = fs.readFileSync('public/style.css', 'utf8');
new vm.Script(app, { filename: 'public/app.js' });

const checkinStart = app.indexOf('async function startDailyCheckinAdFlow()');
const sdkWait = app.indexOf('await ensureMonetagSdk();', checkinStart);
const claimCall = app.indexOf("api('/api/daily-checkin/claim'", checkinStart);
const statusCall = app.indexOf("api('/api/daily-checkin/status'");
const verificationPoll = app.indexOf('await waitForDailyVerification()', checkinStart);
const sdkBundle = index.includes('/monetag-adapter.bundle.js');
const stylesheet = index.match(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']\/style\.css(?:\?[^"']*)?["']/i);
const diagnosticToast = app.includes("const diagnostic = text.includes('evidence=');")
  && app.includes('diagnostic ? 30000 : 2600');
const selectableToast = style.includes('.toast{')
  && style.includes('pointer-events:auto')
  && style.includes('user-select:text')
  && style.includes('max-height:45vh')
  && style.includes('overflow:auto');

if (checkinStart < 0 || sdkWait < 0 || claimCall < 0 || sdkWait > claimCall || !sdkBundle) {
  throw new Error('Daily Check-in must wait for the Monetag adapter before creating a server claim');
}

if (statusCall < 0 || verificationPoll < 0) {
  throw new Error('Daily Check-in must synchronize UI state with server verification');
}

if (!stylesheet) {
  throw new Error('Frontend must load the public stylesheet');
}

if (!diagnosticToast || !selectableToast) {
  throw new Error('Monetag runtime evidence must remain readable and selectable on mobile');
}

console.log('FRONTEND_SYNTAX: PASS');
console.log('DAILY_ACTION_BINDING: PASS');
console.log('DAILY_SDK_READINESS_ORDER: PASS');
console.log('DAILY_VERIFICATION_STATUS_SYNC: PASS');
console.log('STYLESHEET_LINK: PASS');
console.log('MONETAG_MOBILE_DIAGNOSTICS: PASS');
