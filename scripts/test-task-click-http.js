// RED contract: the Telegram-authenticated HTTP boundary must record an open_link click.
// Intentionally fails until the canonical task click route is wired to task-service.recordTaskClick().
const assert = require('node:assert/strict');
const http = require('node:http');
const { app } = require('../server');

function request(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: 0, path, method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  assert.equal(typeof app, 'function', 'server must expose the canonical Express app for HTTP integration tests');
  const response = await request('/api/tasks/click', { taskId: 'phase2-open-link', attemptId: 'phase2-open-attempt' }, { 'x-test-telegram-user-id': 'phase2-user' });
  assert.notEqual(response.status, 404, 'canonical task click route must exist');
  assert.equal(response.status, 200, response.body);
})();
