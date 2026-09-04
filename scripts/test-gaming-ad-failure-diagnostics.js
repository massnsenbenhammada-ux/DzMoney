const assert = require('assert');
const fs = require('fs');

const gaming = fs.readFileSync('public/gaming.js', 'utf8');

assert(gaming.includes('function formatGamingAdFailure(providerId, stage, error)'));
assert(gaming.includes("const providerName = providerId || 'unknown';"));
assert(gaming.includes("const detail = error?.message ? ` (${error.message})` : '';"));
assert(gaming.includes("if (stage === 'start') return `${providerName}: could not start the ad session${detail}`;"));
assert(gaming.includes("if (stage === 'ready') return `${providerName}: the ad SDK is not ready${detail}`;"));
assert(gaming.includes("if (stage === 'show') return `${providerName}: the advertisement could not be displayed${detail}`;"));
assert(gaming.includes("if (stage === 'complete') return `${providerName}: the advertisement was shown, but completion could not be confirmed${detail}`;"));
assert(gaming.includes("return `${providerName}: the advertisement failed${detail}`;"));
assert(gaming.includes("let providerId = null;"));
assert(gaming.includes("let stage = 'start';"));
assert(gaming.includes("providerId = response.providerId;"));
assert(gaming.includes("stage = 'ready';"));
assert(gaming.includes("stage = 'show';"));
assert(gaming.includes("stage = 'complete';"));
assert(gaming.includes('formatGamingAdFailure(providerId, stage, error)'));

console.log('Gaming ad failure diagnostics contract: OK');
