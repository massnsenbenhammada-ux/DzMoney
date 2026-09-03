const assert = require('assert');
const crypto = require('crypto');
const {
  buildRewardHash,
  buildConfirmationHash,
  verifyRewardClaim
} = require('../src/services/gigapub-offerwall-service');

const secretKey = 'gigapub-test-secret';
const reward = {
  rewardId: '123',
  userId: '456',
  projectId: '7958',
  amount: 500,
  hash: ''
};

reward.hash = buildRewardHash(reward, secretKey);

assert.strictEqual(
  reward.hash,
  crypto.createHash('sha1').update('456:7958:123:500:gigapub-test-secret').digest('hex')
);

const verified = verifyRewardClaim(reward, { projectId: '7958', secretKey });
assert.deepStrictEqual(verified, { verified: true });

assert.throws(
  () => verifyRewardClaim({ ...reward, hash: 'invalid' }, { projectId: '7958', secretKey }),
  /Invalid GigaPub reward hash/
);

assert.throws(
  () => verifyRewardClaim(reward, { projectId: '7959', secretKey }),
  /GigaPub project mismatch/
);

const confirmationHash = buildConfirmationHash(reward, secretKey);
assert.strictEqual(
  confirmationHash,
  crypto.createHash('sha1').update('456:7958:123:500:confirm:gigapub-test-secret').digest('hex')
);

assert.notStrictEqual(confirmationHash, reward.hash);
console.log('GigaPub OfferWall verification tests passed.');