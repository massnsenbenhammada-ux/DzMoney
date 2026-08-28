const fs = require('fs');
const vm = require('vm');

const app = fs.readFileSync('public/app.js', 'utf8');
const index = fs.readFileSync('public/index.html', 'utf8');
const style = fs.readFileSync('public/style.css', 'utf8');
const creator = fs.readFileSync('public/creator-task.js', 'utf8');
const creatorStyle = fs.readFileSync('public/creator-task.css', 'utf8');
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
const creatorStylesheet = index.includes('/creator-task.css');
const staleDiagnosticsPage = index.includes('data-page="diagnostics"') || index.includes('dzmoney-diagnostics-container');
const staleDiagnosticsScript = server.includes('monetag-runtime-diagnostics.js') || index.includes('monetag-runtime-diagnostics.js');

if (checkinStart < 0 || sdkWait < 0 || claimCall < 0 || sdkWait > claimCall || !sdkBundle) throw new Error('Daily Check-in must wait for the Monetag adapter before creating a server claim');
if (statusCall < 0 || verificationPoll < 0) throw new Error('Daily Check-in must synchronize UI state with server verification');
if (!stylesheet || !creatorStylesheet) throw new Error('Frontend must load the public stylesheets');
if (staleDiagnosticsPage || staleDiagnosticsScript) throw new Error('Temporary advertisement diagnostics must not remain in the production Mini App');

const creatorForm = index.includes('id="creatorTaskForm"');
const creatorReviewButton = index.includes('id="creatorReviewSubmit"');
const creatorTypes = index.includes('data-creator-category="game"') && index.includes('data-creator-category="social"') && index.includes('data-creator-category="web"') && index.includes('data-creator-category="special"');
const creatorTargetMinimum = index.includes('id="creatorTarget" type="number" min="1000"');
const creatorRewardsHidden = !index.includes('id="creatorRewardCoin"') && !index.includes('id="creatorRewardDzx"') && !index.includes('id="creatorRewardDzp"');
const creatorAdSecondsHidden = !index.includes('id="creatorVerificationAdSeconds"');
const creatorCompany = index.includes('id="creatorTargetCompany"');
const creatorPricing = index.includes('id="creatorReferencePrice"') && index.includes('id="creatorReferenceCampaign"') && index.includes('id="creatorCampaignCost"');
const canonicalGame = creator.includes("['url_format_match', 'URL Format Match'");
const canonicalSocial = creator.includes("['telegram_bot_api', 'Telegram Bot API'");
const canonicalWeb = creator.includes("if (taskType === 'web') return [['click_proof'");
const specialAdmin = creator.includes('Contact admin: @DzMoneyCustomer');
const gameConfig = creator.includes("method: 'url_format_match'");
const socialConfig = creator.includes("method: 'telegram_bot_api'") && creator.includes("provider: 'telegram_channel'");
const stableCreatorKey = creator.includes('function creatorIdempotencyKey()') && creator.includes('idempotencyKey: creatorIdempotencyKey()');
const separateReviewBoundary = creator.includes('async function submitCreatorTaskForReview') && creator.includes('/submit');
const noAutomaticReview = !creator.includes('const submit = await creatorApi(`/api/creator/tasks/${encodeURIComponent(taskId)}/submit`');
const creatorSendsOnlyTarget = creator.includes('target: Number(creatorEl(\'creatorTarget\').value)') && !creator.includes('rewardCoin:') && !creator.includes('rewardDzx:') && !creator.includes('rewardDzp:');
const serverVerifiedHasUrl = creator.includes('completion: { mode: creatorTaskState.verification ===');

if (!creatorForm || !creatorReviewButton || !creatorTypes || !creatorTargetMinimum || !creatorRewardsHidden || !creatorAdSecondsHidden || !creatorCompany || !creatorPricing || !canonicalGame || !canonicalSocial || !canonicalWeb || !specialAdmin || !gameConfig || !socialConfig || !stableCreatorKey || !separateReviewBoundary || !noAutomaticReview || !creatorSendsOnlyTarget || !serverVerifiedHasUrl || !creatorStyle.includes('.creator-pricing')) {
  throw new Error('Creator UI must match the canonical mobile campaign form and verification surface');
}

console.log('FRONTEND_SYNTAX: PASS');
console.log('DAILY_ACTION_BINDING: PASS');
console.log('DAILY_SDK_READINESS_ORDER: PASS');
console.log('DAILY_VERIFICATION_STATUS_SYNC: PASS');
console.log('STYLESHEET_LINKS: PASS');
console.log('TEMPORARY_AD_DIAGNOSTICS_REMOVED: PASS');
console.log('CREATOR_MOBILE_FORM_SURFACE: PASS');
console.log('CREATOR_CANONICAL_VERIFICATION_METHODS: PASS');
console.log('CREATOR_PRICING_AND_COMPANY_FIELDS: PASS');
console.log('CREATOR_IDEMPOTENCY_AND_REVIEW_BOUNDARY: PASS');
