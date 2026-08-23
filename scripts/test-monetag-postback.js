const assert = require('assert');
const { validateMonetagPostback } = require('../src/services/monetag-postback-service');

function validPayload(overrides = {}) {
  return {
    telegram_id: '12345',
    zone_id: '11627577',
    sub_zone_id: '1',
    event_type: 'impression',
    reward_event_type: 'valued',
    estimated_price: '0.01000',
    ymid: 'attempt-123',
    request_var: 'daily_checkin',
    ...overrides
  };
}

function testAcceptsPaidImpression() {
  const result = validateMonetagPostback(validPayload());
  assert.strictEqual(result.eligible, true);
  assert.strictEqual(result.ymid, 'attempt-123');
  assert.strictEqual(result.telegramId, '12345');
  assert.strictEqual(result.rewardEventType, 'valued');
}

function testAcceptsPaidClick() {
  const result = validateMonetagPostback(validPayload({ event_type: 'click' }));
  assert.strictEqual(result.eligible, true);
  assert.strictEqual(result.eventType, 'click');
}

function testAcceptsLegacyPaidValueFromCurrentSspUi() {
  const result = validateMonetagPostback(validPayload({ reward_event_type: 'yes' }));
  assert.strictEqual(result.eligible, true);
  assert.strictEqual(result.rewardEventType, 'yes');
}

function testAcceptsMissingTelegramId() {
  const result = validateMonetagPostback(validPayload({ telegram_id: '' }));
  assert.strictEqual(result.eligible, true);
  assert.strictEqual(result.telegramId, null);
}

function testRejectsWrongZone() {
  assert.throws(() => validateMonetagPostback(validPayload({ zone_id: '999' })), /zone/i);
}

function testRejectsUnpaidImpression() {
  assert.throws(() => validateMonetagPostback(validPayload({ reward_event_type: 'non_valued' })), /reward/i);
  assert.throws(() => validateMonetagPostback(validPayload({ reward_event_type: 'no' })), /reward/i);
}

function testRejectsUnknownEventType() {
  assert.throws(() => validateMonetagPostback(validPayload({ event_type: 'complete' })), /event/i);
}

function testRejectsWrongContext() {
  assert.throws(() => validateMonetagPostback(validPayload({ request_var: 'task' })), /request/i);
}

function testRequiresYmid() {
  assert.throws(() => validateMonetagPostback(validPayload({ ymid: '' })), /ymid/i);
}

function testRejectsInvalidPrice() {
  assert.throws(() => validateMonetagPostback(validPayload({ estimated_price: 'not-a-number' })), /price/i);
}

try {
  testAcceptsPaidImpression();
  testAcceptsPaidClick();
  testAcceptsLegacyPaidValueFromCurrentSspUi();
  testAcceptsMissingTelegramId();
  testRejectsWrongZone();
  testRejectsUnpaidImpression();
  testRejectsUnknownEventType();
  testRejectsWrongContext();
  testRequiresYmid();
  testRejectsInvalidPrice();
  console.log('Monetag rewarded postback invariants: PASS');
} catch (error) {
  console.error('Monetag rewarded postback invariants: FAIL');
  console.error(error);
  process.exitCode = 1;
}
