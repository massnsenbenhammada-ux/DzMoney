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

window.DzMoneyLoadOnclickaSdk = loadOnclickaSdk;
