const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');
const loader = fs.readFileSync('public/onclicka-sdk-loader.js', 'utf8');

assert(html.includes('window.__DzMoneyAdProviderConfig=__AD_PROVIDER_CONFIG__'));
assert(html.includes('/onclicka-sdk-loader.js?v=__ASSET_VERSION__'));
assert(loader.includes("document.addEventListener('DOMContentLoaded', preloadOnclicka, { once: true })"));
assert(!loader.includes('setTimeout(preloadOnclicka, 0)'));

console.log('OnClickA preload contract: PASS');
