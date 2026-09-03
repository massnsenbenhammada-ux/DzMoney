const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('public/gigapub-adapter-entry.js', 'utf8');

assert(source.includes("https://ad.gigapub.tech/script?id="));
assert(source.includes("https://ru-ad.gigapub.tech/script?id="));
assert(source.includes('setTimeout'));
assert(source.includes('15000'));
assert(source.includes('script.onerror'));
assert(source.includes('showGiga'));
assert(source.includes('DzMoneyGamingAd'));
console.log('GigaPub enhanced reliability contract passed.');
