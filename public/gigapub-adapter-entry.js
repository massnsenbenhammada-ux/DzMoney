(() => {
  const config = window.__DzMoneyAdProviderConfig?.providers?.gigapub;
  if (!config || config.id !== 'gigapub') return;

  const tg = window.Telegram?.WebApp;
  const script = document.createElement('script');
  let fallbackTimer;
  let settled = false;
  const loaded = new Promise((resolve, reject) => {
    const finish = callback => value => {
      if (settled) return;
      settled = true;
      clearTimeout(fallbackTimer);
      callback(value);
    };
    script.onload = finish(resolve);
    script.onerror = () => {
      if (settled) return;
      const fallback = document.createElement('script');
      fallback.src = `https://ru-ad.gigapub.tech/script?id=${encodeURIComponent(config.projectId)}`;
      fallback.async = true;
      fallback.onload = finish(resolve);
      fallback.onerror = finish(() => reject(new Error('GigaPub SDK failed to load')));
      document.head.appendChild(fallback);
    };
    fallbackTimer = setTimeout(() => {
      if (settled) return;
      script.onerror();
    }, 15000);
  });
  script.src = `https://ad.gigapub.tech/script?id=${encodeURIComponent(config.projectId)}`;
  script.async = true;
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
