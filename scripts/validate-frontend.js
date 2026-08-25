const fs = require('fs');
const vm = require('vm');

const app = fs.readFileSync('public/app.js', 'utf8');
const index = fs.readFileSync('public/index.html', 'utf8');
const style = fs.readFileSync('public/style.css', 'utf8');
const creator = fs.readFileSync('public/creator-task.js', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
new vm.Script(app, { filename: 'public/app.js' });
new vm.Script(creator, { filename: 'public/creator-task.js' });

const checkinStart = app.indexOf('async function startDailyCheckinAdFlow()');
const sdkWait = app.indexOf('await ensureMonetagSdk();', checkinStart);
const claimCall = app.indexOf("api('/api/daily-checkin/claim'", checkinStart);
const statusCall = app.indexOf("api('/api/daily-checkin/status'");
const verificationPoll = app.indexOf('await waitForDailyVerification()', checkinStart);
const sdkBundle = index.includes('/monetag-adapter.bundle.js');
const stylesheet = index.match(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']\/style\.css(?:\?[^"']*)?["']/i);
const staleDiagnosticsPage = index.includes('data-page="diagnostics"') || index.includes('dzmoney-diagnostics-container');
const staleDiagnosticsScript = server.includes('monetag-runtime-diagnostics.js') || index.includes('monetag-runtime-diagnostics.js');

if (checkinStart < 0 || sdkWait < 0 || claimCall < 0 || sdkWait > claimCall || !sdkBundle) {
  throw new Error('Daily Check-in must wait for the Monetag adapter before creating a server claim');
}

if (statusCall < 0 || verificationPoll < 0) {
  throw new Error('Daily Check-in must synchronize UI state with server verification');
}

if (!stylesheet) {
  throw new Error('Frontend must load the public stylesheet');
}

if (staleDiagnosticsPage || staleDiagnosticsScript) {
  throw new Error('Temporary advertisement diagnostics must not remain in the production Mini App');
}

const creatorForm = index.includes('id="creatorTaskForm"');
const creatorReviewButton = index.includes('id="creatorReviewSubmit"');
const stableCreatorKey = creator.includes('function creatorGetIdempotencyKey()') && creator.includes('idempotencyKey: creatorGetIdempotencyKey()');
const separateReviewBoundary = creator.includes('async function submitCreatorTaskForReview') && creator.includes('/submit');
const noAutomaticReview = !creator.includes('const submit = await creatorApi(`/api/creator/tasks/${encodeURIComponent(taskId)}/submit`');

if (!creatorForm || !creatorReviewButton || !stableCreatorKey || !separateReviewBoundary || !noAutomaticReview) {
  throw new Error('Creator UI must keep create idempotency stable and require explicit review submission');
}

console.log('FRONTEND_SYNTAX: PASS');
console.log('DAILY_ACTION_BINDING: PASS');
console.log('DAILY_SDK_READINESS_ORDER: PASS');
console.log('DAILY_VERIFICATION_STATUS_SYNC: PASS');
console.log('STYLESHEET_LINK: PASS');
console.log('TEMPORARY_AD_DIAGNOSTICS_REMOVED: PASS');
console.log('CREATOR_IDEMPOTENCY_AND_REVIEW_BOUNDARY: PASS');
