const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');
const loader = fs.readFileSync('public/onclicka-sdk-loader.js', 'utf8');

const configIndex = html.indexOf('window.__DzMoneyAdProviderConfig=__AD_PROVIDER_CONFIG__');
const loaderIndex = html.indexOf('/onclicka-sdk-loader.js?v=__ASSET_VERSION__');
assert(configIndex >= 0, 'ad provider config must be present in index.html');
assert(loaderIndex >= 0, 'OnClickA loader must be present in index.html');
assert(configIndex < loaderIndex, 'OnClickA loader must execute after provider config is initialized');
assert(loader.includes("document.addEventListener('DOMContentLoaded', preloadOnclicka)"));
assert(!loader.includes('setTimeout(preloadOnclicka, 0)'));

console.log('OnClickA preload contract: PASS');
