const express = require('express');
const path = require('path');
const fs = require('fs');
const { query } = require('./src/db/pool');
const meRoutes = require('./src/http/me-routes');
const squadRoutes = require('./src/http/squad-routes');
const conversionRoutes = require('./src/http/conversion-routes');
const { createDailyCheckinRouter } = require('./src/http/daily-checkin-routes');
const {
  createDailySystemTaskRouter,
} = require('./src/http/daily-system-task-routes');
const {
  createMonetagPostbackRouter,
} = require('./src/http/monetag-postback-routes');
const {
  createAdsgramRewardRouter,
} = require('./src/http/adsgram-reward-routes');
const {
  createOnclickaPostbackRouter,
} = require('./src/http/onclicka-postback-routes');
const { createTaskRouter } = require('./src/http/task-routes');
const { createCreatorTaskRouter } = require('./src/http/creator-task-routes');
const {
  createAdminDashboardRouter,
} = require('./src/http/admin-dashboard-routes');
const {
  createAdminTonSettingsRouter,
} = require('./src/http/admin-ton-settings-routes');
const { createAdminEconomyRouter } = require('./src/http/admin-economy-routes');
const { createAdminUserRouter } = require('./src/http/admin-user-routes');
const {
  createAdminUserEnforcementRouter,
} = require('./src/http/admin-user-enforcement-routes');
const {
  createAdminReferralRouter,
} = require('./src/http/admin-referral-routes');
const {
  createAdminSquadChallengeRouter,
} = require('./src/http/admin-squad-challenge-routes');
const { createAdminGamingRouter } = require('./src/http/admin-gaming-routes');
const { createPromoCodeRouter } = require('./src/http/promo-code-routes');
const {
  createAdminPromoCodeRouter,
} = require('./src/http/admin-promo-code-routes');
const {
  createAdminTaskCampaignRouter,
} = require('./src/http/admin-task-campaign-routes');
const { createRateLimit } = require('./src/http/rate-limit');
const providerRegistry = require('./src/services/ad-provider-registry-runtime');
const { ADSGRAM_ENABLED } = require('./src/config/adsgram');
const app = express();
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, 'public');
const indexPath = path.join(publicDir, 'index.html');
const monetagPostbackSecret = process.env.MONETAG_POSTBACK_SECRET;
const assetVersion =
  process.env.RAILWAY_GIT_COMMIT_SHA ||
  process.env.GIT_COMMIT_SHA ||
  process.env.RAILWAY_DEPLOYMENT_ID ||
  `runtime-${Date.now()}`;
const indexHtml = fs.readFileSync(indexPath, 'utf8');
function clientAdConfig() {
  const contexts = [
    'task',
    'gaming',
    'daily_checkin',
    'verification',
    'squad',
    'promo',
  ];
  const providers = Object.fromEntries(
    providerRegistry
      .listRegistered()
      .map((id) => {
        const provider = providerRegistry.get(id);
        return provider.enabled
          ? [id, { id: provider.id, ...(provider.clientConfig || {}) }]
          : null;
      })
      .filter(Boolean),
  );
  return {
    providers,
    ...Object.fromEntries(
      contexts.map((context) => [
        context,
        providerRegistry
          .listAvailable(context)
          .map((provider) => providers[provider.id])
          .filter(Boolean),
      ]),
    ),
  };
}
function monetagScriptsForClient() {
  const selected = clientAdConfig();
  const usesMonetag = Boolean(selected.providers.monetag);
  const scripts = [];
  if (usesMonetag)
    scripts.push(
      '<script src="//libtl.com/sdk.js" data-zone="11627577" data-sdk="show_11627577" onload="window.__DzMoneyMonetagSdkLoad=\'loaded\'" onerror="window.__DzMoneyMonetagSdkLoad=\'error\'"></script>',
    );
  if (ADSGRAM_ENABLED)
    scripts.push(
      '<script src="https://sad.adsgram.ai/js/sad.min.js"></script>',
    );
  return scripts.join('');
}
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.locals.adProviderRegistry = providerRegistry;
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '64kb' }));
app.use(
  express.static(publicDir, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store');
        return;
      }
      if (/\.(js|css)$/.test(filePath))
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }),
);
app.get('/health', (_req, res) =>
  res.json({ ok: true, service: 'DzMoney', version: '2.0.0' }),
);
app.get('/health/db', async (_req, res) => {
  try {
    const result = await query('SELECT 1 AS ok');
    res.json({ ok: result.rows[0].ok === 1, database: 'connected' });
  } catch (error) {
    console.error('Database health check failed:', error);
    res.status(503).json({ ok: false, database: 'disconnected' });
  }
});
const publicApiRateLimit = createRateLimit({
  windowMs: 60_000,
  max: 300,
  key: (req) => `ip:${req.ip || 'unknown'}`,
});
app.use('/api', publicApiRateLimit);
app.use('/api/me', meRoutes);
app.use('/api/squad', squadRoutes);
app.use('/api/conversion', conversionRoutes);
app.use('/api/gaming', require('./src/http/gaming-routes'));
app.use('/api/promo', createPromoCodeRouter({ providerRegistry }));
app.use('/api/admin/dashboard', createAdminDashboardRouter());
app.use('/api/admin/economy', createAdminEconomyRouter());
app.use('/api/admin/users', createAdminUserRouter());
app.use('/api/admin/users/enforcement', createAdminUserEnforcementRouter());
app.use('/api/admin/referral', createAdminReferralRouter());
app.use('/api/admin/ton', createAdminTonSettingsRouter());
app.use('/api/admin/squad', createAdminSquadChallengeRouter());
app.use('/api/admin/gaming', createAdminGamingRouter());
app.use('/api/admin/promo', createAdminPromoCodeRouter());
app.use('/api/admin/tasks', createAdminTaskCampaignRouter());
app.use('/api/tasks', createTaskRouter({ providerRegistry }));
app.use('/api/creator/tasks', createCreatorTaskRouter());
app.use('/api/daily-tasks', createDailySystemTaskRouter({ providerRegistry }));
app.use('/api/daily-checkin', createDailyCheckinRouter({ providerRegistry }));
if (monetagPostbackSecret)
  app.use(
    '/api/ads/monetag/postback',
    createMonetagPostbackRouter({
      providerRegistry,
      secret: monetagPostbackSecret,
    }),
  );
app.use('/api/ads/adsgram/reward', createAdsgramRewardRouter());
app.use(
  '/api/ads/onclicka',
  createOnclickaPostbackRouter({ providerRegistry }),
);
app.get('/', (_req, res) => {
  const html = indexHtml
    .replaceAll('__ASSET_VERSION__', assetVersion)
    .replaceAll(
      '__MONETAG_SCRIPTS__',
      monetagScriptsForClient().replaceAll('__ASSET_VERSION__', assetVersion),
    )
    .replaceAll(
      '__AD_PROVIDER_CONFIG__',
      JSON.stringify(clientAdConfig()).replace(/</g, '\\u003c'),
    )
    .replace(
      '</head>',
      `<link rel="stylesheet" href="/premium-ui.css?v=${assetVersion}"></head>`,
    )
    .replace(
      '</body>',
      `<script src="/premium-ui.js?v=${assetVersion}"></script><script src="/admin-entry.js?v=${assetVersion}"></script><script src="/adsgram-adapter-entry.js?v=${assetVersion}"></script></body>`,
    );
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(html);
});
app.use((error, _req, res, _next) => {
  const status = Number(error.statusCode || 500);
  if (status >= 500) console.error(error);
  res
    .status(status)
    .json({ ok: false, error: error.message || 'Internal server error' });
});
if (require.main === module)
  app.listen(port, () => console.log(`DzMoney listening on ${port}`));
module.exports = app;
