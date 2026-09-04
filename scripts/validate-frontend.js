const fs = require('fs');
const vm = require('vm');

const app = fs.readFileSync('public/app.js', 'utf8');
const index = fs.readFileSync('public/index.html', 'utf8');
const creator = fs.readFileSync('public/creator-task.js', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
const gaming = fs.readFileSync('public/gaming.js', 'utf8');
const adClient = fs.readFileSync('public/ad-provider-client.js', 'utf8');
new vm.Script(app, { filename: 'public/app.js' });
new vm.Script(creator, { filename: 'public/creator-task.js' });
new vm.Script(gaming, { filename: 'public/gaming.js' });
new vm.Script(adClient, { filename: 'public/ad-provider-client.js' });

const dailyFlow = app.indexOf('async function startDailySystemTaskFlow(');
const verificationAd = app.indexOf('async function showTaskVerificationAd(');
const ensureSdk = app.indexOf('await ensureMonetagSdk();', verificationAd);
const executeCall = app.indexOf("api('/api/daily-tasks/execute'", dailyFlow);
const adCall = app.indexOf('await showTaskVerificationAd(result.verificationAdId);', dailyFlow);
const verifyCall = app.indexOf("api('/api/daily-tasks/verify'");
const statusCall = app.indexOf("api('/api/daily-checkin/status'");
const dailyAction = app.includes('daily-system-action');
const monetagEntry = index.includes('/monetag-adapter-entry.js?v=__ASSET_VERSION__');
const staleMonetagBundle = index.includes('/monetag-adapter.bundle.js');
const homeDailyButton = index.includes('id="dailyBtn"');
const stylesheet = index.match(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']\/style\.css(?:\?[^"']*)?["']/i);
const creatorStylesheet = index.includes('/creator-task.css');
const staleDiagnosticsPage = index.includes('data-page="diagnostics"') || index.includes('dzmoney-diagnostics-container');
const staleDiagnosticsScript = server.includes('monetag-runtime-diagnostics.js') || index.includes('monetag-runtime-diagnostics.js');

const dailyFlowContract = dailyFlow >= 0 && verificationAd >= 0 && ensureSdk >= 0 && executeCall >= dailyFlow && adCall > executeCall && ensureSdk > verificationAd;
if (!dailyFlowContract || verifyCall < 0 || !dailyAction || !monetagEntry || staleMonetagBundle) throw new Error('Daily Check-in must use the canonical Daily Task flow and the current advertisement adapter entry');
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

const renderTaskCategoryStart = app.indexOf('function renderTaskCategory(categoryKey)');
const renderTaskCategoryEnd = app.indexOf('\nfunction renderTasks()', renderTaskCategoryStart);
const renderTaskCategoryBody = renderTaskCategoryStart >= 0 && renderTaskCategoryEnd > renderTaskCategoryStart ? app.slice(renderTaskCategoryStart, renderTaskCategoryEnd) : '';
const categoryClick = app.indexOf("const category = event.target.closest('[data-task-category]')");
const categoryDailyRefresh = categoryClick >= 0 ? app.slice(categoryClick, categoryClick + 320) : '';

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
  watchPollingRateLimitGuard: /const DAILY_AD_FINALIZE_POLL_MS\s*=\s*3000/.test(app),
  watchUsesPollingInterval: /await wait\(DAILY_AD_FINALIZE_POLL_MS\)/.test(app),
  creatorHiddenInCategory: /function renderTaskCategory\([\s\S]*?creatorPanel\.hidden = true/.test(app),
  creatorHiddenOnCategoryList: /function renderTaskCategories\([\s\S]*?creatorPanel\.hidden = true/.test(app),
  creatorTabsHiddenInCategory: /function renderTaskCategory\([\s\S]*?setTaskModeTabsVisible\(false\)/.test(app),
  creatorTabsVisibleOnCategoryList: /function renderTaskCategories\([\s\S]*?setTaskModeTabsVisible\(true\)/.test(app),
  creatorNotInHome: !/<button[^>]+data-go="tasks"[^>]+data-open-task-mode="creator"/.test(index),
  creatorNotInBottomNav: !/<nav class="bottom-nav"[\s\S]*data-open-task-mode="creator"/.test(index),
  tasksLandingDefault: /function showPage\(page\)[\s\S]*?if \(page === 'tasks'\) \{ state\.taskCategory = null; loadTasks\(\); \}/.test(app),
  dailyRefreshOutsideRenderer: renderTaskCategoryBody.length > 0 && !renderTaskCategoryBody.includes('loadDailyTaskStatus()') && !renderTaskCategoryBody.includes('loadDailyAdProgress()'),
  dailyRefreshOnCategoryEntry: categoryDailyRefresh.includes('renderTaskCategory(category.dataset.taskCategory)') && categoryDailyRefresh.includes("category.dataset.taskCategory === 'daily'") && categoryDailyRefresh.includes('loadDailyTaskStatus()') && categoryDailyRefresh.includes('loadDailyAdProgress()'),
  dailyRefreshScopedToDailyPage: /state\.page === 'tasks' && state\.taskCategory === 'daily'/.test(app),
  taskProviderContextServer: /const contexts = \['task', 'gaming', 'daily_checkin', 'verification'(?:, 'squad')?\]/.test(server),
  taskProviderConfigServer: /providers,[\s\S]*listAvailable\(context\)\.map/.test(server),
  taskAdProviderSelection: /startRotatedAdvertisementEventOnClient\(client, \{[\s\S]*context: 'task'/.test(fs.readFileSync('src/services/task-advertisement-service.js', 'utf8')),
  gamingProviderSelection: /providerId\s*=\s*response\.providerId;[\s\S]*getProvider\(providerId\)/.test(gaming),
  noClientPrioritySelection: !server.includes('listAvailable(context)[0]') && !adClient.includes('gamingProvider?.id ==='),
  clientProviderRegistry: adClient.includes('providerAdapters') && adClient.includes('getProvider(providerId)')
};
const failedTaskUxChecks = Object.entries(taskUxChecks).filter(([, passed]) => !passed).map(([name]) => name);
if (failedTaskUxChecks.length) throw new Error(`Task UX contract failed: ${failedTaskChecks.join(', ')}`);

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
console.log('DAILY_REFRESH_RECURSION_GUARD: PASS');
console.log('CREATOR_TABS_CATEGORY_SCOPE: PASS');
console.log('CREATOR_TASKS_ONLY_ENTRY: PASS');
console.log('TASKS_LANDING_DEFAULT: PASS');
console.log('TASK_AD_PROVIDER_CONTEXT: PASS');
console.log('AD_PROVIDER_ROTATION_CLIENT_CONTRACT: PASS');
