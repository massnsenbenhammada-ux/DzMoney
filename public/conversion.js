(() => {
  const ensureModal = () => {
    let modal = document.getElementById('conversionModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'conversionModal';
    modal.className = 'conversion-modal';
    modal.hidden = true;
    modal.innerHTML = `<div class="conversion-dialog" role="dialog" aria-modal="true" aria-labelledby="conversionTitle"><button type="button" class="conversion-close" aria-label="Close">×</button><span class="eyebrow">CONVERSION</span><h2 id="conversionTitle">Convert to DZP</h2><p id="conversionWarning">Converted or purchased/transferred DZP is not earned activity and does not increase Reward Pool weight.</p><label>Source<select id="conversionSource"><option value="coin">COIN → DZP</option><option value="dzx">DZX → DZP</option></select></label><label id="conversionAmountLabel">Amount<input id="conversionAmount" inputmode="decimal" autocomplete="off" placeholder="10000"></label><button type="button" class="primary-btn" id="conversionSubmit">Convert</button><p class="conversion-rate" id="conversionRate">Loading rates…</p></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', event => { if (event.target === modal || event.target.closest('.conversion-close')) modal.hidden = true; });
    modal.querySelector('#conversionSource').addEventListener('change', loadRates);
    modal.querySelector('#conversionSubmit').addEventListener('click', submitConversion);
    return modal;
  };

  let rates = null;
  async function loadRates() {
    const modal = ensureModal();
    try {
      const data = rates || await api('/api/conversion/rates');
      rates = data.rates || {};
      const source = modal.querySelector('#conversionSource').value;
      const key = source === 'coin' ? 'economy.coin_per_dzp' : 'economy.dzx_per_dzp';
      modal.querySelector('#conversionRate').textContent = `1 DZP = ${format(rates[key])} ${source.toUpperCase()}`;
    } catch (error) {
      modal.querySelector('#conversionRate').textContent = error.message || 'Rates unavailable';
    }
  }

  async function submitConversion() {
    const modal = ensureModal();
    const button = modal.querySelector('#conversionSubmit');
    const source = modal.querySelector('#conversionSource').value;
    const raw = modal.querySelector('#conversionAmount').value.trim();
    if (!raw || !/^\d+(?:\.\d+)?$/.test(raw) || Number(raw) <= 0) return toast('Enter a valid positive amount.');
    button.disabled = true;
    try {
      const key = crypto.randomUUID();
      const path = source === 'coin' ? '/api/conversion/coin-to-dzp' : '/api/conversion/dzx-to-dzp';
      const body = source === 'coin' ? { coin: raw } : { dzx: raw };
      await api(path, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(body) });
      modal.hidden = true;
      await loadMe();
      toast('Conversion completed.');
    } catch (error) {
      toast(error.message || 'Conversion failed.');
    } finally {
      button.disabled = false;
    }
  }

  function openConversion() {
    const modal = ensureModal();
    modal.hidden = false;
    modal.querySelector('#conversionAmount').value = '';
    loadRates();
  }

  document.addEventListener('click', event => {
    if (event.target.closest('#openConversion, #walletConversion')) openConversion();
  });
})();
