const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('public/gigapub-adapter-entry.js', 'utf8');

assert(source.includes("https://ad.gigapub.tech/script?id="));
assert(source.includes("https://ru-ad.gigapub.tech/script?id="));
assert(source.includes('setTimeout'));
assert(source.includes('15000'));
assert(source.includes('showGiga'));
assert(source.includes('DzMoneyGamingAd'));

// The timeout and native primary-script error must enter one guarded fallback path.
assert(source.includes('let fallbackStarted = false;'));
assert(source.includes('const startFallback = () => {'));
assert(source.includes('if (settled || fallbackStarted) return;'));
assert(source.includes('fallbackStarted = true;'));
assert(source.includes('script.onerror = startFallback;'));
assert(source.includes('startFallback();'));
assert(!source.includes('script.onerror();'));

console.log('GigaPub enhanced reliability contract passed.');
