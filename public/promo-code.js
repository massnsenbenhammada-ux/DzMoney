(() => {
  const input = document.getElementById('promoCodeInput');
  const button = document.getElementById('promoCodeButton');
  const status = document.getElementById('promoCodeStatus');
  if (!input || !button || !status) return;

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const setStatus = message => { status.textContent = message; };

  async function showPromoAd(result) {
    const provider = window.DzMoneyAdClient?.getProvider(result.providerId);
    if (!provider?.handler) throw new Error('Promo advertisement provider is unavailable');
    const payload = { ymid: result.externalAdId, requestVar: 'promo' };
    if (result.providerId === 'monetag') {
      await provider.ready;
      await provider.handler({ type: 'preload', ...payload, timeout: 12 });
    }
    await provider.handler(payload);
  }

  async function waitForReward(redemptionId) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const result = await window.DzMoneyPromoApi(`/api/promo/redemption/${redemptionId}`);
      if (result.redemption?.status === 'verified') return result.redemption;
      if (result.redemption?.status === 'expired' || result.redemption?.status === 'rejected') throw new Error('Promo claim could not be completed');
      await wait(2000);
    }
    throw new Error('Advertisement verification is still pending');
  }

  async function redeem() {
    const code = input.value.trim();
    if (!code) return setStatus('Enter a promo code.');
    button.disabled = true;
    input.disabled = true;
    setStatus('Checking promo code…');
    try {
      const result = await window.DzMoneyPromoApi('/api/promo/redeem', { method: 'POST', body: JSON.stringify({ code, idempotencyKey: `promo:${crypto.randomUUID()}` }) });
      if (result.status === 'verified') {
        setStatus(`Reward credited: ${result.rewardAmount} ${result.rewardCurrency}`);
        await window.DzMoneyPromoRefresh?.();
        return;
      }
      setStatus('Complete the verification advertisement…');
      await showPromoAd(result);
      const redemption = await waitForReward(result.id);
      setStatus(`Reward credited: ${redemption.rewardAmount} ${redemption.rewardCurrency}`);
      input.value = '';
      await window.DzMoneyPromoRefresh?.();
    } catch (error) {
      setStatus(error.message || 'Promo code could not be redeemed.');
    } finally {
      button.disabled = false;
      input.disabled = false;
    }
  }

  window.DzMoneyPromoApi = async (path, options = {}) => {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const tg = window.Telegram?.WebApp;
    if (tg?.initData) headers['X-Telegram-Init-Data'] = tg.initData;
    const response = await fetch(path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
    return data;
  };

  button.addEventListener('click', redeem);
  input.addEventListener('keydown', event => { if (event.key === 'Enter') redeem(); });
})();
