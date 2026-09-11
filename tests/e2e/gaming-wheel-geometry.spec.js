const { test, expect } = require('@playwright/test');

test('Spin wheel aligns every server result with the pointer', async ({ page }) => {
  const results = ['coin_100', 'coin_1000', 'dzx_1', 'dzx_10', 'dzp_1', 'dzp_10', 'extra_spin', 'none'];
  let nextResult = results[0];

  await page.addInitScript(() => {
    window.matchMedia = query => ({ matches: query.includes('prefers-reduced-motion'), media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } });
  });

  await page.route('**/api/gaming', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, gaming: { account: { spins: 1, axes: 0, energy_remaining: 3 }, activeSession: null, adCounts: { spin: 0, digging: 0 }, config: { dailyAdLimit: 100, digging: { energy: 3 } } } }),
  }));

  await page.route('**/api/gaming/spin', route => route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, duplicate: false, result: { result: nextResult, reward: {} } }),
  }));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-go="gaming"]').first().click();
  await page.locator('[data-gaming-view-link="spin"]').click();
  await expect(page.locator('[data-spin-wheel]')).toBeVisible();

  for (const result of results) {
    nextResult = result;
    await page.locator('[data-spin-action]').click();
    await expect(page.locator('[data-spin-wheel]')).toHaveClass(/is-winner/);

    const angle = await page.locator(`[data-spin-wheel-segment="${result}"]`).evaluate(element => {
      const wheel = element.closest('[data-spin-wheel]');
      const wheelBox = wheel.getBoundingClientRect();
      const labelBox = element.getBoundingClientRect();
      const cx = wheelBox.left + wheelBox.width / 2;
      const cy = wheelBox.top + wheelBox.height / 2;
      const lx = labelBox.left + labelBox.width / 2;
      const ly = labelBox.top + labelBox.height / 2;
      const degrees = Math.atan2(lx - cx, cy - ly) * 180 / Math.PI;
      return (degrees + 360) % 360;
    });

    expect(Math.min(angle, 360 - angle), `result=${result}, pointerAngle=${angle}`).toBeLessThanOrEqual(2);
  }
});
