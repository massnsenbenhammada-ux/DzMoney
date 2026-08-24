'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
assert.match(appJs, /api\('\/api\/tasks\/click'/, 'Frontend must report open_link click evidence to the server');
assert.match(appJs, /attemptId: result\.attemptId/, 'Frontend must associate click evidence with the started attempt');
console.log('test-task-click-frontend: PASS');
