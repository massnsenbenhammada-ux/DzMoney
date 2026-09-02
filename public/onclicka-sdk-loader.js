function loadSharedAdDiagnostics() {
  if (document.querySelector('script[data-dzmoney-ad-diagnostics]')) return;
  const script = document.createElement('script');
  script.src = '/monetag-runtime-diagnostics.js?v=dev';
  script.dataset.dzmoneyAdDiagnostics = 'true';
  document.head.appendChild(script);
}

function loadOnclickaSdk() {
  if (typeof window.initCdTma === 'function') return Promise.resolve();
  if (window.__DzMoneyOnclickaSdkLoadPromise) return window.__DzMoneyOnclickaSdkLoadPromise;
  const existing = document.querySelector('script[data-dzmoney-onclicka-sdk]');
  if (existing) {
    window.__DzMoneyOnclickaSdkLoadPromise = new Promise((resolve, reject) => {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', () => reject(new Error('OnClickA TMA SDK failed to load')), { once: true });
    });
    return window.__DzMoneyOnclickaSdkLoadPromise;
  }
  window.__DzMoneyOnclickaSdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.onclckvd.com/in-stream-ad-admanager/tma.js';
    script.async = true;
    script.dataset.dzmoneyOnclickaSdk = 'true';
    script.onload = resolve;
    script.onerror = () => reject(new Error('OnClickA TMA SDK failed to load'));
    document.head.appendChild(script);
  });
  return window.__DzMoneyOnclickaSdkLoadPromise;
}

function preloadSelectedOnclicka() {
  const config = window.__DzMoneyAdProviderConfig || {};
  const provider = Object.values(config).find(candidate => candidate?.id === 'onclicka');
  if (!provider) return;
  if (typeof window.DzMoneyOnclicka?.prepare === 'function') {
    window.DzMoneyOnclicka.prepare({ spotId: provider.spotId }).catch(() => {});
    return;
  }
  loadOnclickaSdk().catch(() => {});
}

document.addEventListener('click', event => {
  if (event.target.closest('[data-go="diagnostics"]')) loadSharedAdDiagnostics();
});

window.DzMoneyLoadOnclickaSdk = loadOnclickaSdk;
setTimeout(preloadSelectedOnclicka, 0);
