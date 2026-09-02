const ONCLICKA_PROVIDER = 'onclicka';
const ONCLICKA_SDK_SRC = 'https://js.onclckvd.com/in-stream-ad-admanager/tma.js';

let initializedSpotId = null;
let showPromise = null;
let sdkLoadPromise = null;

function loadOnclickaSdkFallback() {
  if (typeof window.initCdTma === 'function') return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;
  const existing = document.querySelector(`script[src="${ONCLICKA_SDK_SRC}"]`);
  if (existing) {
    sdkLoadPromise = new Promise((resolve, reject) => {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', () => reject(new Error('OnClickA TMA SDK script failed to load')), { once: true });
    });
    return sdkLoadPromise;
  }
  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = ONCLICKA_SDK_SRC;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('OnClickA TMA SDK script failed to load'));
    document.head.appendChild(script);
  });
  return sdkLoadPromise;
}

async function ensureOnclickaReady(spotId) {
  if (!spotId) throw new Error('OnClickA Spot ID is missing');
  if (initializedSpotId === String(spotId) && showPromise) return showPromise;
  if (typeof window.initCdTma !== 'function') {
    try {
      if (typeof window.DzMoneyLoadOnclickaSdk === 'function') {
        await window.DzMoneyLoadOnclickaSdk();
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
  showPromise = window.initCdTma({ id: Number(spotId) });
  return showPromise;
}

window.DzMoneyOnclicka = {
  provider: ONCLICKA_PROVIDER,
  prepare: ({ spotId } = {}) => ensureOnclickaReady(spotId),
  show: async ({ spotId } = {}) => {
    const show = await ensureOnclickaReady(spotId);
    if (typeof show !== 'function') throw new Error('OnClickA show method is unavailable after initialization');
    return show();
  }
};
