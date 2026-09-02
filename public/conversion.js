(() => {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = '/conversion.css?v=__ASSET_VERSION__';
  document.head.appendChild(stylesheet);

  const ensureModal = () => {
    let dialog = document.getElementById('conversionModal');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'conversionModal';
    dialog.className = 'conversion-dialog';
    dialog.setAttribute('aria-labelledby', 'conversionTitle');
    dialog.innerHTML = `<form method="dialog" class="conversion-sheet"><header class="conversion-header"><div><span class="eyebrow">CONVERSION</span><h2 id="conversionTitle">Convert to DZP</h2></div><button value="cancel" class="conversion-close" aria-label="Close">&times;</button></header><div class="conversion-source" role="group" aria-label="Conversion type"><button type="button" data-source="coin" class="conversion-source-option" aria-pressed="true"><span>COIN</span><small>Activity points</small></button><span class="conversion-arrow" aria-hidden="true">→</span><button type="button" data-source="dzx" class="conversion-source-option" aria-pressed="false"><span>DZX</span><small>Main balance</small></button></div><label class="conversion-field"><span>Amount to convert</span><div class="conversion-input-wrap"><input id="conversionAmount" inputmode="decimal" autocomplete="off" placeholder="10,000" aria-describedby="conversionHint conversionPreview"><span id="conversionUnit">COIN</span></div></label><div id="conversionPreview" class="conversion-preview" aria-live="polite"><span>YOU WILL RECEIVE</span><strong>— DZP</strong></div><p id="conversionHint" class="conversion-hint">1 DZP = 10,000 COIN</p><div class="conversion-notice"><span aria-hidden="true">ⓘ</span><p>Converted DZP is not earned activity and does not increase Reward Pool weight.</p></div><button type="button" class="primary-btn conversion-submit" id="conversionSubmit" disabled>Convert</button></form>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.querySelector('.conversion-close').addEventListener('click', () => dialog.close());
    dialog.querySelectorAll('[data-source]').forEach(button => button.addEventListener('click', () => selectSource(button.dataset.source)));
    dialog.querySelector('#conversionAmount').addEventListener('input', updatePreview);
    dialog.querySelector('#conversionSubmit').addEventListener('click', submitConversion);
    return dialog;
  };

  let rates = null;
  let source = 'coin';

  function sourceConfig() {
    return source === 'coin'
      ? { rateKey: 'economy.coin_per_dzp', unit: 'COIN', label: '1 DZP = 10,000 COIN', field: 'coin', endpoint: '/api/conversion/coin-to-dzp' }
      : { rateKey: 'economy.dzx_per_dzp', unit: 'DZX', label: '1 DZP = 10 DZX', field: 'dzx', endpoint: '/api/conversion/dzx-to-dzp' };
  }

  function parsePositiveInteger(text) {
    const normalized = text.replace(/,/g, '').trim();
    if (!/^\d+$/.test(normalized) || /^0+$/.test(normalized)) return null;
    return BigInt(normalized);
  }

  function updatePreview() {
    const dialog = ensureModal();
    const config = sourceConfig();
    const amount = parsePositiveInteger(dialog.querySelector('#conversionAmount').value);
    const rateText = rates?.[config.rateKey];
    const rate = parsePositiveInteger(String(rateText ?? ''));
    const preview = dialog.querySelector('#conversionPreview');
    const submit = dialog.querySelector('#conversionSubmit');
    dialog.querySelector('#conversionUnit').textContent = config.unit;
    dialog.querySelector('#conversionHint').textContent = rate ? `1 DZP = ${format(rateText)} ${config.unit}` : config.label;
    submit.disabled = true;
    if (!amount || !rate) {
      preview.innerHTML = '<span>YOU WILL RECEIVE</span><strong>— DZP</strong>';
      return;
    }
    if (amount < rate || amount % rate !== 0n) {
      preview.innerHTML = `<span>YOU WILL RECEIVE</span><strong>— DZP</strong><small>Enter a multiple of ${format(rateText)} ${config.unit}</small>`;
      return;
    }
    const result = amount / rate;
    preview.innerHTML = `<span>YOU WILL RECEIVE</span><strong>${result.toLocaleString()} DZP</strong><small>${amount.toLocaleString()} ${config.unit} → ${result.toLocaleString()} DZP</small>`;
    submit.disabled = false;
  }

  async function loadRates() {
    const dialog = ensureModal();
    try {
      const data = rates || await api('/api/conversion/rates');
      rates = data.rates || {};
      updatePreview();
    } catch (error) {
      dialog.querySelector('#conversionHint').textContent = error.message || 'Rates unavailable';
      dialog.querySelector('#conversionSubmit').disabled = true;
    }
  }

  function selectSource(nextSource) {
    source = nextSource;
    const dialog = ensureModal();
    dialog.querySelectorAll('[data-source]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.source === source)));
    dialog.querySelector('#conversionAmount').value = '';
    updatePreview();
  }

  async function submitConversion() {
    const dialog = ensureModal();
    const button = dialog.querySelector('#conversionSubmit');
    const input = dialog.querySelector('#conversionAmount');
    const amount = parsePositiveInteger(input.value);
    const config = sourceConfig();
    if (!amount) return toast('Enter a valid positive amount.');
    button.disabled = true;
    try {
      const key = crypto.randomUUID();
      await api(config.endpoint, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ [config.field]: amount.toString() }) });
      dialog.close();
      await loadMe();
      toast('Conversion completed.');
    } catch (error) {
      toast(error.message || 'Conversion failed.');
      button.disabled = false;
      updatePreview();
    }
  }

  function openConversion() {
    const dialog = ensureModal();
    dialog.querySelector('#conversionAmount').value = '';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    loadRates();
    updatePreview();
    dialog.querySelector('#conversionAmount').focus({ preventScroll: true });
  }

  document.addEventListener('click', event => {
    if (event.target.closest('#openConversion, #walletConversion')) openConversion();
  });
})();
