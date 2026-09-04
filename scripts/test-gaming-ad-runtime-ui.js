const assert = require('assert');
const fs = require('fs');

const diagnostics = fs.readFileSync('public/ad-runtime-diagnostics.js', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');

assert(server.includes("app.get('/api/debug/ad-runtime'"), 'Runtime diagnostics endpoint must exist');
assert(server.includes('AD_RUNTIME_DIAGNOSTICS'), 'Runtime diagnostics must remain explicitly gated');
assert(server.includes('ad-runtime-diagnostics.js'), 'Server must load the in-app diagnostics script only when enabled');
assert(diagnostics.includes("fetch('/api/debug/ad-runtime'"), 'Diagnostics UI must read runtime diagnostics');
assert(diagnostics.includes('DzMoneyMonetag'), 'Diagnostics must inspect Monetag adapter state');
assert(diagnostics.includes('show_11627577'), 'Diagnostics must inspect Monetag handler state');
assert(diagnostics.includes('libtl.com/sdk.js'), 'Diagnostics must inspect Monetag SDK script state');
assert(diagnostics.includes('showGiga'), 'Diagnostics must inspect GigaPub handler state');
assert(diagnostics.includes('clientProviders'), 'Diagnostics must expose client provider state');
assert(diagnostics.includes('DzMoneyAdClient.getProvider'), 'Diagnostics must observe the selected client provider');
assert(diagnostics.includes('showGiga called'), 'Diagnostics must trace GigaPub invocation');
assert(diagnostics.includes('showGiga resolved'), 'Diagnostics must trace GigaPub resolution');
assert(diagnostics.includes('showGiga rejected'), 'Diagnostics must trace GigaPub rejection');
assert(diagnostics.includes('relevant resources'), 'Diagnostics must expose relevant runtime resources');

console.log('Gaming ad runtime UI diagnostics contract: PASS');
