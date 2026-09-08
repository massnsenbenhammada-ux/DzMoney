'use strict';

const crypto = require('node:crypto');
const { test, expect } = require('@playwright/test');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function buildInitData(userId) {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('user', JSON.stringify({ id: userId, first_name: 'DzMoney Squad E2E' }));
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(required('BOT_TOKEN')).digest();
  params.set('hash', crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));
  return params.toString();
}

test('real Squad WATCH AD completes Monetag then AdsGram rotation', async ({ page, request }) => {
  if (process.env.REAL_SQUAD_ADS_E2E !== '1') test.skip(true, 'Explicit real-provider release gate');
  const baseUrl = process.env.REAL_SQUAD_ADS_BASE_URL || 'https://dzmoney-production.up.railway.app';
  const baseUserId = BigInt(required('TEST_TELEGRAM_USER_ID'));
  const telegramUserId = String(baseUserId + BigInt(Date.now() % 1000000));
  const initData = buildInitData(telegramUserId);
  await page.addInitScript(({ telegramInitData }) => {
    window.Telegram = { WebApp: { initData: telegramInitData, ready() {}, expand() {} } };
  }, { telegramInitData: initData });
  await page.route('**://telegram.org/js/telegram-web-app.js', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.status')).toContainText('Online', { timeout: 15000 });
  await page.locator('[data-go="squad"]').click();
  await expect(page.locator('[data-squad-ad]')).toBeVisible({ timeout: 15000 });

  const providers = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const startResponse = page.waitForResponse(response => response.url().endsWith('/api/tasks/advertisement/start') && response.request().method() === 'POST');
    await page.locator('[data-squad-ad]').click();
    const started = await startResponse;
    expect(started.ok()).toBeTruthy();
    const body = await started.json();
    expect(body.adEventId).toBeTruthy();
    expect(body.externalAdId).toBeTruthy();
    providers.push(body.providerId);
    await expect.poll(async () => page.locator('[data-squad-ad-status]').textContent(), { timeout: 120000 }).toContain('Verified.');
    if (attempt === 0) await page.waitForTimeout(1000);
  }

  expect(providers).toEqual(['monetag', 'adsgram']);
  const me = await request.get(`${baseUrl}/api/me`, { headers: { 'X-Telegram-Init-Data': initData } });
  expect(me.ok()).toBeTruthy();
});
