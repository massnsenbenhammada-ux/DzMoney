const assert = require('node:assert/strict');
const fs = require('node:fs');

test('creator contract route must call getCreatorCampaignContract without a taskType argument', () => {
  const source = fs.readFileSync('src/http/creator-task-routes.js', 'utf8');
  assert.match(source, /tasks\.getCreatorCampaignContract\(\)/);
  assert.doesNotMatch(source, /tasks\.getCreatorCampaignContract\(taskType\)/);
});
