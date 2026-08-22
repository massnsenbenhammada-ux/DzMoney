const ZONE_ID = '11627577';
const GLOBAL_NAME = `show_${ZONE_ID}`;
const SDK_URL = 'https://libtl.com/sdk.js';

let sdkPromise = null;

function getGlobal() {
  return typeof window[GLOBAL_NAME] === 'function' ? window[GLOBAL_NAME] : null;
}

function loadSdk() {
  const existing = getGlobal();
  if (existing) return Promise.resolve(existing);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const current = Array.from(document.scripts).find(
      (script) => script.src === SDK_URL && script.dataset.zone === ZONE_ID
    );

    const script = current || document.createElement('script');

    const finish = () => {
      const api = getGlobal();
      if (api) resolve(api);
      else reject(new Error(`Monetag SDK loaded but ${GLOBAL_NAME} was not created`));
    };

    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${SDK_URL}`)), { once: true });

    if (!current) {
      script.src = SDK_URL;
      script.async = true;
      script.dataset.zone = ZONE_ID;
      script.dataset.sdk = GLOBAL_NAME;
      (document.head || document.documentElement).appendChild(script);
    }
  });

  return sdkPromise;
}

const handler = async (options = {}) => {
  const api = await loadSdk();
  return api(options);
};

window.DzMoneyMonetag = {
  zoneId: ZONE_ID,
  handler,
  provider: 'monetag-direct-script',
  sdkUrl: SDK_URL,
  diagnostic: {
    sdkUrl: SDK_URL,
    globalName: GLOBAL_NAME,
    getSnapshot() {
      return {
        sdkUrl: SDK_URL,
        globalName: GLOBAL_NAME,
        globalType: typeof window[GLOBAL_NAME],
        globalReady: typeof window[GLOBAL_NAME] === 'function',
        sdkScripts: Array.from(document.scripts)
          .filter((script) => script.src.includes('libtl.com/sdk.js'))
          .map((script) => ({ src: script.src, async: script.async, zone: script.dataset.zone, sdk: script.dataset.sdk }))
      };
    }
  }
};

loadSdk().catch(() => {});
