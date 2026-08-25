const assert = require('assert');

const { buildReferralLink } = require('../src/config/telegram');

function testCanonicalDirectMiniAppLink() {
  assert.strictEqual(
    buildReferralLink('ABC123'),
    'https://t.me/DzaMoneybot/DzMoney?startapp=ABC123'
  );
}

function testReferralCodeIsEncoded() {
  assert.strictEqual(
    buildReferralLink('ABC+123'),
    'https://t.me/DzaMoneybot/DzMoney?startapp=ABC%2B123'
  );
}

testCanonicalDirectMiniAppLink();
testReferralCodeIsEncoded();
console.log('Canonical referral link invariants: PASS');
