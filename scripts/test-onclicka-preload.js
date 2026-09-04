const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');
const loader = fs.readFileSync('public/onclicka-sdk-loader.js', 'utf8');
const adapter = fs.readFileSync('public/onclicka-adapter-entry.js', 'utf8');

assert(html.includes('window.__DzMoneyAdProviderConfig=__AD_PROVIDER_CONFIG__'));
assert(html.includes('/onclicka-sdk-loader.js?v=__ASSET_VERSION__'));
assert(loader.includes("document.addEventListener('DOMContentLoaded', preloadOnclicka, { once: true })"));
assert(!loader.includes('setTimeout(preloadOnclicka, 0)'));
assert(adapter.includes('ONCLICKA_TIMEOUT_MS = 15000'));
assert(adapter.includes('OnClickA SDK load timed out'));
assert(adapter.includes('OnClickA initialization timed out'));
assert(adapter.includes('OnClickA advertisement display timed out'));
assert(adapter.includes('sdkLoadPromise = null'));
assert(adapter.includes('initializedSpotId = null'));
assert(adapter.includes('showPromise = null'));
assert(adapter.includes('catch(error => {\n    sdkLoadPromise = null;'));
assert(adapter.includes('catch(error => {\n    initializedSpotId = null;\n    showPromise = null;'));
assert(adapter.includes('withTimeout'));

console.log('OnClickA preload and settlement contract: PASS');
