const assert = require('assert');
const path = require('path');

process.env.BOT_TOKEN = process.env.BOT_TOKEN || 'test-bot-token';

function buildInitData({ user, startParam, authDate = Math.floor(Date.now() / 1000), hash }) {
  const crypto = require('crypto');
  const params = new URLSearchParams({
    auth_date: String(authDate),
    start_param: startParam,
    user: JSON.stringify(user)
  });
  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const calculated = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  params.set('hash', hash || calculated);
  return params.toString();
}

async function testSignedStartParam() {
  const { parseVerifiedTelegramInitData } = require('../src/http/telegram-auth');
  const user = { id: 900000001, first_name: 'ReferralTest' };
  const initData = buildInitData({ user, startParam: 'ABC1234567' });
  const verified = parseVerifiedTelegramInitData(initData);
  assert.strictEqual(verified.user.id, user.id);
  assert.strictEqual(verified.startParam, 'ABC1234567');
  assert.strictEqual(parseVerifiedTelegramInitData(`${initData.slice(0, -1)}0`), null);
}

async function testFirstEntryAttribution() {
  const authPath = require.resolve('../src/http/telegram-auth');
  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: { telegramAuth: (req, _res, next) => next() }
  };

  const walletService = require('../src/services/wallet-service');
  const { query, pool } = require('../src/db/pool');
  const referralService = require('../src/services/referral-service');
  const router = require('../src/http/me-routes');
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const referrer = await walletService.createUser({ telegramUserId: `ref-${suffix}` });
  const referredTelegramId = `new-${suffix}`;

  async function callMe(startParam) {
    return new Promise((resolve, reject) => {
      const req = { telegramUser: { id: referredTelegramId, first_name: 'New' }, telegramStartParam: startParam };
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(payload) { resolve({ statusCode: this.statusCode, payload }); }
      };
      router.handle(req, res, reject);
    });
  }

  try {
    await callMe(referrer.referral_code);
    const attributed = await query('SELECT * FROM referral_attributions WHERE referred_user_id = (SELECT id FROM users WHERE telegram_user_id = $1)', [referredTelegramId]);
    assert.strictEqual(attributed.rows.length, 1);
    assert.strictEqual(Number(attributed.rows[0].referrer_user_id), Number(referrer.id));

    await callMe('DIFFERENT1');
    const unchanged = await referralService.getReferralByReferredUser(attributed.rows[0].referred_user_id);
    assert.strictEqual(Number(unchanged.referrer_user_id), Number(referrer.id));
  } finally {
    await query('DELETE FROM referral_attributions WHERE referrer_user_id = $1 OR referred_user_id IN (SELECT id FROM users WHERE telegram_user_id IN ($2, $3))', [referrer.id, referredTelegramId, `ref-${suffix}`]);
    await query('DELETE FROM wallet_accounts WHERE user_id IN (SELECT id FROM users WHERE telegram_user_id IN ($1, $2))', [referredTelegramId, `ref-${suffix}`]);
    await query('DELETE FROM users WHERE telegram_user_id IN ($1, $2)', [referredTelegramId, `ref-${suffix}`]);
    await pool.end();
  }
}

Promise.resolve()
  .then(testSignedStartParam)
  .then(testFirstEntryAttribution)
  .then(() => console.log('Referral Telegram bootstrap invariants: PASS'))
  .catch(error => {
    console.error('Referral Telegram bootstrap invariants: FAIL');
    console.error(error);
    process.exitCode = 1;
  });
