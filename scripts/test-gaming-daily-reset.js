'use strict';

const assert = require('assert');
const { pool, query } = require('../src/db/pool');
const gamingService = require('../src/services/gaming-service');

async function createUser(marker) {
  const result = await query('INSERT INTO users (telegram_user_id, username, first_name) VALUES ($1,$2,$3) RETURNING id', [marker, `gaming_reset_${marker}`, 'Gaming Reset Test']);
  await query("INSERT INTO wallet_accounts(user_id,currency) VALUES($1,'COIN'),($1,'DZX'),($1,'DZP')", [result.rows[0].id]);
  return result.rows[0].id;
}

async function main() {
  const userId = await createUser(`${Date.now()}${Math.floor(Math.random() * 1000000)}`);
  try {
    await query("INSERT INTO gaming_accounts(user_id,axes,energy_remaining) VALUES($1,1,3) ON CONFLICT(user_id) DO UPDATE SET axes=1,energy_remaining=3", [userId]);
    const started = await gamingService.startDigging({ userId });
    const firstSessionId = started.session.id;
    await gamingService.revealDiggingTile({ userId, sessionId: firstSessionId, tileId: 1 });
    await query("UPDATE gaming_accounts SET axes=1 WHERE user_id=$1", [userId]);
    await query("UPDATE gaming_sessions SET created_at=created_at-INTERVAL '1 day' WHERE id=$1", [firstSessionId]);

    const stateAfterRollover = await gamingService.getGamingState({ userId });
    assert.strictEqual(stateAfterRollover.activeSession, null);
    const expired = await query('SELECT status,board FROM gaming_sessions WHERE id=$1', [firstSessionId]);
    assert.strictEqual(expired.rows[0].status, 'expired');
    assert.strictEqual(expired.rows[0].board.filter(tile => tile.revealed).length, 1);

    const fresh = await gamingService.startDigging({ userId });
    assert.notStrictEqual(String(fresh.session.id), String(firstSessionId));
    assert.strictEqual(fresh.session.status, 'active');
    assert.strictEqual(fresh.session.board.filter(tile => tile.revealed).length, 0);
    const account = await query('SELECT axes FROM gaming_accounts WHERE user_id=$1', [userId]);
    assert.strictEqual(Number(account.rows[0].axes), 0, 'new daily board must still consume one Axe');

    console.log('Gaming daily Digging board reset integration: PASS');
  } finally {
    await query(
      `DELETE FROM ledger_entries
       WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE user_id=$1)
          OR wallet_account_id IN (SELECT id FROM wallet_accounts WHERE user_id=$1)`,
      [userId],
    );
    await query('DELETE FROM ledger_transactions WHERE user_id=$1', [userId]);
    await query('DELETE FROM users WHERE id=$1', [userId]);
    await pool.end();
  }
}

main().catch(error => {
  console.error('Gaming daily Digging board reset integration: FAIL');
  console.error(error);
  process.exitCode = 1;
});
