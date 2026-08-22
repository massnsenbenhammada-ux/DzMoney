const assert = require('assert');
const { canTransitionTaskStatus, TASK_STATUSES } = require('../src/services/task-service');

function run() {
  const allowed = [
    ['draft', 'pending_review'],
    ['pending_review', 'draft'],
    ['pending_review', 'active'],
    ['active', 'paused'],
    ['active', 'completed'],
    ['active', 'expired'],
    ['paused', 'active'],
    ['paused', 'completed'],
    ['paused', 'expired'],
    ['completed', 'closed'],
    ['completed', 'refunded'],
    ['expired', 'closed'],
    ['expired', 'refunded']
  ];

  assert.deepStrictEqual(TASK_STATUSES, ['draft', 'pending_review', 'active', 'paused', 'completed', 'expired', 'closed', 'refunded']);
  for (const [from, to] of allowed) assert.strictEqual(canTransitionTaskStatus(from, to), true, `${from} -> ${to} should be allowed`);

  for (const from of TASK_STATUSES) {
    for (const to of TASK_STATUSES) {
      if (from === to) assert.strictEqual(canTransitionTaskStatus(from, to), false, `${from} -> itself should be rejected`);
    }
  }

  const forbidden = [
    ['draft', 'active'],
    ['draft', 'completed'],
    ['pending_review', 'paused'],
    ['active', 'draft'],
    ['active', 'pending_review'],
    ['completed', 'active'],
    ['expired', 'active'],
    ['closed', 'active'],
    ['closed', 'refunded'],
    ['refunded', 'active'],
    ['refunded', 'closed']
  ];
  for (const [from, to] of forbidden) assert.strictEqual(canTransitionTaskStatus(from, to), false, `${from} -> ${to} should be rejected`);

  assert.strictEqual(canTransitionTaskStatus('unknown', 'active'), false);
  assert.strictEqual(canTransitionTaskStatus('active', 'unknown'), false);
  console.log('task lifecycle transition tests passed');
}

run();
