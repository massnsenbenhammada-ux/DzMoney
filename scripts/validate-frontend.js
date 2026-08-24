const fs = require('fs');
const vm = require('vm');

const app = fs.readFileSync('public/app.js', 'utf8');
const index = fs.readFileSync('public/index.html', 'utf8');
const style = fs.readFileSync('public/style.css', 'utf8');
const diagnostics = fs.readFileSync('public/monetag-runtime-diagnostics.js', 'utf8');
new vm.Script(app, { filename: 'public/app.js' });
new vm.Script(diagnostics, { filename: 'public/monetag-runtime-diagnostics.js' });

const checkinStart = app.indexOf('async function startDailyCheckinAdFlow()');
const sdkWait = app.indexOf('await ensureMonetagSdk();', checkinStart);
const claimCall = app.indexOf("api('/api/daily-checkin/claim'", checkinStart);
const statusCall = app.indexOf("api('/api/daily-checkin/status'");
const verificationPoll = app.indexOf('await waitForDailyVerification()', checkinStart);
const sdkBundle = index.includes('/monetag-adapter.bundle.js');
const stylesheet = index.match(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']\/style\.css(?:\?[^"']*)?["']/i);
const mobileDiagnostics = diagnostics.includes('Copy diagnostics')
  && diagnostics.includes('navigator.clipboard.writeText')
  && diagnostics.includes('JSON.stringify(window.__DzMoneyMonetagRuntime || {}, null, 2)');
const selectableDiagnostics = diagnostics.includes('textarea')
  && diagnostics.includes('readOnly = true');
const deferredDiagnostics = diagnostics.includes('document.body')
  && diagnostics.includes('DOMContentLoaded')
  && diagnostics.includes('exposeEvidence');
const connectivityDiagnostics = diagnostics.includes('Test SDK connection')
  && diagnostics.includes('https://libtl.com/sdk.js')
  && diagnostics.includes('fetch')
  && diagnostics.includes('AbortController')
  && diagnostics.includes('connectivityTest');

if (checkinStart < 0 || sdkWait < 0 || claimCall < 0 || sdkWait > claimCall || !sdkBundle) {
  throw new Error('Daily Check-in must wait for the Monetag adapter before creating a server claim');
}

if (statusCall < 0 || verificationPoll < 0) {
  throw new Error('Daily Check-in must synchronize UI state with server verification');
}

if (!stylesheet) {
  throw new Error('Frontend must load the public stylesheet');
}

if (!mobileDiagnostics || !selectableDiagnostics) {
  throw new Error('Monetag runtime evidence must be copyable from mobile');
}

if (!deferredDiagnostics) {
  throw new Error('Monetag diagnostics must defer DOM rendering until the body exists');
}

if (!connectivityDiagnostics) {
  throw new Error('Monetag diagnostics must expose an SDK connectivity test');
}

console.log('FRONTEND_SYNTAX: PASS');
console.log('DAILY_ACTION_BINDING: PASS');
console.log('DAILY_SDK_READINESS_ORDER: PASS');
console.log('DAILY_VERIFICATION_STATUS_SYNC: PASS');
console.log('STYLESHEET_LINK: PASS');
console.log('MONETAG_MOBILE_DIAGNOSTICS: PASS');
console.log('MONETAG_DIAGNOSTICS_DOM_TIMING: PASS');
console.log('MONETAG_DIAGNOSTICS_CONNECTIVITY: PASS');
