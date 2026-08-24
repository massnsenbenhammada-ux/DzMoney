(function () {
  'use strict';

  const SDK_SRC = 'libtl.com/sdk.js';
  const SDK_URL = 'https://libtl.com/sdk.js';

  function record(patch) {
    window.__DzMoneyMonetagRuntime = {
      ...(window.__DzMoneyMonetagRuntime || {}),
      ...patch,
    };
  }

  async function testSdkConnectivity() {
    const startedAt = performance.now();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(SDK_URL, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      });
      record({
        connectivityTest: {
          ok: true,
          responseType: response.type,
          status: response.status,
          durationMs: Number((performance.now() - startedAt).toFixed(1)),
          online: navigator.onLine,
        },
      });
    } catch (error) {
      record({
        connectivityTest: {
          ok: false,
          errorName: error?.name || 'Error',
          errorMessage: error?.message || null,
          durationMs: Number((performance.now() - startedAt).toFixed(1)),
          online: navigator.onLine,
        },
      });
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function exposeEvidence() {
    const render = () => {
      const container = document.getElementById('dzmoney-diagnostics-container');
      if (!container || document.getElementById('dzmoney-monetag-diagnostics')) return;

      const panel = document.createElement('article');
      panel.id = 'dzmoney-monetag-diagnostics';
      panel.className = 'info-card';

      const title = document.createElement('strong');
      title.textContent = 'Monetag diagnostics';
      panel.appendChild(title);

      const output = document.createElement('textarea');
      output.readOnly = true;
      output.id = 'dzmoney-monetag-diagnostics-output';
      Object.assign(output.style, {
        width: '100%', height: '180px', boxSizing: 'border-box',
        marginTop: '10px', background: '#07100e', color: '#f4faf7',
        border: '1px solid rgba(255,255,255,.12)', borderRadius: '10px',
        padding: '8px', fontSize: '11px',
      });
      output.value = JSON.stringify(window.__DzMoneyMonetagRuntime || {}, null, 2);
      panel.appendChild(output);

      const test = document.createElement('button');
      test.type = 'button';
      test.className = 'secondary-btn';
      test.textContent = 'Test SDK connection';
      test.addEventListener('click', async () => {
        test.disabled = true;
        test.textContent = 'Testing...';
        await testSdkConnectivity();
        output.value = JSON.stringify(window.__DzMoneyMonetagRuntime || {}, null, 2);
        test.disabled = false;
        test.textContent = 'Test SDK connection';
      });
      panel.appendChild(test);

      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'secondary-btn';
      copy.style.marginLeft = '8px';
      copy.textContent = 'Copy diagnostics';
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(output.value);
        } catch {
          output.focus();
          output.select();
          document.execCommand('copy');
        }
        copy.textContent = 'Copied';
      });
      panel.appendChild(copy);
      container.appendChild(panel);
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
    const entries = performance.getEntriesByName(SDK_URL);
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

  exposeEvidence();
})();
