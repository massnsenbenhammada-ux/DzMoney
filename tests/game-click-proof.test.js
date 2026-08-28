const assert = require('node:assert/strict');
const { recordTaskClick } = require('../src/services/task-service');

describe('Game click proof', () => {
  it('requires explicit click evidence before finalization can be rewarded', async () => {
    const result = await recordTaskClick({ taskId: 1, userId: 2, idempotencyKey: 'click-test-1', metadata: {} });
    assert.equal(result.verified, false);
    assert.equal(result.rewarded, false);
  });

  it('accepts explicit click evidence without making the client click itself trusted verification', async () => {
    const result = await recordTaskClick({ taskId: 1, userId: 2, idempotencyKey: 'click-test-2', metadata: { link_clicked: true } });
    assert.equal(result.rewarded, false);
  });
});
