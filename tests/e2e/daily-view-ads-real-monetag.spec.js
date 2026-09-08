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
  params.set('user', JSON.stringify({ id: userId, first_name: 'DzMoney Real Monetag' }));
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(required('BOT_TOKEN')).digest();
  params.set('hash', crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));
  return params.toString();
}

async function readDailyViewText(page) {
  return page.locator('.task-card--daily').filter({ has: page.locator('[data-system-key="view_ads"]') }).textContent();
}

function assertReward(reward) {
  expect(reward).toEqual({ coin: 1000, dzx: 1, dzp: 1 });
}

test('Daily View Ads credits 20 consecutive real Monetag ads', async ({ page, request }) => {
  test.skip(process.env.REAL_MONETAG_E2E !== '1', 'Explicit opt-in: REAL_MONETAG_E2E=1');

  const baseUrl = process.env.REAL_MONETAG_BASE_URL || 'https://dzmoney-production.up.railway.app';
  const baseUserId = BigInt(required('TEST_TELEGRAM_USER_ID'));
  const telegramUserId = String(baseUserId + BigInt(Date.now() % 1000000));
  const initData = buildInitData(telegramUserId);
  const seenMonetagRequests = [];
  const executeEvents = [];
  const finalizedEvents = [];

  const cleanup = async () => {
    const me = await request.get(`${baseUrl}/api/me`, { headers: { 'X-Telegram-Init-Data': initData } });
    if (!me.ok()) return;
    const data = await me.json();
    const userId = data.user?.id;
    if (!userId || !process.env.DATABASE_URL) return;
    const pg = require('pg');
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
    try {
      await pool.query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id=$1)', [userId]);
      await pool.query('DELETE FROM ledger_transactions WHERE user_id=$1', [userId]);
      await pool.query('DELETE FROM activity_ad_events WHERE user_id=$1', [userId]);
      await pool.query('DELETE FROM wallet_accounts WHERE user_id=$1', [userId]);
      await pool.query('DELETE FROM users WHERE id=$1', [userId]);
    } finally {
      await pool.end();
    }
  };

  await page.addInitScript(({ telegramInitData }) => {
    window.Telegram = { WebApp: { initData: telegramInitData, ready() {}, expand() {} } };
  }, { telegramInitData: initData });
  await page.route('**://telegram.org/js/telegram-web-app.js', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  page.on('request', requestEvent => {
    if (requestEvent.url().includes('libtl.com/sdk.js')) seenMonetagRequests.push(requestEvent.url());
  });
  page.on('response', async response => {
    if (response.url().endsWith('/api/daily-tasks/execute') && response.request().method() === 'POST') {
      try {
        const body = await response.json();
        if (body.adEventId || body.externalAdId) executeEvents.push(body);
      } catch {}
    }
    if (response.url().endsWith('/api/daily-tasks/advertisement/finalize') && response.request().method() === 'POST') {
      try {
        const body = await response.json();
        if (body.rewarded === true) finalizedEvents.push(body);
      } catch {}
    }
  });

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.status')).toContainText('Online', { timeout: 15000 });
    await expect.poll(async () => page.evaluate(() => typeof window.show_11627577)).toBe('function', { timeout: 20000 });

    await page.locator('[data-go="tasks"]').click();
    await page.locator('[data-task-category="daily"]').click();
    const dailyView = page.locator('.task-card--daily').filter({ has: page.locator('[data-system-key="view_ads"]') });
    await expect(dailyView).toBeVisible();

    const externalAdIds = new Set();
    const rewardedAdEventIds = new Set();
    for (let expected = 1; expected <= 20; expected += 1) {
      const executeResponsePromise = page.waitForResponse(response => response.url().endsWith('/api/daily-tasks/execute') && response.request().method() === 'POST');
      await page.locator('[data-task-action="view_ads"]').click();
      const executeResponse = await executeResponsePromise;
      expect(executeResponse.ok()).toBeTruthy();
      const executeBody = await executeResponse.json();
      expect(executeBody.providerId).toBe('monetag');
      expect(executeBody.adEventId).toBeTruthy();
      expect(executeBody.externalAdId).toBeTruthy();
      expect(externalAdIds.has(executeBody.externalAdId)).toBeFalsy();
      externalAdIds.add(executeBody.externalAdId);

      await expect.poll(() => readDailyViewText(page), { timeout: 75000 }).toContain(`${expected}/20 watched`);
      await expect.poll(() => finalizedEvents.filter(item => item.progress?.completed === expected).length, { timeout: 10000 }).toBe(1);
      const rewardResponse = finalizedEvents.find(item => item.progress?.completed === expected);
      expect(rewardResponse).toBeTruthy();
      expect(rewardResponse.rewarded).toBe(true);
      assertReward(rewardResponse.reward);
      rewardedAdEventIds.add(executeBody.adEventId);
      expect(rewardedAdEventIds.size).toBe(expected);
      expect(externalAdIds.size).toBe(expected);

      if (expected < 20) {
        await expect(page.locator('[data-task-action="view_ads"]')).toBeEnabled({ timeout: 10000 });
      }
    }

    expect(externalAdIds.size).toBe(20);
    expect(rewardedAdEventIds.size).toBe(20);
    expect(executeEvents.length).toBeGreaterThanOrEqual(20);
    expect(finalizedEvents.length).toBe(20);
    expect(finalizedEvents.every(item => item.rewarded === true)).toBeTruthy();
    expect(finalizedEvents.every(item => item.reward && item.reward.coin === 1000 && item.reward.dzx === 1 && item.reward.dzp === 1)).toBeTruthy();
    expect(seenMonetagRequests.length).toBeGreaterThanOrEqual(20);
    await expect.poll(() => readDailyViewText(page), { timeout: 10000 }).toContain('20/20 watched');
  } finally {
    await cleanup();
  }
});
