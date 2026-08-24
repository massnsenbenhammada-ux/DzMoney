const { AdProviderRegistry } = require('./ad-provider-service');
const { createMonetagProvider } = require('./monetag-adapter');
const { createOnclickaProvider } = require('./onclicka-adapter');

// Single runtime registry. Provider adapters are registered here server-side as they are integrated.
const registry = new AdProviderRegistry([
  createOnclickaProvider(),
  createMonetagProvider()
]);

module.exports = registry;
