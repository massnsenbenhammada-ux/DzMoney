const express = require('express');
const path = require('path');
const { query } = require('./src/db/pool');
const meRoutes = require('./src/http/me-routes');
const { createDailyCheckinRouter } = require('./src/http/daily-checkin-routes');
const { createMonetagPostbackRouter } = require('./src/http/monetag-postback-routes');
const { createTaskRouter } = require('./src/http/task-routes');
const providerRegistry = require('./src/services/ad-provider-registry-runtime');

const app = express();
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, 'public');
const monetagPostbackSecret = process.env.MONETAG_POSTBACK_SECRET;

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));
app.use(express.static(publicDir, { index: 'index.html' }));

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

app.use('/api/me', meRoutes);
app.use('/api/tasks', createTaskRouter({ providerRegistry }));
app.use('/api/daily-checkin', createDailyCheckinRouter({ providerRegistry }));
if (monetagPostbackSecret) {
  app.use('/api/ads/monetag/postback', createMonetagPostbackRouter({
    providerRegistry,
    secret: monetagPostbackSecret
  }));
}

app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((error, _req, res, _next) => {
  console.error('Unhandled request error:', error);
  const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  const payload = { ok: false, error: status === 500 ? 'Internal server error' : error.message };
  if (status === 429 && error.nextEligibleAt) payload.nextEligibleAt = error.nextEligibleAt;
  res.status(status).json(payload);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`DzMoney 2.0 listening on ${port}`);
});
