const { test, expect } = require('@playwright/test');

const tabs = [
  ['Dashboard', 'dashboard', '#dashboardSection'],
  ['Economy', 'economy', '#economySection'],
  ['Users', 'users', '#usersSection'],
  ['Referral', 'referral', '#referralSection'],
  ['Squad', 'squad', '#squadSection'],
  ['Enforcement', 'enforcement', '#enforcementSection'],
  ['Campaigns', 'campaigns', '#adminTaskCampaignSection'],
];

const trackedSections = tabs.map(([, , selector]) => selector);

async function visibleTrackedSections(page) {
  return (
    await Promise.all(
      trackedSections.map(async selector => ({
        selector,
        visible: await page.locator(selector).isVisible(),
      })),
    )
  )
    .filter(section => section.visible)
    .map(section => section.selector);
}

test.describe('Admin panel tabs', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      globalThis.sessionStorage.clear();
      globalThis.Telegram = {
        WebApp: {
          initData: 'e2e-admin-tabs',
          ready() {},
          expand() {},
        },
      };
    });

    await page.route('**/api/admin/**', route => route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'E2E backend bypass' }),
    }));
    await page.route('**/api/admin/dashboard/stream**', route => route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"ok":false}\n\n',
    }));
    await page.route('**://telegram.org/js/telegram-web-app.js', route => route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: '',
    }));

    await page.goto('/admin.html', { waitUntil: 'domcontentloaded' });
  });

  test('shows exactly one section on initial load', async ({ page }) => {
    const visibleSections = await visibleTrackedSections(page);
    expect(visibleSections).toHaveLength(1);
    await expect(page.locator('#dashboardSection')).toBeVisible();
  });

  for (const [label, tabName, sectionSelector] of tabs) {
    test(`switches to ${label} and hides every other section`, async ({ page }) => {
      await page.locator(`.admin-tab[data-admin-tab="${tabName}"]`).click();
      await expect(page.locator(sectionSelector)).toBeVisible();

      for (const selector of trackedSections) {
        if (selector === sectionSelector) continue;
        await expect(page.locator(selector)).toBeHidden();
      }

      const visibleSections = await visibleTrackedSections(page);
      expect(visibleSections).toHaveLength(1);
    });
  }
});
