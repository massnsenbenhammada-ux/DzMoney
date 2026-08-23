import createAdHandler from 'monetag-tg-sdk';

const MONETAG_ZONE_ID = '11627577';
const handler = createAdHandler(MONETAG_ZONE_ID);

window.DzMoneyMonetag = {
  zoneId: MONETAG_ZONE_ID,
  handler,
  provider: 'monetag-tg-sdk'
};
