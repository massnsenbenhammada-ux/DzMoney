'use strict';
const crypto = require('node:crypto');
const { test, expect } = require('@playwright/test');
const { Pool } = require('pg');

function buildInitData(userId) {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: userId, first_name: 'Phase 14 Share E2E' }) });
  const data = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  p.set('hash', crypto.createHmac('sha256', secret).update(data).digest('hex'));
  return p.toString();
}

async function cleanup(userId) {
  const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  try {
    const u = await db.query('SELECT id FROM users WHERE telegram_user_id=$1', [String(userId)]);
    if (!u.rowCount) return;
    const id = u.rows[0].id;
    await db.query('DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id=$1)', [id]);
    await db.query('DELETE FROM ledger_transactions WHERE user_id=$1', [id]);
    await db.query('DELETE FROM activity_ad_events WHERE user_id=$1', [id]);
    await db.query('DELETE FROM wallet_accounts WHERE user_id=$1', [id]);
    await db.query('DELETE FROM users WHERE id=$1', [id]);
  } finally { await db.end(); }
}

test('Share with Friends verifies click proof and credits canonical Economy/Ledger', async ({ page, request, baseURL }) => {
  test.setTimeout(60000);
  const telegramId = String(BigInt(process.env.TEST_TELEGRAM_USER_ID || '900000000') + BigInt(Date.now() % 1000000));
  const initData = buildInitData(telegramId);
  const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  await page.addInitScript(({ data }) => { window.Telegram = { WebApp: { initData: data, ready() {}, expand() {}, openTelegramLink() {} } }; }, { data: initData });
  await page.route('**://telegram.org/js/telegram-web-app.js', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  try {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.status')).toContainText('Online');
    const meBefore = await request.get(`${baseURL}/api/me`, { headers: { 'X-Telegram-Init-Data': initData } });
    expect(meBefore.ok()).toBeTruthy();
    const before = await meBefore.json();
    const userId = before.user.id;
    const beforeCoin = Number(before.balances?.COIN || 0);

    await page.evaluate(({ data }) => {
      window.DzMoneyMonetag = {
        ready: Promise.resolve(),
        handler: async payload => {
          if (payload?.type === 'preload') return { ok: true };
          const url = new URL('/api/ads/monetag/postback', location.origin);
          url.searchParams.set('token', 'test-monetag-secret');
          url.searchParams.set('telegram_id', data.match(/(?:^|&)user=(.*?)(?:&|$)/)?.[1] ? '' : '');
          url.searchParams.set('telegram_id', String(JSON.parse(decodeURIComponent(data.split('user=')[1].split('&')[0])).id));
          url.searchParams.set('zone_id', '11627577');
          url.searchParams.set('event_type', 'impression');
          url.searchParams.set('reward_event_type', 'valued');
          url.searchParams.set('estimated_price', '0.001');
          url.searchParams.set('ymid', payload.ymid);
          url.searchParams.set('request_var', 'verification');
          const response = await fetch(url);
          if (!response.ok) throw new Error(`provider completion failed: ${response.status}`);
          return { ok: true };
        }
      };
    }, { data: initData });

    await page.locator('[data-go="tasks"]').click();
    await page.locator('[data-task-category="daily"]').click();
    const card = page.locator('.task-card--daily').filter({ has: page.locator('[data-system-key="share_with_friends"]') });
    await expect(card).toBeVisible();
    const shareButton = card.locator('[data-task-action="share_with_friends"]');
    await expect(shareButton).toHaveText('Share');
    await shareButton.click();
    await expect(shareButton).toHaveText('Verify');

    const execute = await request.post(`${baseURL}/api/daily-tasks/execute`, { headers: { 'X-Telegram-Init-Data': initData }, data: { systemKey: 'share_with_friends', idempotencyKey: `probe:${telegramId}` } });
    expect(execute.status()).toBe(429);

    const verifyResponse = page.waitForResponse(r => r.url().endsWith('/api/tasks/click') && r.request().method() === 'POST');
    await shareButton.click();
    const verified = await verifyResponse;
    expect(verified.ok()).toBeTruthy();
    const verifiedBody = await verified.json();
    expect(verifiedBody.status).toBe('verified');
    expect(verifiedBody.rewarded).toBe(true);
    await expect(page.locator('#rewardPopup')).toContainText('Reward credited');

    const after = await request.get(`${baseURL}/api/me`, { headers: { 'X-Telegram-Init-Data': initData } });
    expect(after.ok()).toBeTruthy();
    const afterBody = await after.json();
    expect(Number(afterBody.balances.COIN)).toBeGreaterThan(beforeCoin);
    const ledger = await db.query("SELECT COUNT(*)::int AS count FROM ledger_transactions WHERE user_id=$1 AND transaction_type='TASK_REWARD'", [userId]);
    expect(ledger.rows[0].count).toBe(1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-go="tasks"]').click();
    await page.locator('[data-task-category="daily"]').click();
    await expect(page.locator('#rewardPopup')).toBeHidden();
  } finally { await db.end(); await cleanup(telegramId); }
});
