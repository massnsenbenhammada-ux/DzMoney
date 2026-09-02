const { AdProviderRegistry } = require('./ad-provider-service');
const { ONCLICKA_ENABLED } = require('../config/onclicka');
const { createMonetagProvider } = require('./monetag-adapter');
const { createOnclickaProvider } = require('./onclicka-adapter');

// Single runtime registry. Provider enablement comes from the canonical config.
const registry = new AdProviderRegistry([
  createOnclickaProvider({ enabled: ONCLICKA_ENABLED }),
  createMonetagProvider()
]);

module.exports = registry;
