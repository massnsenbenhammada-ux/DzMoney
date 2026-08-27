const express = require('express');
const path = require('path');
const fs = require('fs');
const { query } = require('./src/db/pool');
const meRoutes = require('./src/http/me-routes');
const { createDailyCheckinRouter } = require('./src/http/daily-checkin-routes');
const { createDailySystemTaskRouter } = require('./src/http/daily-system-task-routes');
const { createMonetagPostbackRouter } = require('./src/http/monetag-postback-routes');
const { createOnclickaPostbackRouter } = require('./src/http/onclicka-postback-routes');
const { createTaskRouter } = require('./src/http/task-routes');
const { createCreatorTaskRouter } = require('./src/http/creator-task-routes');
const { createRateLimit } = require('./src/http/rate-limit');
const providerRegistry = require('./src/services/ad-provider-registry-runtime');

const app = express();
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, 'public');
const indexPath = path.join(publicDir, 'index.html');
const monetagPostbackSecret = process.env.MONETAG_POSTBACK_SECRET;
const onclickaConfirmationSecret = process.env.ONCLICKA_CONFIRMATION_SECRET;
const assetVersion = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'dev';
const indexHtml = fs.readFileSync(indexPath, 'utf8');

function clientAdConfig() {
  return Object.fromEntries(['daily_checkin', 'verification'].map(context => {
    const provider = providerRegistry.listAvailable(context)[0] || null;
    return [context, provider ? { id: provider.id, ...(provider.clientConfig || {}) } : null];
  }));
}

function monetagScriptsForClient() {
  const selected = clientAdConfig();
  const usesMonetag = Object.values(selected).some(provider => provider?.id === 'monetag');
  if (!usesMonetag) return '';
  return '<script src="//libtl.com/sdk.js" data-zone="11627577" data-sdk="show_11627577" onload="window.__DzMoneyMonetagSdkLoad=\'loaded\'" onerror="window.__DzMoneyMonetagSdkLoad=\'error\'"></script>';
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.json({ limit: '64kb' }));
app.use(express.static(publicDir, {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store');
      return;
    }
    if (/\.(js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'DzMoney', version: '2.0.0' });
});

app.get('/health/db', async (_req, res) => {
  try {
    const result = await query('SELECT 1 AS ok');
    res.json({ ok: result.rows[0].ok === 1, database: 'connected' });
  } catch (error) {
    console.error('Database health check failed:', error);
    res.status(503).json({ ok: false, database: 'disconnected' });
  }
});

const publicApiRateLimit = createRateLimit({ windowMs: 60_000, max: 300, key: req => `ip:${req.ip || 'unknown'}` });
app.use('/api', publicApiRateLimit);
app.use('/api/me', meRoutes);
app.use('/api/tasks', createTaskRouter({ providerRegistry }));
app.use('/api/creator/tasks', createCreatorTaskRouter());
app.use('/api/daily-tasks', createDailySystemTaskRouter({ providerRegistry }));
app.use('/api/daily-checkin', createDailyCheckinRouter({ providerRegistry }));
if (monetagPostbackSecret) {
  app.use('/api/ads/monetag/postback', createMonetagPostbackRouter({ providerRegistry, secret: monetagPostbackSecret }));
}
if (onclickaConfirmationSecret) {
  app.use('/api/ads/onclicka', createOnclickaPostbackRouter({ providerRegistry, secret: onclickaConfirmationSecret }));
}

app.get('/', (_req, res) => {
  const html = indexHtml
    .replaceAll('__ASSET_VERSION__', assetVersion)
    .replaceAll('__MONETAG_SCRIPTS__', monetagScriptsForClient().replaceAll('__ASSET_VERSION__', assetVersion))
    .replaceAll('__AD_PROVIDER_CONFIG__', JSON.stringify(clientAdConfig()).replace(/</g, '\\u003c'));
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(html);
});

app.use((error, _req, res, _next) => {
  console.error('Unhandled request error:', error);
  const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  const payload = { ok: false, error: status === 500 ? 'Internal server error' : error.message };
  if (error.nextEligibleAt) payload.nextEligibleAt = error.nextEligibleAt;
  if (status === 429 && error.retryAfterSeconds) payload.retryAfterSeconds = error.retryAfterSeconds;
  res.status(status).json(payload);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`DzMoney 2.0 listening on ${port}`);
});
