const assert = require('assert');
const { startTaskAdvertisementEvent } = require('../src/services/ad-event-service');

async function testTaskAdvertisementContract() {
  assert.strictEqual(typeof startTaskAdvertisementEvent, 'function', 'Task advertisement flow must expose an explicit task-context boundary');
}

(async () => {
  try {
    await testTaskAdvertisementContract();
    console.log('Task advertisement flow contract: PASS');
  } catch (error) {
    console.error('Task advertisement flow contract: FAIL');
    console.error(error);
    process.exitCode = 1;
  }
})();
