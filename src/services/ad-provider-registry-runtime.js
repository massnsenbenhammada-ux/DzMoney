const { AdProviderRegistry } = require('./ad-provider-service');
const { createMonetagProvider } = require('./monetag-adapter');
const { createOnclickaProvider } = require('./onclicka-adapter');

// Single runtime registry. OnClickA is the active provider unless explicitly disabled.
const registry = new AdProviderRegistry([
  createOnclickaProvider({ enabled: process.env.ONCLICKA_ENABLED !== 'false' }),
  createMonetagProvider()
]);

module.exports = registry;
