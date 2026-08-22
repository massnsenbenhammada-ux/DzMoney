import createAdHandler from 'monetag-tg-sdk';
import { MONETAG_ZONE_ID as ZONE_ID } from '../src/config/monetag.js';

const handler = createAdHandler(ZONE_ID);

window.DzMoneyMonetag = {
  zoneId: ZONE_ID,
  handler,
  provider: 'monetag-tg-sdk'
};
