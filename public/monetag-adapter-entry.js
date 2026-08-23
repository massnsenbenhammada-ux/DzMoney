const MONETAG_ZONE_ID = '11627577';
const HANDLER_NAME = `show_${MONETAG_ZONE_ID}`;
const SDK_URL = '//yoszi.com/sdk.js';
const pending = [];
let sdkFailed = false;

function flush() {
  while (pending.length) {
    const [options, resolve, reject] = pending.shift();
    const sdkHandler = window[HANDLER_NAME];
    if (typeof sdkHandler !== 'function') {
      reject(new Error('Monetag SDK did not expose the configured zone handler'));
      continue;
    }
    Promise.resolve(sdkHandler(options)).then(resolve, reject);
  }
}

function handleSdkReady() {
  flush();
}

function handleSdkFailure() {
  sdkFailed = true;
  while (pending.length) {
    pending.shift()[2](new Error('Error communicating with the ad server'));
  }
}

function handler(options) {
  const sdkHandler = window[HANDLER_NAME];
  if (typeof sdkHandler === 'function') return sdkHandler(options);
  if (sdkFailed) return Promise.reject(new Error('Error communicating with the ad server'));
  return new Promise((resolve, reject) => pending.push([options, resolve, reject]));
}

const script = document.createElement('script');
script.src = SDK_URL;
script.dataset.zone = MONETAG_ZONE_ID;
script.dataset.sdk = HANDLER_NAME;
script.addEventListener('load', handleSdkReady, { once: true });
script.addEventListener('error', handleSdkFailure, { once: true });
document.head.appendChild(script);

if (typeof window[HANDLER_NAME] === 'function') handleSdkReady();

window.DzMoneyMonetag = {
  zoneId: MONETAG_ZONE_ID,
  handler,
  provider: 'monetag-tma-sdk'
};
