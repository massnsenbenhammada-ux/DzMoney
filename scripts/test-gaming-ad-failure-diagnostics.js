const assert = require('assert');
const fs = require('fs');

const gaming = fs.readFileSync('public/gaming.js', 'utf8');

assert(gaming.includes('function formatGamingAdFailure(providerId, stage, error)'));
assert(gaming.includes("const providerName = providerId || 'unknown';"));
assert(gaming.includes("if (stage === 'start') return `${providerName}: the ad session could not be started.`;"));
assert(gaming.includes("if (stage === 'ready') return `${providerName}: the ad SDK is not ready.`;"));
assert(gaming.includes("if (stage === 'show') return `${providerName}: the advertisement could not be displayed.`;"));
assert(gaming.includes("if (stage === 'complete') return `${providerName}: the advertisement was shown, but completion could not be confirmed.`;"));
assert(gaming.includes("return `${providerName}: ${error?.message || 'the advertisement failed.'}`;"));
assert(gaming.includes("let providerId = null;"));
assert(gaming.includes("let stage = 'start';"));
assert(gaming.includes("providerId = response.providerId;"));
assert(gaming.includes("stage = 'ready';"));
assert(gaming.includes("stage = 'show';"));
assert(gaming.includes("stage = 'complete';"));
assert(gaming.includes('formatGamingAdFailure(providerId, stage, error)'));

console.log('Gaming ad failure diagnostics contract: OK');
