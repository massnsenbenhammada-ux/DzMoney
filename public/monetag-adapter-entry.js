import createAdHandler from 'monetag-tg-sdk';

const ZONE_ID = '11627577';

const handler = createAdHandler(ZONE_ID);

window.DzMoneyMonetag = {
  zoneId: ZONE_ID,
  handler,
  provider: 'monetag-tg-sdk'
};
