'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const styleCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
const taskService = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'task-service.js'), 'utf8');

assert.match(styleCss, /\.task-card\{[^}]*width:100%[^}]*\}/, 'Task cards must use the full available task-list width');
assert.match(styleCss, /\.task-card\{[^}]*margin:0 auto 10px[^}]*\}/, 'Task cards must be centered with stable vertical spacing');
assert.match(taskService, /WHERE status='active' AND creator_id IS NULL/, 'Normal task catalog must exclude Creator campaign tasks');
assert.doesNotMatch(taskService, /WHERE status='active'\s+ORDER BY id/, 'Normal task catalog must not return all active tasks indiscriminately');

console.log('test-task-card-creator-scope: PASS');
