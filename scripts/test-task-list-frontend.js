'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

assert.match(appJs, /async function loadTasks\s*\(/, 'Frontend must define loadTasks()');
assert.match(appJs, /api\('\/api\/tasks'\)/, 'Frontend must request /api/tasks');
assert.match(appJs, /function renderTasks\s*\(/, 'Frontend must define renderTasks()');
assert.match(appJs, /loadTasks\(\)/, 'Frontend startup must load tasks');
assert.match(appJs, /async function startTaskExecutionFlow\s*\(/, 'Frontend must define task execution flow');
assert.match(appJs, /api\('\/api\/tasks\/execute'/, 'Frontend must call the task execution boundary');
assert.match(appJs, /const numericTaskId = Number\(task\.id\);/, 'Frontend must normalize task.id before task execution');
assert.match(appJs, /Number\.isSafeInteger\(numericTaskId\)/, 'Frontend must reject unsafe task ids before sending them');
assert.match(appJs, /taskId: numericTaskId/, 'Frontend must send the normalized numeric task id');
assert.match(appJs, /crypto\.randomUUID\(\)/, 'Task execution must use an idempotency key');
assert.match(appJs, /api\('\/api\/tasks\/click'/, 'Frontend must report open_link click evidence to the server');
assert.match(appJs, /attemptId: result\.attemptId/, 'Frontend must associate click evidence with the started attempt');

assert.match(appJs, /TASK_CATEGORY_ORDER\s*=\s*\[/, 'Tasks UI must define one canonical category order');
for (const label of ['Daily Activity', 'Game Task', 'Social Task', 'Web Task', 'Special \/ Partner Task']) {
  assert.match(appJs, new RegExp(label), `Tasks UI must expose ${label}`);
}
assert.match(appJs, /DAILY_SUBTYPE_ORDER\s*=\s*\[/, 'Daily Activity must define one canonical subtype order');
for (const key of ['daily_check_in', 'check_for_update', 'share_with_friends', 'ad_view', 'invite_1_friend', 'invite_10_friends', 'invite_20_friends', 'invite_50_friends', 'invite_100_friends']) {
  assert.match(appJs, new RegExp(`['\"]${key}['\"]`), `Daily subtype ${key} must be represented`);
}
assert.match(appJs, /function renderTaskCategories\s*\(/, 'Tasks UI must render the category view separately');
assert.match(appJs, /function renderTaskCategory\s*\(/, 'Tasks UI must render a selected category separately');
assert.match(appJs, /rewardCoin/, 'Task rendering must expose COIN reward value');
assert.match(appJs, /rewardDzx/, 'Task rendering must expose DZX reward value');
assert.match(appJs, /rewardDzp/, 'Task rendering must expose DZP reward value');
assert.match(appJs, /data-task-category/, 'Task categories must be selectable without changing backend authority');
assert.match(appJs, /data-task-back/, 'Selected task category must provide a back path to categories');

console.log('test-task-list-frontend: PASS');
