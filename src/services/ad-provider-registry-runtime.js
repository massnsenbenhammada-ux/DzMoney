const { AdProviderRegistry } = require('./ad-provider-service');
const { createMonetagProvider } = require('./monetag-adapter');

// Single runtime registry. Provider adapters are registered here server-side as they are integrated.
const registry = new AdProviderRegistry([
  createMonetagProvider()
]);

module.exports = registry;
