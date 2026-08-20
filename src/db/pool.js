const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined,
});

async function query(text, params) {
  return pool.query(text, params);
}

async function withTransaction(work, options = {}) {
  const client = await pool.connect();
  try {
    const isolation = options.isolationLevel;
    await client.query(isolation ? `BEGIN ISOLATION LEVEL ${isolation}` : 'BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function withSerializableTransaction(work, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      return await withTransaction(work, { isolationLevel: 'SERIALIZABLE' });
    } catch (error) {
      if (error?.code !== '40001' || attempt === maxRetries - 1) throw error;
    }
  }
  throw new Error('Serializable transaction failed after retries');
}

module.exports = { pool, query, withTransaction, withSerializableTransaction };
