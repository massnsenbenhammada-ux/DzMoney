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
    await db.query('DELETE FROM task_verification_gates WHERE attempt_id IN (SELECT id FROM task_attempts WHERE user_id=$1)', [id]);
    await db.query('DELETE FROM task_attempts WHERE user_id=$1', [id]);
    await db.query('DELETE FROM daily_checkins WHERE user_id=$1', [id]);
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
  let verificationAdId = null;
  await page.addInitScript(({ data }) => { window.Telegram = { WebApp: { initData: data, ready() {}, expand() {}, openTelegramLink() {} } }; }, { data: initData });
  await page.route('**://telegram.org/js/telegram-web-app.js', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.route('**/api/tasks/click', async route => {
    if (!verificationAdId) return route.continue();
    const clickResponse = await route.fetch();
    const postback = new URL('/api/ads/monetag/postback', baseURL);
    for (const [key, value] of Object.entries({ token: 'test-monetag-secret', telegram_id: telegramId, zone_id: '11627577', event_type: 'impression', reward_event_type: 'valued', estimated_price: '0.001', ymid: verificationAdId, request_var: 'verification' })) postback.searchParams.set(key, value);
    const callback = await request.get(postback.toString());
    expect(callback.ok()).toBeTruthy();
    await route.fulfill({ response: clickResponse });
  });
  try {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.status')).toContainText('Online');
    const meBefore = await request.get(`${baseURL}/api/me`, { headers: { 'X-Telegram-Init-Data': initData } });
    expect(meBefore.ok()).toBeTruthy();
    const before = await meBefore.json();
    const userId = before.user.id;
    const beforeCoin = Number(before.balances?.COIN || 0);

    await page.evaluate(() => { window.DzMoneyMonetag = { ready: Promise.resolve(), handler: async () => ({ ok: true }) }; });
    const tasksNavigation = page.getByRole('button', { name: '✓ Tasks Earn by completing' });
    await expect(tasksNavigation).toHaveCount(1);
    await tasksNavigation.click();
    await page.locator('[data-task-category="daily"]').click();
    const card = page.locator('.task-card--daily').filter({ has: page.locator('[data-system-key="share_with_friends"]') });
    await expect(card).toBeVisible();
    const shareButton = card.locator('[data-task-action="share_with_friends"]');
    await expect(shareButton).toHaveText('Share');
    const executeWait = page.waitForResponse(r => r.url().endsWith('/api/daily-tasks/execute') && r.request().method() === 'POST');
    await shareButton.click();
    const executed = await executeWait;
    expect(executed.ok()).toBeTruthy();
    const executeBody = await executed.json();
    verificationAdId = executeBody.verificationAdId;
    expect(verificationAdId).toBeTruthy();
    await expect(shareButton).toHaveText('Verify');

    const verifyResponse = page.waitForResponse(r => r.url().endsWith('/api/tasks/click') && r.request().method() === 'POST');
    await shareButton.click();
    const verified = await verifyResponse;
    expect(verified.ok()).toBeTruthy();
    const verifiedBody = await verified.json();
    expect(verifiedBody.clicked).toBe(true);
    expect(verifiedBody.status).toBe('verification_pending');
    await expect.poll(async () => (await request.get(`${baseURL}/api/tasks/attempt/${executeBody.attemptId}`, { headers: { 'X-Telegram-Init-Data': initData } })).json(), { timeout: 10000 }).toMatchObject({ status: 'verified' });
    await expect(page.locator('#rewardPopup')).toContainText('Reward credited');

    const after = await request.get(`${baseURL}/api/me`, { headers: { 'X-Telegram-Init-Data': initData } });
    expect(after.ok()).toBeTruthy();
    const afterBody = await after.json();
    const afterCoin = Number(afterBody.balances.COIN);
    expect(afterCoin).toBeGreaterThan(beforeCoin);
    const ledger = await db.query("SELECT COUNT(*)::int AS count FROM ledger_transactions WHERE user_id=$1 AND transaction_type='REWARD' AND metadata->>'activity_type'='daily'", [userId]);
    expect(ledger.rows[0].count).toBe(1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#coinBalance')).toHaveText(afterCoin.toLocaleString('en-US'));
  } finally { await db.end(); await cleanup(telegramId); }
});
