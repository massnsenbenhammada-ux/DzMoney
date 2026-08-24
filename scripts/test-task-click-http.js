// RED contract: the canonical HTTP boundary must record an open_link click.
// Intentionally fails until the existing Express app exposes the task-click route.
const assert = require('node:assert/strict');
const http = require('node:http');
const serverModule = require('../server');

assert.equal(typeof serverModule.app, 'function', 'server.js must expose the canonical Express app for HTTP integration testing');

function request(app, path, body) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const req = http.request({ hostname: '127.0.0.1', port, path, method: 'POST', headers: { 'content-type': 'application/json' } }, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => { server.close(); resolve({ status: res.statusCode, body: data }); });
      });
      req.on('error', err => { server.close(); reject(err); });
      req.write(JSON.stringify(body));
      req.end();
    });
  });
}

(async () => {
  const response = await request(serverModule.app, '/api/tasks/click', {
    taskId: 'phase2-open-link',
    attemptId: 'phase2-open-attempt'
  });
  assert.notEqual(response.status, 404, 'canonical task click route must exist');
})();
