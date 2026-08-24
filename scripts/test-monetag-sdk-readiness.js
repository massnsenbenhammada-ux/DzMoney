const fs = require('fs');
const vm = require('vm');

const adapter = fs.readFileSync('public/monetag-adapter-entry.js', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');
const index = fs.readFileSync('public/index.html', 'utf8');

if (!adapter.includes('ready')) throw new Error('Monetag adapter must expose readiness');
if (!adapter.includes('sdkScriptLoad')) throw new Error('Monetag adapter must expose SDK script load diagnostics');
if (!app.includes('adapter.ready')) throw new Error('Frontend must await adapter readiness');

const sdkIndex = index.indexOf('libtl.com/sdk.js');
const adapterIndex = index.indexOf('/monetag-adapter.bundle.js');
if (sdkIndex < 0 || adapterIndex < 0 || sdkIndex > adapterIndex) throw new Error('SDK must precede adapter');
if (!index.includes("onload=\"window.__DzMoneyMonetagSdkLoad='loaded'\"")) throw new Error('Monetag SDK load success marker is missing');
if (!index.includes("onerror=\"window.__DzMoneyMonetagSdkLoad='error'\"")) throw new Error('Monetag SDK load error marker is missing');

const context = {
  window: { show_11627577: () => Promise.resolve(), __DzMoneyMonetagSdkLoad: 'loaded' },
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

context.window.DzMoneyMonetag.ready.then(() => {
  if (typeof context.window.DzMoneyMonetag.handler !== 'function') throw new Error('Handler missing after readiness');
  console.log('MONETAG_SDK_READINESS_CONTRACT: PASS');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
