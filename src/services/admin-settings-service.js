const { withTransaction, query } = require('../db/pool');

const TON_ADDRESS_KEYS = new Set([
  'deposit.ton.testnet_address',
  'deposit.ton.mainnet_address',
]);

const TON_TAGS = {
  mainnet: new Set([0x11, 0x51]),
  testnet: new Set([0x91, 0xd1]),
};

function crc16Ccitt(data) {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function decodeTonAddress(value) {
  if (typeof value !== 'string') throw new Error('TON address must be a string');
  const address = value.trim();
  if (!/^[A-Za-z0-9_-]{48}$/.test(address)) {
    throw new Error('Invalid TON user-friendly address');
  }
  let bytes;
  try {
    bytes = Buffer.from(address.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  } catch {
    throw new Error('Invalid TON user-friendly address');
  }
  if (bytes.length !== 36) throw new Error('Invalid TON user-friendly address');
  const expected = crc16Ccitt(bytes.subarray(0, 34));
  const actual = bytes.readUInt16BE(34);
  if (expected !== actual) throw new Error('Invalid TON address checksum');
  return { address, tag: bytes[0], workchain: bytes.readInt8(1) };
}

function normalizeTonAddress(value) {
  return decodeTonAddress(value).address;
}

function assertNetworkKey(key) {
  if (!TON_ADDRESS_KEYS.has(key)) throw new Error('Unsupported TON setting');
  return key.endsWith('testnet_address') ? 'testnet' : 'mainnet';
}

function assertAddressNetwork(address, network) {
  const decoded = decodeTonAddress(address);
  if (!TON_TAGS[network]?.has(decoded.tag)) {
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

module.exports = {
  getTonDepositAddresses,
  setTonDepositAddress,
  normalizeTonAddress,
  assertAddressNetwork,
  decodeTonAddress,
};
