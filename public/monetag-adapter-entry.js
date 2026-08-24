const MONETAG_ZONE_ID = '11627577';
const MONETAG_HANDLER_NAME = `show_${MONETAG_ZONE_ID}`;
const DEFAULT_HANDLER_TIMEOUT_MS = 15000;
const SDK_READY_TIMEOUT_MS = 15000;
const SDK_READY_POLL_MS = 100;

function getHandler() {
  return window[MONETAG_HANDLER_NAME];
}

function getSdkState() {
  const scripts = typeof document === 'undefined' ? [] : document.querySelectorAll('script[data-sdk="show_11627577"]');
  return {
    handlerType: typeof getHandler(),
    sdkScriptPresent: scripts.length > 0,
    sdkScriptLoad: window.__DzMoneyMonetagSdkLoad || 'unknown',
    runtimeEvidence: window.__DzMoneyMonetagRuntime || null
  };
}

function waitForSdkReady() {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const handler = getHandler();
      if (typeof handler === 'function') {
        resolve();
        return;
      }
      if (Date.now() - startedAt >= SDK_READY_TIMEOUT_MS) {
        const state = getSdkState();
        const evidence = state.runtimeEvidence ? `, evidence=${JSON.stringify(state.runtimeEvidence)}` : '';
        reject(new Error(`Monetag SDK handler ${MONETAG_HANDLER_NAME} is unavailable (type=${state.handlerType}, script=${state.sdkScriptPresent ? 'present' : 'missing'}, load=${state.sdkScriptLoad}${evidence})`));
        return;
      }
      setTimeout(check, SDK_READY_POLL_MS);
    };
    check();
  });
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

const sdkReady = waitForSdkReady();

window.DzMoneyMonetag = {
  zoneId: MONETAG_ZONE_ID,
  ready: sdkReady,
  get runtimeEvidence() {
    return window.__DzMoneyMonetagRuntime || null;
  },
  get handler() {
    const handler = getHandler();
    if (typeof handler !== 'function') return null;
    return payload => callWithTimeout(handler, payload || {});
  },
  provider: 'monetag-sdk-script'
};
