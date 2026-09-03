(() => {
  const config = window.__DzMoneyAdProviderConfig?.providers?.gigapub;
  if (!config || config.id !== 'gigapub') return;

  const tg = window.Telegram?.WebApp;
  const script = document.createElement('script');
  script.src = `https://ad.gigapub.tech/script?id=${encodeURIComponent(config.projectId)}`;
  script.async = true;
  const loaded = new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = () => reject(new Error('GigaPub SDK failed to load'));
  });
  document.head.appendChild(script);

  window.DzMoneyGamingAd = {
    provider: 'gigapub',
    ready: loaded,
    handler: async payload => {
      if (!payload?.adEventId) throw new Error('GigaPub ad event is required');
      await loaded;
      if (typeof window.showGiga !== 'function') throw new Error('GigaPub showGiga is unavailable');
      await window.showGiga();
      const headers = { 'Content-Type': 'application/json' };
      if (tg?.initData) headers['X-Telegram-Init-Data'] = tg.initData;
      const response = await fetch('/api/gaming/ads/complete', {
        method: 'POST',
        headers,
        body: JSON.stringify({ adEventId: payload.adEventId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'GigaPub reward could not be credited');
      return data;
    }
  };
})();
