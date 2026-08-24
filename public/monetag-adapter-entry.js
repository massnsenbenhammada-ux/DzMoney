const MONETAG_ZONE_ID = '11627577';
const MONETAG_HANDLER_NAME = `show_${MONETAG_ZONE_ID}`;
const DEFAULT_HANDLER_TIMEOUT_MS = 15000;

function getHandler() {
  return window[MONETAG_HANDLER_NAME];
}

function callWithTimeout(handler, payload) {
  const timeoutMs = Number.isFinite(Number(payload?.timeout))
    ? Math.max(1000, Number(payload.timeout) * 1000)
    : DEFAULT_HANDLER_TIMEOUT_MS;
  const operation = payload?.type === 'preload' ? 'preload' : 'show';
  return Promise.race([
    Promise.resolve().then(() => handler(payload)),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Monetag ${operation} timed out after ${Math.ceil(timeoutMs / 1000)}s`)), timeoutMs))
  ]);
}

window.DzMoneyMonetag = {
  zoneId: MONETAG_ZONE_ID,
  get handler() {
    const handler = getHandler();
    if (typeof handler !== 'function') return null;
    return payload => callWithTimeout(handler, payload || {});
  },
  provider: 'monetag-sdk-script'
};
