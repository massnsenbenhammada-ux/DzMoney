const providerConfig = window.__DzMoneyAdProviderConfig || {};
const providerAdapters = {};

function createOnclickaHandler(config) {
  return async payload => {
    if (payload?.type === 'preload') return true;
    if (typeof window.DzMoneyOnclicka?.show === 'function') return window.DzMoneyOnclicka.show({ spotId: config.spotId });
    if (typeof window.DzMoneyLoadOnclickaSdk !== 'function') throw new Error('OnClickA SDK loader is unavailable');
    await window.DzMoneyLoadOnclickaSdk();
    if (typeof window.initCdTma !== 'function') throw new Error('OnClickA TMA SDK is unavailable');
    const show = await window.initCdTma({ id: Number(config.spotId) });
    if (typeof show !== 'function') throw new Error('OnClickA show method is unavailable');
    return show();
  };
}

function registerOnclicka(config) {
  if (!config || config.id !== 'onclicka') return;
  const adapter = { provider: 'onclicka', ready: Promise.resolve(), handler: createOnclickaHandler(config) };
  providerAdapters.onclicka = adapter;
  window.DzMoneyOnclicka = window.DzMoneyOnclicka || adapter;
}

function registerMonetag() {
  if (typeof window.DzMoneyMonetag?.handler !== 'function') return;
  providerAdapters.monetag = window.DzMoneyMonetag;
}

function registerGigaPub() {
  if (typeof window.DzMoneyGamingAd?.handler !== 'function') return;
  providerAdapters.gigapub = window.DzMoneyGamingAd;
}

for (const config of Object.values(providerConfig.providers || {})) registerOnclicka(config);
registerMonetag();
registerGigaPub();

window.DzMoneyAdClient = {
  providerConfig,
  getProvider(providerId) {
    return providerAdapters[providerId] || null;
  }
};
