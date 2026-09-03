(() => {
  const projectId = String(window.__DzMoneyGigaPubOfferWall?.projectId || '7958');
  const scriptUrl = `https://wall.giga.pub/api/v1/loader.js?projectId=${encodeURIComponent(projectId)}`;
  const tg = window.Telegram?.WebApp;
  let sdk = null;
  let rewardHandler = null;

  function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (tg?.initData) headers['X-Telegram-Init-Data'] = tg.initData;
    return fetch(path, { ...options, headers }).then(async response => {
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
      if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
      return data;
    });
  }

  function loadScript() {
    if (typeof window.loadOfferWallSDK === 'function') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src^="https://wall.giga.pub/api/v1/loader.js"]`);
      if (existing) {
        (window.loadGigaSDKCallbacks || (window.loadGigaSDKCallbacks = [])).push(resolve);
        return;
      }
      (window.loadGigaSDKCallbacks || (window.loadGigaSDKCallbacks = [])).push(resolve);
      const script = document.createElement('script');
      script.src = scriptUrl;
      script.async = true;
      script.onerror = () => reject(new Error('GigaPub OfferWall SDK failed to load'));
      document.head.appendChild(script);
    });
  }

  async function processReward(data) {
    if (!data?.rewardId || !data?.hash) return;
    const result = await api('/api/ads/gigapub/offerwall/reward', {
      method: 'POST',
      body: JSON.stringify({ rewardId: data.rewardId, userId: data.userId, projectId: data.projectId, amount: data.amount, hash: data.hash })
    });
    if (!result.confirmationHash) throw new Error('GigaPub reward confirmation was not returned');
    const confirmed = await sdk.confirmReward(data.rewardId, result.confirmationHash);
    if (!confirmed) throw new Error('GigaPub reward confirmation failed');
    window.dispatchEvent(new CustomEvent('dzmoney:balance-refresh'));
  }

  async function init() {
    try {
      await loadScript();
      sdk = await window.loadOfferWallSDK({ projectId });
      window.gigaOfferWallSDK = sdk;
      rewardHandler = data => processReward(data).catch(error => console.error('GigaPub reward processing failed:', error));
      sdk.on('rewardClaim', rewardHandler);
      try {
        const pending = await sdk.pending();
        for (const reward of pending || []) await processReward(reward);
      } catch (error) {
        console.error('GigaPub pending reward processing failed:', error);
      }
      const button = document.querySelector('[data-gigapub-offerwall]');
      if (button) button.hidden = !sdk.hasOffers();
    } catch (error) {
      console.error('GigaPub OfferWall initialization failed:', error);
    }
  }

  function addButton() {
    const grid = document.querySelector('.quick-grid');
    if (!grid || grid.querySelector('[data-gigapub-offerwall]')) return;
    const button = document.createElement('button');
    button.className = 'action-card';
    button.type = 'button';
    button.dataset.gigapubOfferwall = 'true';
    button.innerHTML = '<b>🎁</b><span>Rewards</span><small>Complete partner offers</small>';
    button.addEventListener('click', () => {
      if (!sdk) return;
      sdk.open();
    });
    grid.appendChild(button);
  }

  document.addEventListener('DOMContentLoaded', () => { addButton(); init(); });
  window.addEventListener('beforeunload', () => { if (sdk && rewardHandler) sdk.off('rewardClaim', rewardHandler); });
})();
