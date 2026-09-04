const fs = require('fs');
const vm = require('vm');

const adapter = fs.readFileSync('public/monetag-adapter-entry.js', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');
const index = fs.readFileSync('public/index.html', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');

if (!adapter.includes('ready')) throw new Error('Monetag adapter must expose readiness');
if (!adapter.includes('sdkScriptLoad')) throw new Error('Monetag adapter must expose SDK script load diagnostics');
if (!adapter.includes('runtimeEvidence')) throw new Error('Monetag adapter must expose runtime evidence');
if (!adapter.includes('sdkScriptPresent ? waitForSdkReady() : Promise.resolve()')) throw new Error('Monetag readiness must stay lazy when the provider script is absent');
if (!app.includes('adapter.ready')) throw new Error('Frontend must await adapter readiness');

if (!index.includes('__MONETAG_SCRIPTS__')) throw new Error('Monetag scripts must be provider-gated');
if (index.includes('libtl.com/sdk.js')) throw new Error('Monetag SDK must not be hard-coded into the HTML');
if (!server.includes('monetagScriptsForClient')) throw new Error('Server must own Monetag script selection');
if (!server.includes('selected.providers.monetag')) throw new Error('Monetag script loading must depend on the enabled provider registry');

const runtimeEvidence = {
  resourceError: true,
  resourceUrl: 'https://libtl.com/sdk.js',
  online: true,
  resourceEntry: { transferSize: 0, encodedBodySize: 0, decodedBodySize: 0, nextHopProtocol: '' },
  handlerType: 'undefined'
};

const context = {
  window: {
    show_11627577: () => Promise.resolve(),
    __DzMoneyMonetagSdkLoad: 'loaded',
    __DzMoneyMonetagRuntime: runtimeEvidence
  },
  document: { querySelectorAll: () => [{}] },
  setTimeout,
  clearTimeout,
  Promise,
  Number,
  Math,
  Date
};
vm.createContext(context);
vm.runInContext(adapter, context, { filename: 'public/monetag-adapter-entry.js' });

if (!context.window.DzMoneyMonetag?.ready) throw new Error('Readiness promise is missing');
if (context.window.DzMoneyMonetag.runtimeEvidence !== runtimeEvidence) {
  throw new Error('Runtime evidence must be exposed by the adapter');
}

context.window.DzMoneyMonetag.ready.then(() => {
  if (typeof context.window.DzMoneyMonetag.handler !== 'function') throw new Error('Handler missing after readiness');
  console.log('MONETAG_SDK_READINESS_CONTRACT: PASS');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
