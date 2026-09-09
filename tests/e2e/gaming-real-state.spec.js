'use strict';
const crypto = require('node:crypto');
const { test, expect } = require('@playwright/test');
const { Pool } = require('pg');

function buildInitData(userId) {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: userId, first_name: 'Phase 14 Gaming E2E' }) });
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

test('Gaming WATCH AD credits through UI and canonical Economy/Ledger', async ({ page, request, baseURL }) => {
  test.setTimeout(60000);
  const telegramId = String(BigInt(process.env.TEST_TELEGRAM_USER_ID || '900000000') + BigInt(Date.now() % 1000000));
  const initData = buildInitData(telegramId);
  const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') browserErrors.push(`console.${message.type()}: ${message.text()}`);
  });
  page.on('response', async response => {
    if (!response.url().endsWith('/api/gaming') || response.request().method() !== 'GET') return;
    try {
      console.log(`GAMING_API_RESPONSE ${response.status()} ${JSON.stringify(await response.json())}`);
    } catch (error) {
      console.log(`GAMING_API_RESPONSE_BODY_ERROR ${error.message}`);
    }
  });
  await page.addInitScript(({ data }) => { window.Telegram = { WebApp: { initData: data, ready() {}, expand() {}, openTelegramLink() {} } }; }, { data: initData });
  await page.route('**://telegram.org/js/telegram-web-app.js', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  try {
    const gamingLoad = page.waitForResponse(response => response.url().endsWith('/api/gaming') && response.request().method() === 'GET');
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.status')).toContainText('Online');
    const before = await request.get(`${baseURL}/api/gaming`, { headers: { 'X-Telegram-Init-Data': initData } });
    expect(before.ok()).toBeTruthy();
    const beforeState = await before.json();
    const beforeSpins = Number(beforeState.gaming.account.spins);
    const me = await request.get(`${baseURL}/api/me`, { headers: { 'X-Telegram-Init-Data': initData } });
    expect(me.ok()).toBeTruthy();
    const userId = (await me.json()).user.id;
    await gamingLoad;

    await page.evaluate(({ data }) => {
      window.DzMoneyAdClient = { getProvider(id) { if (id !== 'gigapub') return null; return { ready: Promise.resolve(), handler: async payload => { const r = await fetch('/api/gaming/ads/complete', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': data }, body: JSON.stringify({ adEventId: payload.adEventId }) }); const b = await r.json(); if (!r.ok) throw new Error(b.error || 'completion failed'); return b; } }; } };
    }, { data: initData });

    await page.getByRole('button', { name: /🎮 Gaming Spin & Digging/ }).click();
    console.log(`GAMING_NAV_BEFORE_SPIN ${JSON.stringify(await page.evaluate(() => ({ active: document.querySelector('.page.active')?.dataset.page, home: document.querySelector('[data-gaming-view="home"]')?.className, spin: document.querySelector('[data-gaming-view="spin"]')?.className, buttons: [...document.querySelectorAll('[data-gaming-view-link]')].map(el => ({ text: el.textContent.trim(), link: el.dataset.gamingViewLink })) })))}`);
    await page.getByRole('button', { name: /Spin Use Spins for one server-side result/ }).click();
    console.log(`GAMING_NAV_AFTER_SPIN ${JSON.stringify(await page.evaluate(() => ({ active: document.querySelector('.page.active')?.dataset.page, home: document.querySelector('[data-gaming-view="home"]')?.className, spin: document.querySelector('[data-gaming-view="spin"]')?.className, ad: document.querySelector('[data-gaming-ad="spin"]')?.className, errors: window.__dzmoneyGamingErrors || [] })))}`);
    const button = page.locator('[data-gaming-ad="spin"]');
    try {
      await expect(button).toBeVisible();
    } catch (error) {
      const diagnostic = await page.evaluate(() => ({
        active: document.querySelector('.page.active')?.dataset.page,
        home: document.querySelector('[data-gaming-view="home"]')?.className,
        spin: document.querySelector('[data-gaming-view="spin"]')?.className,
        ad: document.querySelector('[data-gaming-ad="spin"]')?.className,
        gamingViews: [...document.querySelectorAll('[data-gaming-view]')].map(el => ({ view: el.dataset.gamingView, className: el.className, hidden: el.hidden, rect: el.getBoundingClientRect().toJSON() }))
      }));
      console.log(`GAMING_NAV_FAILURE ${JSON.stringify({ browserErrors, diagnostic })}`);
      throw error;
    }
    const startWait = page.waitForResponse(r => r.url().endsWith('/api/gaming/ads/start') && r.request().method() === 'POST');
    const completeWait = page.waitForResponse(r => r.url().endsWith('/api/gaming/ads/complete') && r.request().method() === 'POST');
    await button.click();
    const started = await startWait;
    expect(started.status()).toBe(201);
    const startBody = await started.json();
    expect(startBody.providerId).toBe('gigapub');
    expect(startBody.adEventId).toBeTruthy();
    const completed = await completeWait;
    expect(completed.ok()).toBeTruthy();
    expect((await completed.json()).rewarded).toBe(true);
    await expect(page.locator('#rewardPopup')).toContainText('Reward credited');

    const after = await request.get(`${baseURL}/api/gaming`, { headers: { 'X-Telegram-Init-Data': initData } });
    const afterState = await after.json();
    expect(Number(afterState.gaming.account.spins)).toBe(beforeSpins + 1);
    const ledger = await db.query('SELECT COUNT(*)::int AS count FROM ledger_transactions WHERE user_id=$1 AND idempotency_key=$2', [userId, `gaming:ad:${startBody.adEventId}`]);
    expect(ledger.rows[0].count).toBe(1);
    const duplicate = await request.post(`${baseURL}/api/gaming/ads/complete`, { headers: { 'X-Telegram-Init-Data': initData }, data: { adEventId: startBody.adEventId } });
    expect(duplicate.ok()).toBeTruthy();
    expect((await duplicate.json()).duplicate).toBe(true);
    const reloadGamingLoad = page.waitForResponse(response => response.url().endsWith('/api/gaming') && response.request().method() === 'GET');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await reloadGamingLoad;
    await page.getByRole('button', { name: /🎮 Gaming Spin & Digging/ }).click();
    await page.getByRole('button', { name: /Spin Use Spins for one server-side result/ }).click();
    await expect(page.locator('[data-spin-balance]')).toHaveText(String(beforeSpins + 1));
  } finally { await db.end(); await cleanup(telegramId); }
});
