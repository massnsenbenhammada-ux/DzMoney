(() => {
  if (window.__DzMoneyAdRuntimeDiagnosticsLoaded) return;
  window.__DzMoneyAdRuntimeDiagnosticsLoaded = true;

  const root = document.querySelector('[data-page="gaming"]');
  if (!root) return;

  const escape = value => String(value ?? 'unknown').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const status = (label, value) => `<div><b>${escape(label)}</b>: ${escape(value)}</div>`;
  const readClientState = () => {
    const scripts = [...document.scripts].map(script => script.src).filter(Boolean);
    const monetagScript = scripts.find(src => src.includes('libtl.com/sdk.js')) || null;
    return {
      assetVersion: new URL(document.currentScript?.src || '', window.location.href).searchParams.get('v') || 'unknown',
      clientProviders: Object.keys(window.__DzMoneyAdProviderConfig?.providers || {}),
      monetagAdapter: typeof window.DzMoneyMonetag?.handler === 'function',
      monetagHandler: typeof window.show_11627577,
      monetagSdkScript: monetagScript || 'missing',
      gigapubAdapter: typeof window.DzMoneyGamingAd?.handler === 'function',
      gigapubHandler: typeof window.showGiga,
      adClientProviders: window.DzMoneyAdClient?.providerConfig?.providers ? Object.keys(window.DzMoneyAdClient.providerConfig.providers) : []
    };
  };

  const runtimeSnapshot = () => ({
    scripts: [...document.scripts].map(script => script.src).filter(Boolean),
    iframes: [...document.querySelectorAll('iframe')].map(frame => frame.src || frame.getAttribute('src') || 'about:blank'),
    embeds: [...document.querySelectorAll('embed, object')].map(node => node.src || node.data || ''),
    overlays: [...document.querySelectorAll('body *')].filter(node => {
      const style = window.getComputedStyle(node);
      return style.position === 'fixed' || style.position === 'absolute';
    }).slice(-20).map(node => `${node.tagName}.${node.className || ''}`),
    gigapubHandler: typeof window.showGiga,
    gigapubHandlerSource: typeof window.showGiga === 'function' ? String(window.showGiga).slice(0, 300) : 'missing'
  });

  const panel = document.createElement('details');
  panel.open = true;
  panel.style.cssText = 'margin:12px 0;padding:10px;border:1px dashed currentColor;border-radius:10px;font:12px/1.5 monospace;opacity:.9';
  panel.innerHTML = '<summary style="cursor:pointer;font-weight:700">AD RUNTIME DIAGNOSTICS</summary><div data-ad-runtime-state>Loading…</div>';
  root.prepend(panel);

  const render = (serverState, clientState, lastEvent = '', trace = '') => {
    const el = panel.querySelector('[data-ad-runtime-state]');
    if (!el) return;
    el.innerHTML = [
      status('server assetVersion', serverState?.assetVersion),
      status('server gamingAvailable', serverState?.gamingAvailable?.join(', ') || 'none'),
      status('server clientProviders', serverState?.clientProviders?.join(', ') || 'none'),
      status('client config providers', clientState.clientProviders.join(', ') || 'none'),
      status('DzMoneyAdClient providers', clientState.adClientProviders.join(', ') || 'none'),
      status('Monetag adapter', clientState.monetagAdapter),
      status('Monetag handler', clientState.monetagHandler),
      status('Monetag SDK script', clientState.monetagSdkScript),
      status('GigaPub adapter', clientState.gigapubAdapter),
      status('GigaPub handler', clientState.gigapubHandler),
      status('last event', lastEvent || 'none'),
      status('GigaPub trace', trace || 'none')
    ].join('');
  };

  let serverState = null;
  let traceState = '';
  const refresh = async event => {
    try {
      const response = await fetch('/api/debug/ad-runtime', { cache: 'no-store' });
      serverState = response.ok ? await response.json() : { error: `HTTP ${response.status}` };
    } catch (error) {
      serverState = { error: error.message };
    }
    render(serverState, readClientState(), event, traceState);
  };

  const describeResources = snapshot => {
    const resources = [...snapshot.scripts, ...snapshot.iframes, ...snapshot.embeds];
    const relevant = resources.filter(value => /gigapub|monetag|libtl|onclck|flerapr/i.test(value));
    return relevant.join(' | ') || 'none';
  };

  const capture = label => {
    const snapshot = runtimeSnapshot();
    traceState = `${label}; relevant resources: ${describeResources(snapshot)}; iframes: ${snapshot.iframes.join(' | ') || 'none'}; overlays: ${snapshot.overlays.join(' | ') || 'none'}; showGiga: ${snapshot.gigapubHandler}`;
    refresh(`trace: ${label}`);
  };

  const captureLifecycle = () => {
    capture('showGiga after 500ms');
    setTimeout(() => capture('showGiga after 2s'), 1500);
  };

  let wrappedShowGiga = false;
  const wrapShowGiga = () => {
    if (wrappedShowGiga || typeof window.showGiga !== 'function') return;
    const original = window.showGiga;
    window.showGiga = function (...args) {
      capture('showGiga called');
      const result = original.apply(this, args);
      captureLifecycle();
      return Promise.resolve(result).then(value => {
        capture('showGiga resolved');
        return value;
      }, error => {
        capture(`showGiga rejected: ${error?.message || error}`);
        throw error;
      });
    };
    wrappedShowGiga = true;
    capture('showGiga wrapped');
  };

  const originalGetProvider = window.DzMoneyAdClient?.getProvider;
  if (typeof originalGetProvider === 'function') {
    window.DzMoneyAdClient.getProvider = providerId => {
      const adapter = originalGetProvider.call(window.DzMoneyAdClient, providerId);
      refresh(`getProvider(${providerId}) -> ${adapter ? 'present' : 'missing'}`);
      return adapter;
    };
  }

  wrapShowGiga();
  const wrapTimer = setInterval(() => {
    wrapShowGiga();
    if (wrappedShowGiga) clearInterval(wrapTimer);
  }, 250);
  refresh('diagnostics initialized');
})();
