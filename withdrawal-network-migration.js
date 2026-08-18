const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const NETWORK = String(process.env.TON_PAYOUT_NETWORK || 'testnet').trim().toLowerCase();

if (!DATABASE_URL) {
  console.error('Withdrawal network migration: DATABASE_URL is missing.');
} else if (NETWORK !== 'testnet') {
  console.error(`Withdrawal network migration: refusing to run because TON_PAYOUT_NETWORK=${NETWORK}. This build is TESTNET ONLY.`);
} else {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: !/localhost|127\.0\.0\.1/i.test(DATABASE_URL) ? { rejectUnauthorized: false } : undefined
  });

  (async () => {
    try {
      console.log('Withdrawal network migration: START');

      await pool.query(`
        ALTER TABLE withdrawals
        ADD COLUMN IF NOT EXISTS payout_network TEXT;
      `);

      // DzMoney is currently a TESTNET-only payout service. Make the network
      // an explicit database invariant so application inserts cannot silently
      // create an unscoped withdrawal.
      await pool.query(`
        ALTER TABLE withdrawals
        ALTER COLUMN payout_network SET DEFAULT 'testnet';
      `);

      const updated = await pool.query(`
        UPDATE withdrawals
        SET payout_network='testnet'
        WHERE payout_network IS NULL
           OR BTRIM(payout_network)='';
      `);

      console.log(`Withdrawal network migration: normalized ${updated.rowCount} legacy withdrawal(s) to testnet.`);

      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname='withdrawals_payout_network_testnet_only'
          ) THEN
            ALTER TABLE withdrawals
            ADD CONSTRAINT withdrawals_payout_network_testnet_only
            CHECK (LOWER(payout_network)='testnet') NOT VALID;
          END IF;
        END $$;
      `);

      console.log('Withdrawal network migration: TESTNET invariant ready.');
    } catch (error) {
      console.error('Withdrawal network migration FAILED:', error);
      process.exitCode = 1;
    } finally {
      await pool.end().catch(() => {});
      console.log('Withdrawal network migration: END');
    }
  })();
}
