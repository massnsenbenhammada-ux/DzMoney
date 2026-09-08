const ADSGRAM_PROVIDER_ID = 'adsgram';
const ADSGRAM_BLOCK_ID = String(process.env.ADSGRAM_BLOCK_ID || '44442');
const ADSGRAM_ENABLED = process.env.ADSGRAM_ENABLED === 'true';
const ADSGRAM_REWARD_TOKEN = process.env.ADSGRAM_REWARD_TOKEN || '';

function assertAdsgramConfiguration() {
  if (!ADSGRAM_ENABLED) return;
  if (!/^\d+$/.test(ADSGRAM_BLOCK_ID)) throw new Error('AdsGram Block ID must be numeric');
  if (!ADSGRAM_REWARD_TOKEN) throw new Error('ADSGRAM_REWARD_TOKEN is required when AdsGram is enabled');
}

module.exports = { ADSGRAM_PROVIDER_ID, ADSGRAM_BLOCK_ID, ADSGRAM_ENABLED, ADSGRAM_REWARD_TOKEN, assertAdsgramConfiguration };
