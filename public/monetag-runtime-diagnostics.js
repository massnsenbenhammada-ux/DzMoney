(function () {
  'use strict';

  const SDK_SRC = 'libtl.com/sdk.js';

  function record(patch) {
    window.__DzMoneyMonetagRuntime = {
      ...(window.__DzMoneyMonetagRuntime || {}),
      ...patch,
    };
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
