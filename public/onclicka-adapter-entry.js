const ONCLICKA_PROVIDER = 'onclicka';
const ONCLICKA_SDK_SRC = 'https://js.onclckvd.com/in-stream-ad-admanager/tma.js';
const ONCLICKA_TIMEOUT_MS = 15000;

let initializedSpotId = null;
let showPromise = null;
let sdkLoadPromise = null;

function traceOnclicka(event, value) {
  if (typeof window.__DzMoneyOnclickaTrace === 'function') {
    window.__DzMoneyOnclickaTrace(event, value);
  }
}

function withTimeout(promise, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ONCLICKA_TIMEOUT_MS))
  ]);
}

function loadOnclickaSdkFallback() {
  if (typeof window.initCdTma === 'function') return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;
  const existing = document.querySelector(`script[src="${ONCLICKA_SDK_SRC}"]`);
  const promise = new Promise((resolve, reject) => {
    const fail = message => reject(new Error(message));
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', () => fail('OnClickA TMA SDK script failed to load'), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = ONCLICKA_SDK_SRC;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => fail('OnClickA TMA SDK script failed to load');
    document.head.appendChild(script);
  });
  sdkLoadPromise = withTimeout(promise, 'OnClickA TMA SDK load timed out').catch(error => {
    sdkLoadPromise = null;
    throw error;
  });
  return sdkLoadPromise;
}

async function ensureOnclickaReady(spotId) {
  if (!spotId) throw new Error('OnClickA Spot ID is missing');
  if (initializedSpotId === String(spotId) && showPromise) {
    traceOnclicka('ensure reused cached showPromise', typeof showPromise);
    return showPromise;
  }
  traceOnclicka('ensure initialization started', String(spotId));
  if (typeof window.initCdTma !== 'function') {
    try {
      if (typeof window.DzMoneyLoadOnclickaSdk === 'function') {
        await withTimeout(window.DzMoneyLoadOnclickaSdk(), 'OnClickA SDK load timed out');
      } else {
        await loadOnclickaSdkFallback();
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`OnClickA SDK failed to load: ${reason}`);
    }
  }
  if (typeof window.initCdTma !== 'function') {
    throw new Error('OnClickA SDK loaded, but initCdTma is still unavailable');
  }
  initializedSpotId = String(spotId);
  traceOnclicka('initCdTma invoking', initializedSpotId);
  showPromise = withTimeout(
    Promise.resolve().then(() => window.initCdTma({ id: Number(spotId) })),
    'OnClickA initialization timed out'
  ).catch(error => {
    initializedSpotId = null;
    showPromise = null;
    traceOnclicka('initCdTma failed', error?.message || error);
    throw error;
  });
  showPromise.then(show => traceOnclicka('initCdTma stored result', typeof show), () => {});
  return showPromise;
}

window.DzMoneyOnclicka = {
  provider: ONCLICKA_PROVIDER,
  prepare: ({ spotId } = {}) => {
    traceOnclicka('prepare called', String(spotId || 'missing'));
    const result = ensureOnclickaReady(spotId);
    result.then(value => traceOnclicka('prepare resolved', typeof value), error => traceOnclicka('prepare rejected', error?.message || error));
    return result;
  },
  show: async ({ spotId } = {}) => {
    traceOnclicka('show called', String(spotId || 'missing'));
    const show = await ensureOnclickaReady(spotId);
    traceOnclicka('show received result', typeof show);
    if (typeof show !== 'function') throw new Error('OnClickA show method is unavailable after initialization');
    return withTimeout(
      Promise.resolve().then(() => show()),
      'OnClickA advertisement display timed out'
    );
  }
};
