const { withTransaction, query } = require('../db/pool');

const TON_ADDRESS_KEYS = new Set([
  'deposit.ton.testnet_address',
  'deposit.ton.mainnet_address',
]);

function normalizeTonAddress(value) {
  if (typeof value !== 'string') throw new Error('TON address must be a string');
  const address = value.trim();
  if (!/^(?:EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$/.test(address)) {
    throw new Error('Invalid TON user-friendly address');
  }
  return address;
}

function assertNetworkKey(key) {
  if (!TON_ADDRESS_KEYS.has(key)) throw new Error('Unsupported TON setting');
  return key.endsWith('testnet_address') ? 'testnet' : 'mainnet';
}

function assertAddressNetwork(address, network) {
  const mainnet = address.startsWith('EQ') || address.startsWith('UQ');
  const testnet = address.startsWith('kQ') || address.startsWith('0Q');
  if ((network === 'mainnet' && !mainnet) || (network === 'testnet' && !testnet)) {
    throw new Error(`TON address does not match ${network} network`);
  }
}

async function getTonDepositAddresses() {
  const result = await query(
    `SELECT key, value FROM admin_settings
     WHERE key IN ('deposit.ton.testnet_address', 'deposit.ton.mainnet_address')
     ORDER BY key`
  );
  return Object.fromEntries(result.rows.map(row => [row.key, row.value]));
}

async function setTonDepositAddress({ key, address, actorTelegramUserId, reason = '' }) {
  const network = assertNetworkKey(key);
  const normalized = normalizeTonAddress(address);
  assertAddressNetwork(normalized, network);
  if (!actorTelegramUserId) throw new Error('Admin actor is required');

  return withTransaction(async client => {
    const current = await client.query('SELECT value FROM admin_settings WHERE key = $1 FOR UPDATE', [key]);
    if (!current.rowCount) throw new Error('TON setting is not initialized');
    const oldValue = current.rows[0].value;
    const newValue = { address: normalized, network };
    await client.query(
      `UPDATE admin_settings SET value = $1::jsonb, updated_at = NOW() WHERE key = $2`,
      [JSON.stringify(newValue), key]
    );
    await client.query(
      `INSERT INTO admin_audit_log(setting_key, old_value, new_value, actor_telegram_user_id)
       VALUES ($1, $2::jsonb, $3::jsonb, $4)`,
      [key, JSON.stringify({ value: oldValue, reason }), JSON.stringify(newValue), actorTelegramUserId]
    );
    return { key, network, address: normalized };
  });
}

module.exports = { getTonDepositAddresses, setTonDepositAddress, normalizeTonAddress, assertAddressNetwork };
