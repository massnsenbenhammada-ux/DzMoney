const assert = require('node:assert/strict');
const fs = require('node:fs');

const routeSource = fs.readFileSync('src/http/creator-task-routes.js', 'utf8');

assert.match(routeSource, /getCreatorCampaignContract\(\)/);
assert.doesNotMatch(routeSource, /getCreatorCampaignContract\(taskType\)/);

console.log('Creator contract route regression test passed.');
