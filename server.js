const express = require('express');
const { query } = require('./src/db/pool');
const squadRoutes = require('./src/http/squad-routes');

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json());

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

app.use('/api/squad', squadRoutes);

app.use((error, _req, res, _next) => {
  console.error('Unhandled request error:', error);
  const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : error.message });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`DzMoney 2.0 listening on ${port}`);
});
