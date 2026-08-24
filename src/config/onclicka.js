const ONCLICKA_SPOT_ID = String(process.env.ONCLICKA_SPOT_ID || '6134799');
const ONCLICKA_ENABLED = process.env.ONCLICKA_ENABLED === 'true';
const ONCLICKA_PRIORITY = Number(process.env.ONCLICKA_PRIORITY || 110);
const ONCLICKA_CONTEXTS = ['daily_checkin', 'verification'];

module.exports = {
  ONCLICKA_SPOT_ID,
  ONCLICKA_ENABLED,
  ONCLICKA_PRIORITY,
  ONCLICKA_CONTEXTS
};
