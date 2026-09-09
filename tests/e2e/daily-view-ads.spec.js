const crypto = require('crypto');
const { test, expect } = require('@playwright/test');

function buildInitData(userId) {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set(
    'user',
    JSON.stringify({ id: userId, first_name: 'Phase 14 E2E' }),
  );
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(process.env.BOT_TOKEN)
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

test('Daily View Ads runs through the real UI and canonical HTTP reward path', async ({
  page,
  request,
  baseURL,
}) => {
  test.skip(
    !process.env.BOT_TOKEN || !process.env.MONETAG_POSTBACK_SECRET,
    'Phase 14 E2E requires repository provider/auth secrets',
  );
  const baseUserId = BigInt(process.env.TEST_TELEGRAM_USER_ID || '900000000');
  const telegramUserId = String(baseUserId + BigInt(Date.now() % 1000000));
  const initData = buildInitData(telegramUserId);
  const cleanup = async () => {
    const me = await request
      .get(new URL('/api/me', baseURL).toString(), {
        headers: { 'X-Telegram-Init-Data': initData },
      })
      .catch(() => null);
    if (!me?.ok()) return;
    const data = await me.json();
    const userId = data.user?.id;
    if (!userId || !process.env.DATABASE_URL) return;
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
    ({ initData: telegramInitData }) => {
      window.Telegram = {
        WebApp: { initData: telegramInitData, ready() {}, expand() {} },
      };
    },
    { initData },
  );
  await page.route('**://telegram.org/js/telegram-web-app.js', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: '',
    }),
  );
  await page.route('**://libtl.com/sdk.js**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `window.show_11627577 = async function(payload) {
      if (payload && payload.type === 'preload') return { ok: true };
      return new Promise(resolve => { window.__resolveMonetagShow = () => resolve({ ok: true }); });
    };
    window.__DzMoneyMonetagSdkLoad = 'loaded';`,
    }),
  );

  try {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.status')).toContainText('Online');
    await page.locator('.nav-item[data-go="tasks"]').click();
    await expect(page.locator('[data-task-category="daily"]')).toBeVisible();
    await page.locator('[data-task-category="daily"]').click();
    const dailyView = page
      .locator('.task-card--daily')
      .filter({ has: page.locator('[data-system-key="view_ads"]') });
    await expect(dailyView).toBeVisible();

    const executeResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/daily-tasks/execute') &&
        response.request().method() === 'POST',
    );
    await page.locator('[data-task-action="view_ads"]').click();
    const executeResponse = await executeResponsePromise;
    expect(executeResponse.ok()).toBeTruthy();
    const executeBody = await executeResponse.json();
    expect(executeBody.externalAdId).toBeTruthy();
    expect(executeBody.providerId).toBe('monetag');

    const postback = new URL('/api/ads/monetag/postback', baseURL);
    postback.searchParams.set('token', process.env.MONETAG_POSTBACK_SECRET);
    postback.searchParams.set('telegram_id', telegramUserId);
    postback.searchParams.set('zone_id', '11627577');
    postback.searchParams.set('event_type', 'impression');
    postback.searchParams.set('reward_event_type', 'valued');
    postback.searchParams.set('estimated_price', '0.001');
    postback.searchParams.set('ymid', executeBody.externalAdId);
    postback.searchParams.set('request_var', 'task');
    const postbackResponse = await request.get(postback.toString());
    expect(postbackResponse.ok()).toBeTruthy();

    await page.evaluate(() => window.__resolveMonetagShow?.());
    await expect(dailyView).toContainText('1/20 watched', { timeout: 10000 });
  } finally {
    await cleanup();
  }
});
