const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateMonetagPostback, MONETAG_ZONE_ID, MONETAG_CONTEXT } = require('../src/services/monetag-postback-service');

describe('Monetag postback verification contract', () => {
  it('accepts a valued postback when estimated_price is omitted', () => {
    const result = validateMonetagPostback({
      ymid: 'test-ymid',
      event_type: 'impression',
      reward_event_type: 'valued',
      zone_id: MONETAG_ZONE_ID,
      request_var: MONETAG_CONTEXT
    });

    assert.equal(result.eligible, true);
    assert.equal(result.estimatedPrice, null);
  });

  it('rejects non-valued traffic', () => {
    assert.throws(
      () => validateMonetagPostback({
        ymid: 'test-ymid',
        event_type: 'impression',
        reward_event_type: 'non_valued',
        zone_id: MONETAG_ZONE_ID,
        request_var: MONETAG_CONTEXT
      }),
      /not a rewarded event/
    );
  });

  it('records every server-side verification stage without logging Telegram identifiers', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/http/monetag-postback-routes.js'),
      'utf8'
    );

    assert.match(source, /stage=received/);
    assert.match(source, /stage=event_matched/);
    assert.match(source, /stage=validated/);
    assert.match(source, /stage=verified/);
    assert.match(source, /stage=finalized/);
    assert.match(source, /telegramIdPresent/);
    assert.doesNotMatch(source, /console\.(log|info|warn|error)\([^\n]*telegram_id/);
  });
});
