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
  taskProviderContextServer: /\['task',\s*'gaming',\s*'daily_checkin',\s*'verification'\]/.test(server),
  taskProviderConfigServer: /clientAdConfig\(\)[\s\S]*?listAvailable\(context\)/.test(server),
  taskAdProviderSelection: /selectProvider\(providerRegistry, \{ context: 'task' \}\)/.test(fs.readFileSync('src/services/task-advertisement-service.js', 'utf8'))
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