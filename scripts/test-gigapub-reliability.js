const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('public/gigapub-adapter-entry.js', 'utf8');

assert(source.includes("https://ad.gigapub.tech/script?id="));
assert(source.includes("https://ru-ad.gigapub.tech/script?id="));
assert(source.includes('setTimeout'));
assert(source.includes('15000'));
assert(source.includes('withTimeout'));
assert(source.includes('GigaPub advertisement display timed out'));
assert(source.includes('showGiga'));
assert(source.includes('DzMoneyGamingAd'));

function runLoader(trigger) {
  const scripts = [];
  const timers = [];
  const context = {
    window: {
      __DzMoneyAdProviderConfig: { providers: { gigapub: { id: 'gigapub', projectId: 'test-project' } } },
      Telegram: { WebApp: {} }
    },
    document: {
      createElement: () => ({}),
      head: { appendChild: script => scripts.push(script) }
    },
    setTimeout: callback => {
      timers.push(callback);
      return timers.length;
    },
    clearTimeout: () => {},
    fetch: async () => ({ ok: true, json: async () => ({}) })
  };
  context.globalThis = context;

  vm.runInNewContext(source, context);
  assert.strictEqual(scripts.length, 1, 'primary GigaPub script must be added once');

  trigger(scripts[0], timers);
  return { context, scripts, timers };
}

const nativeError = runLoader(primary => {
  primary.onerror();
  primary.onerror();
});
assert.strictEqual(nativeError.scripts.length, 2, 'native error must create only one fallback');
assert(nativeError.scripts[1].src.includes('ru-ad.gigapub.tech/script?id=test-project'));

const timeout = runLoader((primary, timers) => {
  timers[0]();
  timers[0]();
  primary.onerror();
});
assert.strictEqual(timeout.scripts.length, 2, 'timeout must create only one fallback');

console.log('GigaPub enhanced reliability contract passed.');
