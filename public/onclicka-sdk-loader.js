function loadSharedAdDiagnostics() {
  if (document.querySelector('script[data-dzmoney-ad-diagnostics]')) return;
  const script = document.createElement('script');
  script.src = '/monetag-runtime-diagnostics.js?v=dev';
  script.dataset.dzmoneyAdDiagnostics = 'true';
  document.head.appendChild(script);
}

function loadOnclickaSdk() {
  if (typeof window.initCdTma === 'function') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.onclckvd.com/in-stream-ad-admanager/tma.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('OnClickA TMA SDK failed to load'));
    document.head.appendChild(script);
  });
}

loadSharedAdDiagnostics();
window.DzMoneyLoadOnclickaSdk = loadOnclickaSdk;
