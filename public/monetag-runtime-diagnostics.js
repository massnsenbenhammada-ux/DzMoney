(function () {
  'use strict';

  const SDK_SRC = 'libtl.com/sdk.js';

  function record(patch) {
    window.__DzMoneyMonetagRuntime = {
      ...(window.__DzMoneyMonetagRuntime || {}),
      ...patch,
    };
  }

  function exposeEvidence() {
    const evidence = window.__DzMoneyMonetagRuntime;
    if (!evidence || typeof document === 'undefined') return;

    const render = () => {
      if (!document.body) return;
      let panel = document.getElementById('dzmoney-monetag-diagnostics');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'dzmoney-monetag-diagnostics';
        Object.assign(panel.style, {
          position: 'fixed', left: '12px', right: '12px', bottom: '100px',
          zIndex: '9999', padding: '12px', borderRadius: '14px',
          background: '#0d1916', color: '#f4faf7', border: '1px solid rgba(255,255,255,.14)',
          boxShadow: '0 15px 45px rgba(0,0,0,.45)',
        });

        const title = document.createElement('strong');
        title.textContent = 'Monetag diagnostics';
        title.style.display = 'block';
        title.style.marginBottom = '8px';
        panel.appendChild(title);

        const output = document.createElement('textarea');
        output.readOnly = true;
        output.id = 'dzmoney-monetag-diagnostics-output';
        Object.assign(output.style, {
          width: '100%', height: '180px', boxSizing: 'border-box',
          background: '#07100e', color: '#f4faf7', border: '1px solid rgba(255,255,255,.12)',
          borderRadius: '10px', padding: '8px', fontSize: '11px',
        });
        panel.appendChild(output);

        const copy = document.createElement('button');
        copy.type = 'button';
        copy.textContent = 'Copy diagnostics';
        Object.assign(copy.style, {
          marginTop: '8px', padding: '9px 12px', border: 0, borderRadius: '10px',
          background: '#55e6b0', color: '#06251d', fontWeight: '700',
        });
        copy.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(output.value);
            copy.textContent = 'Copied';
          } catch {
            output.focus();
            output.select();
            document.execCommand('copy');
            copy.textContent = 'Copied';
          }
        });
        panel.appendChild(copy);
        document.body.appendChild(panel);
      }

      const output = document.getElementById('dzmoney-monetag-diagnostics-output');
      if (output) output.value = JSON.stringify(window.__DzMoneyMonetagRuntime, null, 2);
    };

    if (document.body) render();
    else document.addEventListener('DOMContentLoaded', render, { once: true });
  }

  window.addEventListener('error', function (event) {
    const target = event.target;
    if (!target || target.tagName !== 'SCRIPT' || !String(target.src).includes(SDK_SRC)) return;

    const resourceUrl = target.src;
    const entries = performance.getEntriesByName(resourceUrl);
    const entry = entries[entries.length - 1];

    record({
      resourceError: true,
      resourceUrl,
      resourceErrorMessage: event.message || null,
      online: navigator.onLine,
      resourceEntry: entry ? {
        name: entry.name,
        duration: entry.duration,
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize,
        decodedBodySize: entry.decodedBodySize,
        nextHopProtocol: entry.nextHopProtocol,
      } : null,
      handlerType: typeof window.show_11627577,
    });

    target.setAttribute('data-dzmoney-monetag-error', 'captured');
    exposeEvidence();
  }, true);

  window.addEventListener('load', function () {
    const entries = performance.getEntriesByName('https://libtl.com/sdk.js');
    const entry = entries[entries.length - 1];
    record({
      resourceEntry: entry ? {
        name: entry.name,
        duration: entry.duration,
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize,
        decodedBodySize: entry.decodedBodySize,
        nextHopProtocol: entry.nextHopProtocol,
      } : null,
      online: navigator.onLine,
      handlerType: typeof window.show_11627577,
    });
  });
})();
