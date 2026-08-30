'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

assert.match(appJs, /async function loadTasks\s*\(/, 'Frontend must define loadTasks()');
assert.match(appJs, /api\('\/api\/tasks'\)/, 'Frontend must request /api/tasks');
assert.match(appJs, /function renderTasks\s*\(/, 'Frontend must define renderTasks()');
assert.match(appJs, /loadTasks\(\)/, 'Frontend startup must load tasks');
assert.match(appJs, /async function startTaskAction\s*\(/, 'Frontend must define task-specific open flow');
assert.doesNotMatch(appJs, /async function startTaskExecutionFlow\s*\(/, 'Legacy generic task execution flow must not remain');
assert.match(appJs, /api\('\/api\/tasks\/execute'/, 'Frontend must call the task execution boundary');
assert.match(appJs, /const numericTaskId = Number\(task\.id\);/, 'Frontend must normalize task.id before task execution');
assert.match(appJs, /Number\.isSafeInteger\(numericTaskId\)/, 'Frontend must reject unsafe task ids before sending them');
assert.match(appJs, /taskId: numericTaskId/, 'Frontend must send the normalized numeric task id');
assert.match(appJs, /crypto\.randomUUID\(\)/, 'Task execution must use an idempotency key');
assert.match(appJs, /api\('\/api\/tasks\/click'/, 'Frontend must report click-proof evidence to the server');
assert.match(appJs, /attemptId: saved\.attemptId/, 'Frontend must associate click evidence with the started attempt');

assert.match(appJs, /TASK_CATEGORY_ORDER\s*=\s*\[/, 'Tasks UI must define one canonical category order');
for (const label of ['Daily Activity', 'Game Task', 'Social Task', 'Web Task', 'Special \/ Partner Task']) {
  assert.match(appJs, new RegExp(label), `Tasks UI must expose ${label}`);
}
assert.match(appJs, /DAILY_SUBTYPE_ORDER\s*=\s*\[/, 'Daily Activity must define one canonical subtype order');
for (const key of ['daily_check_in', 'check_for_update', 'share_with_friends', 'view_ads', 'invite_1_friend', 'invite_10_friends', 'invite_20_friends', 'invite_50_friends', 'invite_100_friends']) {
  assert.match(appJs, new RegExp(`[\'\"]${key}[\'\"]`), `Daily subtype ${key} must be represented`);
}
assert.doesNotMatch(appJs, /\['\"]ad_view['\"]/, 'Frontend must use canonical view_ads system key');
assert.match(appJs, /function renderTaskCategories\s*\(/, 'Tasks UI must render the category view separately');
assert.match(appJs, /function renderTaskCategory\s*\(/, 'Tasks UI must render a selected category separately');
assert.match(appJs, /rewardCoin/, 'Task rendering must expose COIN reward value');
assert.match(appJs, /rewardDzx/, 'Task rendering must expose DZX reward value');
assert.match(appJs, /rewardDzp/, 'Task rendering must expose DZP reward value');
assert.match(appJs, /data-task-category/, 'Task categories must be selectable without changing backend authority');
assert.match(appJs, /data-task-back/, 'Selected task category must provide a back path to categories');

for (const label of ['Check in', 'Check for Update', 'Share with Friends', 'Watch', 'Invite', 'Claim']) {
  assert.match(appJs, new RegExp(label), `Task UI must support task-specific action label: ${label}`);
}
assert.match(appJs, /task-open-action/, 'Normal tasks must expose a dedicated Open action');
assert.match(appJs, /task-verify-action/, 'Normal tasks must expose a dedicated Verify action');
assert.match(appJs, /data-task-open=/, 'Open action must carry the task id');
assert.match(appJs, /data-task-verify=/, 'Verify action must carry the task id');
assert.match(appJs, /verifyDisabled = saved\?\.attemptId \? '' : 'disabled'/, 'Verify must remain unavailable until an attempt exists');
assert.match(appJs, /Task opened\. Tap Verify/, 'Open must not itself display the verification advertisement');
assert.match(appJs, /showTaskVerificationAd\(saved\.verificationAdId\)/, 'Verify must display the verification advertisement');
assert.match(appJs, /startDailyAdvertisementFlow\s*\(/, 'Ad View must use its advertisement-specific flow');
assert.match(appJs, /\/api\/daily-tasks\/execute/, 'Ad View must start through the existing daily task advertisement boundary');
assert.match(appJs, /\/api\/daily-tasks\/advertisement\/finalize/, 'Ad View must finalize through the existing task advertisement boundary');
assert.match(appJs, /state\.dailyAdProgress\?\.completed \|\| 0/, 'Ad View must expose the canonical initial 0/20 progress fallback');
assert.match(appJs, /state\.dailyAdProgress\?\.target \|\| 20/, 'Ad View must expose the canonical 20-ad target fallback');
assert.match(appJs, /requestVar:\s*['\"]task['\"]/, 'Tasks-page ads must use task advertisement context, not verification context');
assert.match(appJs, /api\(`\/api\/daily-tasks\?systemKey=\$\{encodeURIComponent\(systemKey\)\}`\)/, 'Invite state must come from the existing server Daily Task endpoint');
assert.match(appJs, /serverTask\.progress\?\.claimable/, 'Invite claimability must use server-provided state');
assert.match(appJs, /data-task-action/, 'Task cards must carry task-specific action metadata');

console.log('test-task-list-frontend: PASS');
