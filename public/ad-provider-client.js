const providerConfig = window.__DzMoneyAdProviderConfig || {};
const verificationProvider = providerConfig.verification;
const dailyProvider = providerConfig.daily_checkin;
const gamingProvider = providerConfig.gaming;

function createOnclickaHandler(config) {
  return async payload => {
    if (payload?.type === 'preload') return true;
    if (typeof window.DzMoneyLoadOnclickaSdk !== 'function') throw new Error('OnClickA SDK loader is unavailable');
    await window.DzMoneyLoadOnclickaSdk();
    if (typeof window.initCdTma !== 'function') throw new Error('OnClickA TMA SDK is unavailable');
    const show = await window.initCdTma({ id: Number(config.spotId) });
    if (typeof show !== 'function') throw new Error('OnClickA show method is unavailable');
    return show();
  };
}

function exposeProvider(context, config) {
  if (!config || config.id !== 'onclicka') return;
  const handler = createOnclickaHandler(config);
  if (context === 'verification') window.DzMoneyMonetag = { provider: 'onclicka', ready: Promise.resolve(), handler };
  if (context === 'daily_checkin') window.DzMoneyMonetag = { provider: 'onclicka', ready: Promise.resolve(), handler };
  if (context === 'gaming') window.DzMoneyGamingAd = { provider: 'onclicka', ready: Promise.resolve(), handler };
}

if (gamingProvider?.id === 'onclicka') exposeProvider('gaming', gamingProvider);
if (verificationProvider?.id === 'onclicka' || dailyProvider?.id === 'onclicka') {
  window.__DzMoneySelectedAdProvider = verificationProvider?.id === 'onclicka' ? 'onclicka' : dailyProvider?.id;
  exposeProvider('verification', verificationProvider?.id === 'onclicka' ? verificationProvider : dailyProvider);
}

window.DzMoneyAdClient = { providerConfig, exposeProvider };
