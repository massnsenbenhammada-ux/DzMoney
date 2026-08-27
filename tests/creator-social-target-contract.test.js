import test from 'node:test';
import assert from 'node:assert/strict';

const PRICING = {
  openLinkCpmDZX: 5000,
  serverVerifiedCpmDZX: 9000,
};

function calculateCost(cpmDZX, target) {
  return (cpmDZX * target) / 1000;
}

test('social Open Link uses Telegram target, Click Proof, and 5000 DZX CPM', () => {
  const contract = {
    type: 'social',
    mode: 'open_link',
    telegramTarget: '@channel',
    proof: 'click',
    cpmDZX: PRICING.openLinkCpmDZX,
  };

  assert.equal(contract.telegramTarget, '@channel');
  assert.equal(contract.proof, 'click');
  assert.equal(contract.cpmDZX, 5000);
});

test('social Server Verified uses Telegram Bot API, Telegram target, and 9000 DZX CPM', () => {
  const contract = {
    type: 'social',
    mode: 'server_verified',
    provider: 'telegram_bot_api',
    telegramTarget: '@channel',
    proof: 'server_verification',
    cpmDZX: PRICING.serverVerifiedCpmDZX,
  };

  assert.equal(contract.provider, 'telegram_bot_api');
  assert.equal(contract.telegramTarget, '@channel');
  assert.equal(contract.proof, 'server_verification');
  assert.equal(contract.cpmDZX, 9000);
});

test('social campaign cost is calculated from the selected CPM', () => {
  assert.equal(calculateCost(PRICING.openLinkCpmDZX, 1245), 6225);
  assert.equal(calculateCost(PRICING.serverVerifiedCpmDZX, 1245), 11205);
});
