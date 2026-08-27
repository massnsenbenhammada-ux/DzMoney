'use strict';

const { withTransaction, query } = require('../db/pool');
const { postEconomyTransactionOnClient, TON_DZX } = require('./economy-service');
const { verifyTonDeposit } = require('./ton-blockchain-verifier');
const { getTonDepositAddresses, normalizeTonAddress } = require('./admin-settings-service');

const NUMERIC_PATTERN = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
const NUMERIC_SCALE = 9;
const TON_NETWORKS = new Set(['mainnet', 'testnet']);

function positiveNumeric(value, name) {
  const text = String(value).trim();
  if (!NUMERIC_PATTERN.test(text)) throw new Error(`${name} must be a valid decimal number`);
  const [integerPart, fractionPart = ''] = text.replace('-', '').split('.');
  if (integerPart.replace(/^0+/, '').length > 21 || fractionPart.length > NUMERIC_SCALE) throw new Error(`${name} exceeds NUMERIC(30,9) precision`);
  if (text.startsWith('-') || /^0+(?:\.0*)?$/.test(text)) throw new Error(`${name} must be a positive number`);
  return text;
}
async function settingNumber(client, key, fallback) {
  const result = await client.query('SELECT value FROM admin_settings WHERE key=$1', [key]);
  if (!result.rowCount) return fallback;
  const n = Number(result.rows[0].value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
async function settingBoolean(client, key, fallback) {
  const result = await client.query('SELECT value FROM admin_settings WHERE key=$1', [key]);
  if (!result.rowCount) return fallback;
  const value = result.rows[0].value;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 'false') return value === 'true';
  return fallback;
}
async function settingNetwork(client) {
  const result = await client.query('SELECT value FROM admin_settings WHERE key=$1', ['deposit.ton.active_network']);
  const value = result.rowCount ? result.rows[0].value : 'mainnet';
  const network = typeof value === 'string' ? value : value?.network;
  if (!TON_NETWORKS.has(network)) throw new Error('Invalid configured TON deposit network');
  return network;
}
async function getDepositSettings() {
  const result = await query(`SELECT key,value FROM admin_settings WHERE key LIKE 'deposit.%' ORDER BY key`);
  return Object.fromEntries(result.rows.map(row => [row.key, row.value]));
}
function assertTxHash(txHash) {
  if (typeof txHash !== 'string' || !/^[0-9a-fA-F]{64}$/.test(txHash.trim())) throw new Error('txHash must be a 64-character hexadecimal hash');
  return txHash.trim().toLowerCase();
}
function tonToNano(value) {
  const text = positiveNumeric(value, 'tonAmount');
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > 9) throw new Error('tonAmount exceeds nanoTON precision');
  return BigInt(whole) * 1000000000n + BigInt((fraction + '000000000').slice(0, 9));
}
async function expireStalePendingDeposits(client, userId, timeoutHours) {
  await client.query(`UPDATE deposits SET status='REJECTED',metadata=metadata || jsonb_build_object('rejection_reason','PENDING_TIMEOUT','rejected_at',NOW()),updated_at=NOW() WHERE user_id=$1 AND status='PENDING' AND created_at <= NOW() - ($2::numeric * INTERVAL '1 hour')`, [userId, timeoutHours]);
}
async function reserveDailyDepositQuota(client, userId, tonAmount) {
  const limit = await settingNumber(client, 'deposit.daily_limit_ton', 10);
  await client.query(`INSERT INTO deposit_daily_usage (user_id,usage_date,ton_used) VALUES ($1,CURRENT_DATE,0) ON CONFLICT (user_id,usage_date) DO NOTHING`, [userId]);
  const result = await client.query(`UPDATE deposit_daily_usage SET ton_used=ton_used+$2::numeric,updated_at=NOW() WHERE user_id=$1 AND usage_date=CURRENT_DATE AND ton_used+$2::numeric <= $3::numeric RETURNING ton_used,GREATEST($3::numeric-ton_used,0) AS remaining`, [userId, tonAmount, String(limit)]);
  if (!result.rowCount) throw new Error(`Daily deposit limit exceeded: ${limit} TON`);
  return { limit, used:result.rows[0].ton_used, remaining:result.rows[0].remaining };
}
async function creditConfirmedDeposit(client, deposit, verification, extraMetadata = {}) {
  return postEconomyTransactionOnClient(client, { idempotencyKey:`deposit:${deposit.id}`, userId:deposit.user_id, type:'DEPOSIT', metadata:{ source:'deposit',deposit_id:deposit.id,blockchain:deposit.blockchain,tx_hash:deposit.tx_hash,ton_amount:deposit.ton_amount,dzx_amount:deposit.dzx_amount,confirmation_count:deposit.confirmation_count,required_confirmations:deposit.required_confirmations,blockchain_finality:verification.finality,blockchain_network:verification.network,...extraMetadata }, movements:[{ currency:'DZX',amount:deposit.dzx_amount,source:'deposit' }] });
}
async function calculateDZX(client, tonAmount) {
  const rate = await settingNumber(client, 'economy.dzx_per_ton', TON_DZX);
  const result = await client.query('SELECT $1::numeric * $2::numeric AS dzx_amount', [tonAmount, String(rate)]);
  return { rate, dzxAmount:result.rows[0].dzx_amount };
}
async function processDeposit({ idempotencyKey,userId,txHash,tonAmount,confirmationCount=0,metadata={} }) {
  if (!idempotencyKey) throw new Error('idempotencyKey is required');
  if (!userId) throw new Error('userId is required');
  const hash = assertTxHash(txHash); const amount = positiveNumeric(tonAmount,'tonAmount');
  const confirmations = Number(confirmationCount);
  if (!Number.isInteger(confirmations) || confirmations < 0) throw new Error('confirmationCount must be a non-negative integer');
  if (confirmations > 0) throw new Error('Blockchain confirmation must come from TON Evidence Verifier');
  return withTransaction(async client => {
    if (!(await settingBoolean(client,'deposit.enabled',true))) throw new Error('Deposits are disabled');
    const network = await settingNetwork(client); const timeoutHours = await settingNumber(client,'deposit.pending_timeout_hours',24);
    await expireStalePendingDeposits(client,userId,timeoutHours);
    const existingTx = await client.query('SELECT * FROM deposits WHERE tx_hash=$1 FOR SHARE',[hash]);
    if (existingTx.rowCount && existingTx.rows[0].idempotency_key !== idempotencyKey) throw new Error('Blockchain transaction has already been recorded');
    const requiredConfirmations = Math.floor(await settingNumber(client,'deposit.required_confirmations',1));
    const { rate,dzxAmount } = await calculateDZX(client,amount);
    const inserted = await client.query(`INSERT INTO deposits (idempotency_key,user_id,blockchain,network,tx_hash,ton_amount,dzx_amount,confirmation_count,required_confirmations,status,metadata,confirmed_at) VALUES ($1,$2,'TON',$3,$4,$5,$6,0,$7,'PENDING',$8,NULL) ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`, [idempotencyKey,userId,network,hash,amount,dzxAmount,requiredConfirmations,{...metadata,source:'deposit',network,rate_dzx_per_ton:rate}]);
    if (!inserted.rowCount) {
      const existing = await client.query('SELECT * FROM deposits WHERE idempotency_key=$1 FOR SHARE',[idempotencyKey]);
      if (!existing.rowCount) throw new Error('Unable to resolve idempotent deposit');
      const previous = existing.rows[0];
      if (String(previous.user_id)!==String(userId) || previous.tx_hash!==hash || previous.ton_amount!==amount) throw new Error('Idempotency key was already used with different deposit data');
      return { deposit:previous,duplicate:true,credited:previous.status==='CONFIRMED' };
    }
    return { deposit:inserted.rows[0],duplicate:false,credited:false };
  });
}
async function verifyStoredDeposit(deposit) {
  if (!TON_NETWORKS.has(deposit.network)) throw new Error('Deposit has no valid TON network');
  const addresses = await getTonDepositAddresses();
  const configured = addresses[`deposit.ton.${deposit.network}_address`];
  if (!configured) throw new Error(`TON ${deposit.network} deposit address is not configured`);
  const expectedDestination = normalizeTonAddress(configured.address || configured);
  return verifyTonDeposit({ network:deposit.network,txHash:deposit.tx_hash,expectedAmountTon:deposit.ton_amount,expectedDestination,apiKey:process.env.TONCENTER_API_KEY,baseUrl:process.env.TONCENTER_API_BASE_URL });
}
async function confirmDeposit({ idempotencyKey,metadata={} }) {
  if (!idempotencyKey) throw new Error('idempotencyKey is required');
  const initial = await query('SELECT * FROM deposits WHERE idempotency_key=$1',[idempotencyKey]);
  if (!initial.rowCount) throw new Error('Deposit not found');
  const before = initial.rows[0];
  if (before.status==='REJECTED') throw new Error('Rejected deposit cannot be confirmed');
  if (before.status==='CONFIRMED') return { deposit:before,duplicate:true,credited:true };
  const verification = await verifyStoredDeposit(before);
  return withTransaction(async client => {
    const row = await client.query('SELECT * FROM deposits WHERE idempotency_key=$1 FOR UPDATE',[idempotencyKey]);
    if (!row.rowCount) throw new Error('Deposit not found');
    const deposit = row.rows[0];
    if (deposit.status==='REJECTED') throw new Error('Rejected deposit cannot be confirmed');
    if (deposit.status==='CONFIRMED') return { deposit,duplicate:true,credited:true };
    if (deposit.tx_hash!==before.tx_hash || deposit.network!==before.network || deposit.ton_amount!==before.ton_amount) throw new Error('Deposit changed during blockchain verification');
    const timeoutHours = await settingNumber(client,'deposit.pending_timeout_hours',24);
    if (new Date(deposit.created_at).getTime() <= Date.now()-timeoutHours*60*60*1000) {
      const rejected = await client.query(`UPDATE deposits SET status='REJECTED',metadata=metadata || jsonb_build_object('rejection_reason','PENDING_TIMEOUT','rejected_at',NOW()),updated_at=NOW() WHERE id=$1 RETURNING *`,[deposit.id]);
      return { deposit:rejected.rows[0],duplicate:false,credited:false,expired:true };
    }
    if (verification.status!=='VERIFIED') return { deposit,duplicate:false,credited:false,held:true,reason:verification.reason||'BLOCKCHAIN_EVIDENCE_NOT_VERIFIED' };
    await reserveDailyDepositQuota(client,deposit.user_id,deposit.ton_amount);
    const economy = await creditConfirmedDeposit(client,deposit,verification,metadata);
    const updated = await client.query(`UPDATE deposits SET status='CONFIRMED',confirmation_count=$1,confirmed_at=NOW(),metadata=metadata || $2::jsonb,updated_at=NOW() WHERE id=$3 RETURNING *`, [deposit.required_confirmations,JSON.stringify({...metadata,blockchain_finality:verification.finality,blockchain_network:verification.network,masterchain_seqno:verification.masterchainSeqno}),deposit.id]);
    return { deposit:updated.rows[0],economy,duplicate:false,credited:true };
  });
}
async function getDepositByTxHash(txHash) {
  const result = await query('SELECT * FROM deposits WHERE tx_hash=$1',[assertTxHash(txHash)]);
  return result.rows[0] || null;
}
module.exports = { getDepositSettings,processDeposit,confirmDeposit,getDepositByTxHash };
