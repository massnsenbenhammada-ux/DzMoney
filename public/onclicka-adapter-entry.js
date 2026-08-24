const ONCLICKA_PROVIDER = 'onclicka';

let initializedSpotId = null;
let showPromise = null;

function ensureOnclickaReady(spotId) {
  if (!spotId) throw new Error('OnClickA Spot ID is missing');
  if (initializedSpotId === String(spotId) && showPromise) return showPromise;
  if (typeof window.initCdTma !== 'function') throw new Error('OnClickA TMA SDK is unavailable');
  initializedSpotId = String(spotId);
  showPromise = window.initCdTma({ id: Number(spotId) });
  return showPromise;
}

window.DzMoneyOnclicka = {
  provider: ONCLICKA_PROVIDER,
  show: async ({ spotId } = {}) => {
    const show = await ensureOnclickaReady(spotId);
    if (typeof show !== 'function') throw new Error('OnClickA show method is unavailable');
    return show();
  }
};
