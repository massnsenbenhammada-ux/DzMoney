'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateCreatorProviderConfiguration,
  validateVerificationConfig
} = require('../src/services/task-verification-config');

const SOCIAL_CPM_DZX = Object.freeze({ open_link: 5000, server_verified: 9000 });

function calculateCampaignCost(cpmDZX, target) {
  return (cpmDZX * target) / 1000;
}

test('social Open Link requires a Telegram target and uses Click Proof', () => {
  assert.doesNotThrow(() => validateVerificationConfig({
    target: { type: 'telegram_channel', value: '@channel' },
    completion: { mode: 'open_link', url: 'https://t.me/channel' }
  }, 'social'));

  assert.throws(() => validateVerificationConfig({
    completion: { mode: 'open_link', url: 'https://t.me/channel' }
  }, 'social'), /Telegram target is required/);
});

test('social Server Verified uses Telegram Bot API and the same Telegram target', () => {
  assert.doesNotThrow(() => validateCreatorProviderConfiguration('social', {
    target: { type: 'telegram_channel', value: '@channel' },
    completion: { mode: 'server_verified' },
    verification: {
      provider: 'telegram_channel',
      method: 'telegram_bot_api',
      event: 'channel_membership',
      requirements: { channel: '@channel' }
    }
  }));
});

test('social Server Verified does not require an external completion URL', () => {
  assert.doesNotThrow(() => validateVerificationConfig({
    target: { type: 'telegram_channel', value: '@channel' },
    completion: { mode: 'server_verified' },
    verification: {
      provider: 'telegram_channel',
      method: 'telegram_bot_api',
      event: 'channel_membership',
      requirements: { channel: '@channel' }
    }
  }, 'social'));
});

test('social pricing is distinct by completion mode', () => {
  assert.equal(SOCIAL_CPM_DZX.open_link, 5000);
  assert.equal(SOCIAL_CPM_DZX.server_verified, 9000);
  assert.equal(calculateCampaignCost(SOCIAL_CPM_DZX.open_link, 1245), 6225);
  assert.equal(calculateCampaignCost(SOCIAL_CPM_DZX.server_verified, 1245), 11205);
});
