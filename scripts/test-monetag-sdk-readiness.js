const fs = require('fs');
const vm = require('vm');

const adapter = fs.readFileSync('public/monetag-adapter-entry.js', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');
const index = fs.readFileSync('public/index.html', 'utf8');

if (!adapter.includes('ready')) {
  throw new Error('Monetag adapter must expose an explicit SDK readiness contract');
}

if (!app.includes('adapter.ready')) {
  throw new Error('Frontend must await the adapter readiness contract before using Monetag');
}

const sdkIndex = index.indexOf('libtl.com/sdk.js');
const adapterIndex = index.indexOf('/monetag-adapter.bundle.js');
if (sdkIndex < 0 || adapterIndex < 0 || sdkIndex > adapterIndex) {
  throw new Error('Monetag SDK must be loaded before the local adapter bundle');
}

const context = {
  window: {},
  setTimeout,
  clearTimeout,
  Promise,
  Number,
  Math
};
vm.createContext(context);
vm.runInContext(adapter, context, { filename: 'public/monetag-adapter-entry.js' });

if (!context.window.DzMoneyMonetag || !context.window.DzMoneyMonetag.ready) {
  throw new Error('Monetag adapter readiness promise is missing');
}

console.log('MONETAG_SDK_READINESS_CONTRACT: PASS');
