const assert = require('node:assert/strict');
const fs = require('node:fs');

const server = fs.readFileSync('server.js', 'utf8');

assert(server.includes("app.get('/api/debug/ad-runtime'"), 'Runtime diagnostics endpoint must exist');
assert(server.includes("process.env.AD_RUNTIME_DIAGNOSTICS === 'true'"), 'Runtime diagnostics must be explicitly opt-in');
assert(server.includes('providerRegistry.listRegistered()'), 'Diagnostics must use the canonical provider registry');
assert(server.includes('provider.enabled'), 'Diagnostics must expose runtime provider enablement');
assert(server.includes('providerRegistry.listAvailable(\'gaming\')'), 'Diagnostics must report Gaming availability from the canonical registry');
assert(server.includes('assetVersion'), 'Diagnostics must expose the running asset/runtime version');
assert(!server.includes('process.env.MONETAG_POSTBACK_SECRET'), 'Diagnostics must not expose provider secrets');

console.log('Ad runtime diagnostics contract: OK');
