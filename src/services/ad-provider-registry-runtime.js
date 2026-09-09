const { AdProviderRegistry } = require("./ad-provider-service");
const { ONCLICKA_ENABLED } = require("../config/onclicka");
const { createMonetagProvider } = require("./monetag-adapter");
const { createOnclickaProvider } = require("./onclicka-adapter");
const { createGigaPubProvider } = require("./gigapub-adapter");
const { createAdsgramProvider } = require("./adsgram-adapter");

// Single runtime registry. Provider enablement comes from canonical config.
const registry = new AdProviderRegistry([
  createGigaPubProvider(),
  createOnclickaProvider({ enabled: ONCLICKA_ENABLED }),
  createMonetagProvider(),
  createAdsgramProvider(),
]);

module.exports = registry;
