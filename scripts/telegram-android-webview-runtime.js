const fs = require('node:fs');
const { _android: android } = require('playwright');

const packagePath = process.env.TELEGRAM_PACKAGE_FILE || '/tmp/dzmoney-telegram-package';
const packageName = fs.readFileSync(packagePath, 'utf8').trim();
if (!packageName) throw new Error('Telegram Android package was not discovered');

(async () => {
  const devices = await android.devices();
  if (!devices.length) throw new Error('No Android device detected by Playwright');

  const device = devices[0];
  console.log(`ANDROID_MODEL=${device.model()}`);
  console.log(`ANDROID_SERIAL=${device.serial()}`);
  console.log(`TELEGRAM_PACKAGE=${packageName}`);

  const webviews = await device.webViews();
  console.log(`OPEN_WEBVIEWS=${webviews.length}`);
  for (const webview of webviews) {
    console.log(`WEBVIEW_PACKAGE=${webview.pkg()}`);
    console.log(`WEBVIEW_PID=${webview.pid()}`);
  }

  const webview = await device.webView({ pkg: packageName, timeout: 15000 });
  const page = await webview.page();
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});

  const snapshot = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    telegram: Boolean(window.Telegram),
    webApp: Boolean(window.Telegram?.WebApp),
    initDataPresent: Boolean(window.Telegram?.WebApp?.initData),
    initDataLength: window.Telegram?.WebApp?.initData?.length || 0,
    initDataUnsafeUserId: window.Telegram?.WebApp?.initDataUnsafe?.user?.id ?? null,
    platform: window.Telegram?.WebApp?.platform ?? null,
    version: window.Telegram?.WebApp?.version ?? null,
  }));

  console.log(`WEBVIEW_URL=${snapshot.url}`);
  console.log(`WEBVIEW_TITLE=${snapshot.title}`);
  console.log(`TELEGRAM_WEBAPP=${snapshot.webApp}`);
  console.log(`TELEGRAM_INITDATA_PRESENT=${snapshot.initDataPresent}`);
  console.log(`TELEGRAM_INITDATA_LENGTH=${snapshot.initDataLength}`);
  console.log(`TELEGRAM_USER_ID=${snapshot.initDataUnsafeUserId ?? ''}`);
  console.log(`TELEGRAM_PLATFORM=${snapshot.platform ?? ''}`);
  console.log(`TELEGRAM_WEBAPP_VERSION=${snapshot.version ?? ''}`);

  const apiMe = await page.evaluate(async () => {
    const response = await fetch('/api/me', { credentials: 'include' });
    return { status: response.status, body: await response.text() };
  });
  console.log(`API_ME_STATUS=${apiMe.status}`);
  console.log(`API_ME_BODY=${apiMe.body.slice(0, 1000)}`);

  if (!snapshot.webApp) {
    throw new Error('Telegram WebApp bridge is unavailable in the detected Android WebView');
  }

  if (!snapshot.initDataPresent) {
    throw new Error('Telegram WebApp initData is missing; this is not authenticated Mini App evidence');
  }

  if (apiMe.status !== 200) {
    throw new Error(`Authenticated Mini App /api/me did not return 200 (got ${apiMe.status})`);
  }
})();
