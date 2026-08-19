const { Pool } = require('pg');
const economy = require('../services/economy-service');

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  max: 20
});

async function query(sql, params) {
  return pool.query(sql, params);
}

async function concurrentSameIdempotency() {
  const key = 'test:same-operation:001';
  const jobs = Array.from({ length: 10 }, () =>
    economy.withTransaction(pool, client => economy.credit({
      client,
      userId: 'test-user',
      currency: 'BUX',
      amount: 10,
      entryType: 'TASK_REWARD',
      referenceType: 'TASK_CLAIM',
      referenceId: 'claim-001',
      idempotencyKey: key,
      metadata: { test: 'same-idempotency' }
    }))
  );
  const results = await Promise.all(jobs);
  const ledger = await query(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount),0) AS total
       FROM ledger_entries WHERE idempotency_key = $1`, [key]);
  const balance = await query(
    `SELECT available_amount, locked_amount FROM wallet_balances
      WHERE user_id='test-user' AND currency='BUX'`);

  if (ledger.rows[0].count !== 1) throw new Error(`Expected 1 ledger row, got ${ledger.rows[0].count}`);
  if (Number(ledger.rows[0].total) !== 10) throw new Error(`Expected +10 BUX, got ${ledger.rows[0].total}`);
  if (Number(balance.rows[0].available_amount) !== 10) throw new Error(`Expected balance 10, got ${balance.rows[0].available_amount}`);
  if (results.some(r => !r || r.amount === undefined)) throw new Error('All callers must receive a valid result');
  console.log('PASS same-idempotency: 10 concurrent requests -> 1 ledger entry, +10 BUX');
}

async function concurrentDifferentCredits() {
  const jobs = Array.from({ length: 10 }, (_, i) =>
    economy.withTransaction(pool, client => economy.credit({
      client,
      userId: 'test-user',
      currency: 'COINS',
      amount: 100,
      entryType: 'AD_REWARD',
      referenceType: 'AD_VIEW',
      referenceId: `ad-${i}`,
      idempotencyKey: `test:different-operation:${i}`,
      metadata: { test: 'different-operations' }
    }))
  );
  await Promise.all(jobs);
  const ledger = await query(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount),0) AS total
       FROM ledger_entries WHERE reference_type='AD_VIEW' AND reference_id LIKE 'ad-%'`);
  const balance = await query(
    `SELECT available_amount FROM wallet_balances
      WHERE user_id='test-user' AND currency='COINS'`);
  if (ledger.rows[0].count !== 10) throw new Error(`Expected 10 ledger rows, got ${ledger.rows[0].count}`);
  if (Number(ledger.rows[0].total) !== 1000) throw new Error(`Expected +1000 COINS, got ${ledger.rows[0].total}`);
  if (Number(balance.rows[0].available_amount) !== 1000) throw new Error(`Expected COINS balance 1000, got ${balance.rows[0].available_amount}`);
  console.log('PASS concurrent credits: 10 different requests -> +1000 COINS');
}

async function concurrentDebitNoDoubleSpend() {
  await economy.withTransaction(pool, client => economy.credit({
    client,
    userId: 'test-user', currency: 'BUX', amount: 50,
    entryType: 'ADMIN_CREDIT', referenceType: 'TEST', referenceId: 'seed',
    idempotencyKey: 'test:seed-bux'
  }));

  const jobs = Array.from({ length: 10 }, (_, i) =>
    economy.withTransaction(pool, client => economy.debit({
      client,
      userId: 'test-user', currency: 'BUX', amount: 10,
      entryType: 'ADMIN_DEBIT', referenceType: 'SPEND_TEST', referenceId: `spend-${i}`,
      idempotencyKey: `test:spend:${i}`
    }).then(() => true).catch(error => {
      if (error.message === 'INSUFFICIENT_AVAILABLE_BALANCE') return false;
      throw error;
    }))
  );
  const results = await Promise.all(jobs);
  const successes = results.filter(Boolean).length;
  if (successes !== 6) throw new Error(`Expected exactly 6 successful debits from 60 requested against 60 available, got ${successes}`);
  const balance = await query(
    `SELECT available_amount FROM wallet_balances WHERE user_id='test-user' AND currency='BUX'`);
  if (Number(balance.rows[0].available_amount) !== 0) throw new Error(`Expected BUX balance 0, got ${balance.rows[0].available_amount}`);
  console.log('PASS concurrent debit: balance never negative and exactly 6 debits succeed');
}

(async () => {
  try {
    await query('TRUNCATE ledger_entries, wallet_balances, idempotency_keys RESTART IDENTITY CASCADE');
    await concurrentSameIdempotency();
    await concurrentDifferentCredits();
    await concurrentDebitNoDoubleSpend();
    console.log('ALL POSTGRES LEDGER CONCURRENCY TESTS PASSED');
  } finally {
    await pool.end();
  }
})().catch(error => {
  console.error('POSTGRES LEDGER TEST FAILED');
  console.error(error.stack || error);
  process.exit(1);
});
