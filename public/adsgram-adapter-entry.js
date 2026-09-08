(() => {
  const BLOCK_ID = '44442';
  const POLL_MS = 1000;
  const POLL_LIMIT_MS = 30000;
  const state = { busy: false };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function api(path, options = {}) {
    const tg = window.Telegram?.WebApp;
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (tg?.initData) headers['X-Telegram-Init-Data'] = tg.initData;
    const response = await fetch(path, { ...options, headers });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch {}
    if (!response.ok) throw Object.assign(new Error(data.error || `Request failed: ${response.status}`), { status: response.status, data });
    return data;
  }
  async function run(button) {
    if (state.busy) return;
    state.busy = true;
    button.disabled = true;
    button.textContent = 'Loading…';
    try {
      const result = await api('/api/daily-tasks/execute', { method: 'POST', body: JSON.stringify({ systemKey: 'view_ads', idempotencyKey: `daily:view_ads:${crypto.randomUUID()}` }) });
      if (result.providerId !== 'adsgram') throw new Error('AdsGram rotation mismatch');
      const sdk = window.Adsgram;
      if (!sdk || typeof sdk.init !== 'function') throw new Error('AdsGram SDK is unavailable');
      const controller = sdk.init({ blockId: BLOCK_ID });
      if (!controller || typeof controller.show !== 'function') throw new Error('AdsGram Reward controller is unavailable');
      button.textContent = 'Watching…';
      const shown = await controller.show();
      if (!shown || shown.done !== true) throw new Error('AdsGram reward was not completed');
      const completion = await api('/api/daily-tasks/advertisement/client-complete', { method: 'POST', body: JSON.stringify({ adEventId: result.adEventId }) });
      if (completion.progress) window.__DzMoneyDailyAdProgress = completion.progress;
      const deadline = Date.now() + POLL_LIMIT_MS;
      while (Date.now() < deadline) {
        try {
          const finalized = await api('/api/daily-tasks/advertisement/finalize', { method: 'POST', body: JSON.stringify({ adEventId: result.adEventId }) });
          if (finalized.progress) window.__DzMoneyDailyAdProgress = finalized.progress;
          if (finalized.rewarded) {
            window.dispatchEvent(new CustomEvent('dzmoney:adsgram-rewarded', { detail: finalized }));
            break;
          }
        } catch (error) {
          if (!String(error.message || '').includes('must be verified first')) throw error;
        }
        await wait(POLL_MS);
      }
      if (typeof window.loadMe === 'function') await window.loadMe();
      if (typeof window.loadDailyAdProgress === 'function') await window.loadDailyAdProgress();
      if (typeof window.showRewardOutcome === 'function') window.showRewardOutcome(completion, null);
    } catch (error) {
      const toast = document.getElementById('toast');
      if (toast) { toast.textContent = error.message || 'Unable to show AdsGram advertisement.'; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2600); }
    } finally {
      state.busy = false;
      button.disabled = false;
      button.textContent = 'Watch';
      if (typeof window.loadDailyAdProgress === 'function') await window.loadDailyAdProgress();
      if (typeof window.renderTaskCategory === 'function' && window.state?.taskCategory === 'daily') window.renderTaskCategory('daily');
    }
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('.daily-system-action[data-system-key="view_ads"]');
    if (!button) return;
    const providerConfig = window.__DzMoneyAdProviderConfig;
    const providers = providerConfig?.providers || {};
    const taskProviders = providerConfig?.task || [];
    if (!providers.adsgram && !taskProviders.some?.(provider => provider?.id === 'adsgram')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    run(button).catch(() => {});
  }, true);
})();
