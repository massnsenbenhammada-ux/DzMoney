const assert = require('assert');
const fs = require('fs');
const path = require('path');

const frontend = fs.readFileSync(path.join(__dirname, '../public/check-for-update.js'), 'utf8');
assert.doesNotMatch(
  frontend,
  /window\.location\.reload\(\)/,
  'Check for Update must not reload the app after reward',
);
assert.match(
  frontend,
  /setButton\(button, 'Done', true\)/,
  'Successful verification must keep the task completed in place',
);
console.log('Check for Update navigation regression: PASS');
