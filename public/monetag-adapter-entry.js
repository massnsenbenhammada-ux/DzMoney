const MONETAG_ZONE_ID = '11627577';
const MONETAG_HANDLER_NAME = `show_${MONETAG_ZONE_ID}`;

function getHandler() {
  return window[MONETAG_HANDLER_NAME];
}

window.DzMoneyMonetag = {
  zoneId: MONETAG_ZONE_ID,
  get handler() {
    return getHandler();
  },
  provider: 'monetag-sdk-script'
};
