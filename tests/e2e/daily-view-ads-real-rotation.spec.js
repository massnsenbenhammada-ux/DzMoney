const crypto = require('crypto');
const { test, expect } = require('@playwright/test');
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
function buildInitData(userId) {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set(
    'user',
    JSON.stringify({ id: userId, first_name: 'DzMoney Real Ad Rotation' }),
  );
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(required('BOT_TOKEN'))
    .digest();
  params.set(
    'hash',
    crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex'),
  );
  return params.toString();
}

test('Daily View Ads alternates real Monetag and AdsGram Test providers', async ({
  page,
  request,
}) => {
  test.skip(
    process.env.REAL_AD_PROVIDER_ROTATION_E2E !== '1',
    'Explicit opt-in: REAL_AD_PROVIDER_ROTATION_E2E=1',
  );
  const baseUrl =
    process.env.REAL_AD_PROVIDER_ROTATION_BASE_URL ||
    'https://dzmoney-production.up.railway.app';
  const baseUserId = BigInt(required('TEST_TELEGRAM_USER_ID'));
  const telegramUserId = String(baseUserId + BigInt(Date.now() % 1000000));
  const initData = buildInitData(telegramUserId);
  const cleanup = async () => {
    const me = await request.get(`${baseUrl}/api/me`, {
      headers: { 'X-Telegram-Init-Data': initData },
    });
    if (!me.ok() || !process.env.DATABASE_URL) return;
    const data = await me.json();
    const userId = data.user?.id;
    if (!userId) return;
    const pg = require('pg');
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: false,
    });
    try {
      await pool.query(
        'DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id=$1)',
        [userId],
      );
      await pool.query('DELETE FROM ledger_transactions WHERE user_id=$1', [
        userId,
      ]);
      await pool.query('DELETE FROM activity_ad_events WHERE user_id=$1', [
        userId,
      ]);
      await pool.query('DELETE FROM wallet_accounts WHERE user_id=$1', [
        userId,
      ]);
      await pool.query('DELETE FROM users WHERE id=$1', [userId]);
    } finally {
      await pool.end();
    }
  };
  await page.addInitScript(
    ({ telegramInitData }) => {
      window.Telegram = {
        WebApp: { initData: telegramInitData, ready() {}, expand() {} },
      };
    },
    { telegramInitData: initData },
  );
  await page.route('**://telegram.org/js/telegram-web-app.js', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: '',
    }),
  );
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.status')).toContainText('Online', {
      timeout: 15000,
    });
    await page.locator('[data-go="tasks"]').click();
    await page.locator('[data-task-category="daily"]').click();
    const providers = [];
    for (let expected = 1; expected <= 20; expected += 1) {
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/daily-tasks/execute') &&
          response.request().method() === 'POST',
      );
      await page.locator('[data-task-action="view_ads"]').click();
      const response = await responsePromise;
      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      providers.push(body.providerId);
      expect(body.adEventId).toBeTruthy();
      expect(body.externalAdId).toBeTruthy();
      expect(body.providerId).toBe(expected % 2 === 1 ? 'monetag' : 'adsgram');
      await expect
        .poll(
          () =>
            page
              .locator('.task-card--daily')
              .filter({ has: page.locator('[data-system-key="view_ads"]') })
              .textContent(),
          { timeout: 90000 },
        )
        .toContain(`${expected}/20 watched`);
    }
    expect(providers).toEqual(
      Array.from({ length: 20 }, (_, index) =>
        index % 2 === 0 ? 'monetag' : 'adsgram',
      ),
    );
  } finally {
    await cleanup();
  }
});
