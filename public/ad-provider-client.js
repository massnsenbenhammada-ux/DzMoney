const providerConfig = window.__DzMoneyAdProviderConfig || {};
const providerAdapters = {};

function createOnclickaHandler(config) {
  return async (payload) => {
    if (payload?.type === "preload") return true;
    if (typeof window.DzMoneyOnclicka?.show === "function")
      return window.DzMoneyOnclicka.show({ spotId: config.spotId });
    if (typeof window.DzMoneyLoadOnclickaSdk !== "function")
      throw new Error("OnClickA SDK loader is unavailable");
    await window.DzMoneyLoadOnclickaSdk();
    if (typeof window.initCdTma !== "function")
      throw new Error("OnClickA TMA SDK is unavailable");
    const show = await window.initCdTma({ id: Number(config.spotId) });
    if (typeof show !== "function")
      throw new Error("OnClickA show method is unavailable");
    return show();
  };
}

function registerOnclicka(config) {
  if (!config || config.id !== "onclicka") return;
  const adapter = {
    provider: "onclicka",
    ready: Promise.resolve(),
    handler: createOnclickaHandler(config),
  };
  providerAdapters.onclicka = adapter;
  window.DzMoneyOnclicka = window.DzMoneyOnclicka || adapter;
}

function registerMonetag() {
  if (typeof window.DzMoneyMonetag?.handler !== "function") return;
  providerAdapters.monetag = window.DzMoneyMonetag;
}

function registerGigaPub() {
  if (typeof window.DzMoneyGamingAd?.handler !== "function") return;
  providerAdapters.gigapub = window.DzMoneyGamingAd;
}

function registerAdsgram(config) {
  if (!config || config.id !== "adsgram") return;
  const blockId = String(config.blockId || config.block_id || "44442");
  providerAdapters.adsgram = {
    provider: "adsgram",
    ready: Promise.resolve(),
    handler: async (payload) => {
      if (typeof window.Adsgram?.init !== "function")
        throw new Error("AdsGram SDK is unavailable");
      const controller = window.Adsgram.init({ blockId });
      if (!controller || typeof controller.show !== "function")
        throw new Error("AdsGram Reward controller is unavailable");
      let startedPromise = Promise.resolve();
      if (
        typeof payload?.onStart === "function" &&
        typeof controller.addEventListener === "function"
      ) {
        startedPromise = new Promise((resolve, reject) => {
          controller.addEventListener("onStart", () =>
            Promise.resolve(payload.onStart()).then(resolve, reject),
          );
        });
      }
      const result = await controller.show(payload?.config || undefined);
      await startedPromise;
      return result;
    },
  };
}

for (const config of Object.values(providerConfig.providers || {})) {
  registerOnclicka(config);
  registerAdsgram(config);
}
registerMonetag();
registerGigaPub();

window.DzMoneyAdClient = {
  providerConfig,
  getProvider(providerId) {
    return providerAdapters[providerId] || null;
  },
};
