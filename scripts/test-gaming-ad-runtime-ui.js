const assert = require('assert');
const fs = require('fs');

const gaming = fs.readFileSync('public/gaming.js', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');

assert(server.includes("app.get('/api/debug/ad-runtime'"), 'Runtime diagnostics endpoint must exist');
assert(gaming.includes("fetch('/api/debug/ad-runtime'"), 'Gaming diagnostics UI must read runtime diagnostics');
assert(gaming.includes('DzMoneyMonetag'), 'Gaming diagnostics must inspect Monetag adapter state');
assert(gaming.includes('show_11627577'), 'Gaming diagnostics must inspect Monetag handler state');
assert(gaming.includes('libtl.com/sdk.js'), 'Gaming diagnostics must inspect Monetag SDK script state');
assert(gaming.includes('showGiga'), 'Gaming diagnostics must inspect GigaPub handler state');
assert(gaming.includes('clientProviders'), 'Gaming diagnostics must expose client provider state');

console.log('Gaming ad runtime UI diagnostics contract: PASS');
