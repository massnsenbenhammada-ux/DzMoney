const ADSGRAM_PROVIDER_ID = 'adsgram';
const ADSGRAM_BLOCK_ID = String(process.env.ADSGRAM_BLOCK_ID || '44442');
const ADSGRAM_ENABLED = process.env.ADSGRAM_ENABLED === 'true';

function assertAdsgramConfiguration() {
  if (!ADSGRAM_ENABLED) return;
  if (!/^\d+$/.test(ADSGRAM_BLOCK_ID))
    throw new Error('AdsGram Block ID must be numeric');
}

module.exports = {
  ADSGRAM_PROVIDER_ID,
  ADSGRAM_BLOCK_ID,
  ADSGRAM_ENABLED,
  assertAdsgramConfiguration,
};
