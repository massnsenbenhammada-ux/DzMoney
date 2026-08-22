const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');

/** Assert that the frontend exposes the required Monetag SDK contract. */
function assertMonetagSdkContract() {
  assert.match(indexHtml, /https:\/\/[^"']+\/sdk\.js/);
  assert.match(indexHtml, /data-zone=["']11627577["']/);
  assert.match(indexHtml, /data-sdk=["']show_11627577["']/);
  assert.match(appJs, /\/api\/daily-checkin\/claim/);
  assert.match(appJs, /show_11627577\(\{\s*ymid:/);
  assert.match(appJs, /\/api\/daily-checkin\/finalize/);
}

assertMonetagSdkContract();
console.log('Monetag SDK frontend contract tests passed.');
