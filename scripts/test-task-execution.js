const assert = require('assert');
const { executeTask } = require('../src/services/task-service');

async function run() {
  await assert.rejects(
    () => executeTask({ taskId: null, userId: 1, idempotencyKey: 'exec-1' }),
    /taskId is required/
  );

  await assert.rejects(
    () => executeTask({ taskId: 1, userId: 1, idempotencyKey: null }),
    /idempotencyKey is required/
  );

  console.log('Task execution input invariants: PASS');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
