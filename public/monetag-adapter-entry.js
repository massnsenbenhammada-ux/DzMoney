import createAdHandler from 'monetag-tg-sdk';

const ZONE_ID = '11627577';
const GLOBAL_NAME = `show_${ZONE_ID}`;

const handler = createAdHandler(ZONE_ID);

const diagnostic = {
  zoneId: ZONE_ID,
  globalName: GLOBAL_NAME,
  adapterCreatedAt: Date.now(),
  globalTypeAtCreation: typeof window[GLOBAL_NAME],
  globalReadyAtCreation: typeof window[GLOBAL_NAME] === 'function'
};

window.DzMoneyMonetag = {
  zoneId: ZONE_ID,
  handler,
  provider: 'monetag-tg-sdk',
  diagnostic
};

function snapshot() {
  return {
    ...diagnostic,
    globalType: typeof window[GLOBAL_NAME],
    globalReady: typeof window[GLOBAL_NAME] === 'function',
    matchingGlobals: Object.keys(window).filter((key) => key.startsWith('show_')).slice(0, 20),
    sdkScriptPresent: Array.from(document.scripts).some((script) => /(^|\/)libtl\.com\/sdk\.js/i.test(script.src)),
    sdkScripts: Array.from(document.scripts)
      .filter((script) => /libtl\.com\/sdk\.js/i.test(script.src))
      .map((script) => ({ src: script.src, async: script.async, defer: script.defer }))
  };
}

window.DzMoneyMonetag.getDiagnostic = snapshot;

const startedAt = Date.now();
const timer = window.setInterval(() => {
  const state = snapshot();
  if (state.globalReady || Date.now() - startedAt >= 30000) {
    diagnostic.finalSnapshot = state;
    diagnostic.globalReadyAfterMs = state.globalReady ? Date.now() - startedAt : null;
    window.clearInterval(timer);
  }
}, 100);
