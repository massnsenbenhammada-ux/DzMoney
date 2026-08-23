const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('Monetag postback verification observability contract', () => {
  it('logs each server-side verification stage without exposing Telegram identifiers', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/services/monetag-postback-service.js'),
      'utf8'
    );

    assert.match(source, /\[Monetag postback\]/);
    assert.match(source, /verification/);
    assert.match(source, /finaliz/);
    assert.doesNotMatch(source, /console\.log\([^\n]*telegramId/);
  });

  it('keeps the existing trusted validation contract', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/services/monetag-postback-service.js'),
      'utf8'
    );

    assert.match(source, /validateMonetagPostback/);
    assert.match(source, /MONETAG_ZONE_ID/);
    assert.match(source, /MONETAG_CONTEXT/);
  });
});
