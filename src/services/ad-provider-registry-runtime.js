const { AdProviderRegistry } = require('./ad-provider-service');

// Single runtime registry. Provider adapters are registered here server-side as they are integrated.
const registry = new AdProviderRegistry();

module.exports = registry;
