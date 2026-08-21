const assert = require('assert');
const { executeTask } = require('../src/services/task-service');

async function expectRequired(input, message) {
  await assert.rejects(() => executeTask(input), new RegExp(message));
}

/** Validate task execution's public input contract. */
async function run() {
  await expectRequired(
    { taskId: null, userId: 1, idempotencyKey: 'exec-1' },
    'taskId is required'
  );
  await expectRequired(
    { taskId: 1, userId: null, idempotencyKey: 'exec-2' },
    'userId is required'
  );
  await expectRequired(
    { taskId: 1, userId: 1, idempotencyKey: null },
    'idempotencyKey is required'
  );

  console.log('Task execution input invariants: PASS');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
