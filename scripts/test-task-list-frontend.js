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
assert.match(appJs, /crypto\.randomUUID\(\)/, 'Task execution must use an idempotency key');

console.log('test-task-list-frontend: PASS');
