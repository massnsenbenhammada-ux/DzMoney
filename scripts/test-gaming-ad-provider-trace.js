const assert = require('assert');

function publicAdStartTrace(result) {
  return {
    context: 'gaming',
    providerId: result.providerId,
    adEventId: String(result.adEvent.id),
    duplicate: result.duplicate
  };
}

const trace = publicAdStartTrace({
  providerId: 'gigapub',
  adEvent: { id: 42 },
  duplicate: false
});

assert.deepStrictEqual(trace, {
  context: 'gaming',
  providerId: 'gigapub',
  adEventId: '42',
  duplicate: false
});
assert.ok(!Object.prototype.hasOwnProperty.call(trace, 'userId'));
console.log('Gaming ad provider trace contract tests passed.');
