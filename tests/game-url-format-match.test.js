const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesUrlFormat } = require('../src/services/game-url-format-match');

test('Game URL format matches the same Telegram Mini App with a different referral value', () => {
  assert.equal(matchesUrlFormat(
    'https://t.me/MBuxBot/app?startapp=r_5459324721',
    'https://t.me/MBuxBot/app?startapp=r_8654896543'
  ), true);
});

test('Game URL format matches Telegram bot referral links with the same value shape', () => {
  assert.equal(matchesUrlFormat(
    'https://t.me/BirdsEmpireBot?start=303162',
    'https://t.me/BirdsEmpireBot?start=865489'
  ), true);
});

test('Game URL format rejects a different Telegram Mini App', () => {
  assert.equal(matchesUrlFormat(
    'https://t.me/MBuxBot/app?startapp=r_5459324721',
    'https://t.me/surf_earn_bot/app?startapp=r_5459324721'
  ), false);
});

test('Game URL format requires the same referral value shape', () => {
  assert.equal(matchesUrlFormat(
    'https://t.me/MBuxBot/app?startapp=r_5459324721',
    'https://t.me/MBuxBot/app?startapp=r_123456789'
  ), false);
  assert.equal(matchesUrlFormat(
    'https://t.me/MBuxBot/app?startapp=r_5459324721',
    'https://t.me/MBuxBot/app?startapp=x_8654896543'
  ), false);
});

test('Game URL format rejects a changed path or query key', () => {
  const reference = 'https://t.me/MBuxBot/app?startapp=r_5459324721';
  assert.equal(matchesUrlFormat(reference, 'https://t.me/MBuxBot?startapp=r_8654896543'), false);
  assert.equal(matchesUrlFormat(reference, 'https://t.me/MBuxBot/app?start=r_8654896543'), false);
});

test('Game URL format rejects malformed or extra-query URLs', () => {
  const reference = 'https://t.me/MBuxBot/app?startapp=r_5459324721';
  assert.equal(matchesUrlFormat(reference, 'not-a-url'), false);
  assert.equal(matchesUrlFormat(reference, 'https://t.me/MBuxBot/app?startapp=r_8654896543&x=1'), false);
});
