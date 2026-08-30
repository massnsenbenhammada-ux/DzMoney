const fs = require('fs');
const vm = require('vm');

const app = fs.readFileSync('public/app.js', 'utf8');
const index = fs.readFileSync('public/index.html', 'utf8');
const creator = fs.readFileSync('public/creator-task.js', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
new vm.Script(app, { filename: 'public/app.js' });
new vm.Script(creator, { filename: 'public/creator-task.js' });

const dailyFlow = app.indexOf('async function startDailySystemTaskFlow(');
const verificationAd = app.indexOf('async function showTaskVerificationAd(');
const ensureSdk = app.indexOf('await ensureMonetagSdk();', verificationAd);
const executeCall = app.indexOf("api('/api/daily-tasks/execute'", dailyFlow);
const adCall = app.indexOf('await showTaskVerificationAd(result.verificationAdId);', dailyFlow);
const verifyCall = app.indexOf("api('/api/daily-tasks/verify'");
const statusCall = app.indexOf("api('/api/daily-checkin/status'");
const dailyAction = app.includes('daily-system-action');
const sdkBundle = index.includes('/monetag-adapter.bundle.js');
const homeDailyButton = index.includes('id="dailyBtn"');
const stylesheet = index.match(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']\/style\.css(?:\?[^"']*)?["']/i);
const creatorStylesheet = index.includes('/creator-task.css');
const staleDiagnosticsPage = index.includes('data-page="diagnostics"') || index.includes('dzmoney-diagnostics-container');
const staleDiagnosticsScript = server.includes('monetag-runtime-diagnostics.js') || index.includes('monetag-runtime-diagnostics.js');

const dailyFlowContract = dailyFlow >= 0 && verificationAd >= 0 && ensureSdk >= 0 && executeCall >= dailyFlow && adCall > executeCall && ensureSdk > verificationAd;
if (!dailyFlowContract || verifyCall < 0 || !dailyAction || !sdkBundle) throw new Error('Daily Check-in must use the canonical Daily Task flow and wait for the advertisement adapter');
if (statusCall < 0 || homeDailyButton) throw new Error('Daily Check-in must be exposed under Tasks and synchronize status server-side');
if (!stylesheet || !creatorStylesheet) throw new Error('Frontend must load the public stylesheets');
if (staleDiagnosticsPage || staleDiagnosticsScript) throw new Error('Temporary advertisement diagnostics must not remain in the production Mini App');

const creatorChecks = {
  creatorForm: index.includes('id="creatorTaskForm"'),
  creatorReviewBoundary: creator.includes('id="creatorReviewSubmit"') && creator.includes('async function submitCreatorTaskForReview') && creator.includes('/submit'),
  creatorCategories: creator.includes('data-creator-category') && creator.includes("['game','Game']") && creator.includes("['social','Social']") && creator.includes("['web','Web']") && creator.includes("['special','Special']"),
  creatorTarget: creator.includes('id="creatorTarget"') && creator.includes('pricing.minTarget'),
  creatorRewardsHidden: !creator.includes('rewardCoin:') && !creator.includes('rewardDzx:') && !creator.includes('rewardDzp:'),
  creatorAdSecondsHidden: !creator.includes('verificationAdSeconds'),
  creatorCompany: creator.includes('creatorTargetCompany'),
  creatorPricing: creator.includes('campaignPricing') && creator.includes('priceDZXPerExecution') && creator.includes('creator-pricing'),
  contractDrivenMethods: creator.includes('creatorTaskState.contract?.verificationMethods') && creator.includes('function verificationOptions()'),
  contractDrivenProvider: creator.includes('creatorTaskState.contract?.providerContracts'),
  contractDrivenEndpoint: creator.includes('/api/creator/tasks/contracts/'),
  idempotency: creator.includes('function creatorIdempotencyKey()') && creator.includes('idempotencyKey: creatorIdempotencyKey()'),
  targetOnlyCreation: creator.includes('target: Number(creatorEl(\'creatorTarget\').value)') && creator.includes('config: creatorConfig()'),
  noAutomaticReview: !creator.includes('const submit = await creatorApi'),
  noLegacyCompletionContract: !index.includes('server_verified') && !index.includes('open_link') && !index.includes('Method: Server Verified') && !creator.includes('server_verified') && !creator.includes('open_link') && !creator.includes('completion: { mode:') && !creator.includes('verification: { mode:')
};

const failedCreatorChecks = Object.entries(creatorChecks).filter(([, passed]) => !passed).map(([name]) => name);
if (failedCreatorChecks.length) throw new Error(`Creator UI contract failed: ${failedCreatorChecks.join(', ')}`);

const taskUxChecks = {
  cooldownIsolated: /systemKey\s*===\s*['"]daily_check_in['"]\s*&&\s*state\.dailyTaskCooldownUntil/.test(app),
  viewAdsRewardIncludesDzp: /\+1,000 COIN[^\n<]*\+1 DZX[^\n<]*\+1 DZP/.test(app),
  rewardPopup: /function showRewardPopup\s*\(/.test(app),
  rewardPopupUsesServerReward: /showRewardOutcome\(finalized/.test(app),
  rewardFailurePopup: /Reward not credited/.test(app),
  tasksCreatorTabs: index.includes('data-task-mode="tasks"') && index.includes('data-task-mode="creator"'),
  creatorFormInsideTasks: /data-page="tasks"[\s\S]*id="creatorTaskForm"/.test(index),
  tasksLeftTab: /data-task-mode="tasks"/.test(index),
  creatorRightTab: /data-task-mode="creator"/.test(index),
  creatorPanelBinding: creator.includes('function setCreatorPanelVisible') && creator.includes('data-task-mode'),
  watchPollingAvoidsRateLimit: /const DAILY_AD_FINALIZE_POLL_MS\s*=\s*3000/.test(app),
  watchUsesPollingInterval: /await wait\(DAILY_AD_FINALIZE_POLL_MS\)/.test(app),
  creatorHiddenInCategory: /function renderTaskCategory\([\s\S]*?window\.setCreatorPanelVisible\?\.\(false\)/.test(app),
  creatorVisibleOnCategoryList: /function renderTaskCategories\([\s\S]*?window\.setCreatorPanelVisible\?\.\(false\)/.test(app)
};
const failedTaskUxChecks = Object.entries(taskUxChecks).filter(([, passed]) => !passed).map(([name]) => name);
if (failedTaskUxChecks.length) throw new Error(`Task UX contract failed: ${failedTaskUxChecks.join(', ')}`);

console.log('FRONTEND_SYNTAX: PASS');
console.log('DAILY_ACTION_BINDING: PASS');
console.log('DAILY_CANONICAL_TASK_FLOW: PASS');
console.log('DAILY_VERIFICATION_STATUS_SYNC: PASS');
console.log('DAILY_HOME_ENTRY_REMOVED: PASS');
console.log('STYLESHEET_LINKS: PASS');
console.log('TEMPORARY_AD_DIAGNOSTICS_REMOVED: PASS');
console.log('CREATOR_MOBILE_FORM_SURFACE: PASS');
console.log('CREATOR_CONTRACT_BOUNDARY: PASS');
console.log('CREATOR_PRICING_AND_COMPANY_FIELDS: PASS');
console.log('CREATOR_IDEMPOTENCY_AND_REVIEW_BOUNDARY: PASS');
console.log('TASK_COOLDOWN_SCOPE: PASS');
console.log('TASK_REWARD_POPUP_CONTRACT: PASS');
console.log('TASK_CREATOR_TABS: PASS');
console.log('WATCH_POLLING_RATE_LIMIT_GUARD: PASS');
console.log('CREATOR_CATEGORY_SCOPE: PASS');
