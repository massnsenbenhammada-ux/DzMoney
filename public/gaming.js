(() => {
  const tg = window.Telegram?.WebApp;
  const root = document.querySelector('[data-page="gaming"]');
  if (!root) return;
  const state = { gaming: null, view: 'home', busy: false };

  const api = async (path, options = {}) => {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (tg?.initData) headers['X-Telegram-Init-Data'] = tg.initData;
    const response = await fetch(path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Gaming request failed');
    return data;
  };

  const idempotencyKey = prefix => `${prefix}:${crypto.randomUUID()}`;
  const formatReward = reward => Object.entries(reward || {}).map(([key, value]) => `${value} ${key.toUpperCase()}`).join(' + ') || 'No Reward';
  const toast = message => { if (typeof window.showToast === 'function') window.showToast(message); else console.info(message); };
  // The Gaming Home card and game toolbar intentionally share the same counter attributes.
  // Update every match so both surfaces stay synchronized.
  const setAll = (selector, value) => root.querySelectorAll(selector).forEach(el => { el.textContent = value; });

  function render() {
    const gaming = state.gaming;
    if (!gaming) return;
    const account = gaming.account || {};
    const dailyAdLimit = Number(gaming.config?.dailyAdLimit) || 1;
    setAll('[data-spin-balance]', account.spins ?? 0);
    setAll('[data-axe-balance]', account.axes ?? 0);
    setAll('[data-energy]', `${account.energy_remaining ?? 0}/${gaming.config?.digging?.energy ?? 3}`);
    setAll('[data-spin-ad-count]', `${gaming.adCounts?.spin || 0}/${dailyAdLimit}`);
    setAll('[data-dig-ad-count]', `${gaming.adCounts?.digging || 0}/${dailyAdLimit}`);
    root.querySelectorAll('[data-spin-ad-bar]').forEach(bar => { bar.style.width = `${Math.min(100, ((gaming.adCounts?.spin || 0) / dailyAdLimit) * 100)}%`; });
    root.querySelectorAll('[data-dig-ad-bar]').forEach(bar => { bar.style.width = `${Math.min(100, ((gaming.adCounts?.digging || 0) / dailyAdLimit) * 100)}%`; });
    root.querySelectorAll('[data-gaming-view]').forEach(el => el.classList.toggle('gaming-hidden', el.dataset.gamingView !== state.view));
    root.querySelectorAll('[data-dig-start]').forEach(btn => { btn.disabled = state.busy || account.axes < 1 || !!gaming.activeSession; });
    root.querySelectorAll('[data-spin-action]').forEach(btn => { btn.disabled = state.busy || account.spins < 1; });
    renderSession();
  }

  function renderSession() {
    const session = state.gaming?.activeSession;
    const board = root.querySelector('[data-board]');
    if (!session) { board.innerHTML = ''; board.classList.remove('is-active'); return; }
    board.classList.add('is-active');
    board.innerHTML = session.board.map((tile, index) => `<button type="button" class="gaming-tile${tile.revealed ? ' revealed' : ''}" style="--tile-delay:${index * 25}ms" data-tile-id="${tile.id}" ${tile.revealed ? 'disabled' : ''} aria-label="Tile ${tile.id}">${tile.revealed ? `<span class="gaming-tile-reward">${formatReward(tile.reward)}</span>` : '<span aria-hidden="true">◆</span>'}</button>`).join('');
  }

  async function load() {
    const response = await api('/api/gaming');
    state.gaming = response.gaming;
    render();
  }

  function showView(view) {
    state.view = view;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setBusy(isBusy) {
    state.busy = isBusy;
    root.classList.toggle('gaming-busy', isBusy);
  }

  async function spin() {
    if (state.busy) return;
    setBusy(true);
    render();
    const resultEl = root.querySelector('[data-spin-result]');
    try {
      const response = await api('/api/gaming/spin', { method: 'POST', body: JSON.stringify({ idempotencyKey: idempotencyKey('gaming-spin') }) });
      resultEl.textContent = `${response.result.result.replace(/_/g, ' ')}: ${formatReward(response.result.reward)}`;
      resultEl.classList.add('gaming-result-flash');
      setTimeout(() => resultEl.classList.remove('gaming-result-flash'), 700);
      await load();
    } catch (error) { toast(error.message); }
    finally { setBusy(false); render(); }
  }

  async function startDigging() {
    if (state.busy) return;
    setBusy(true);
    render();
    try { await api('/api/gaming/digging/start', { method: 'POST' }); await load(); }
    catch (error) { toast(error.message); }
    finally { setBusy(false); render(); }
  }

  async function reveal(tileId) {
    if (state.busy) return;
    setBusy(true);
    try {
      const session = state.gaming.activeSession;
      const response = await api('/api/gaming/digging/reveal', { method: 'POST', body: JSON.stringify({ sessionId: session.id, tileId }) });
      root.querySelector('[data-dig-result]').textContent = formatReward(response.tile.reward);
      await load();
    } catch (error) { toast(error.message); }
    finally { setBusy(false); render(); }
  }

  async function watchAd(game) {
    if (state.busy) return;
    setBusy(true);
    const button = root.querySelector(`[data-gaming-ad="${game}"]`);
    const originalLabel = button?.textContent;
    try {
      const response = await api('/api/gaming/ads/start', { method: 'POST', body: JSON.stringify({ game, idempotencyKey: idempotencyKey(`gaming-ad:${game}`) }) });
      const adapter = window.DzMoneyGamingAd;
      if (!adapter?.ready || typeof adapter.handler !== 'function') throw new Error('No advertisement provider is configured for Gaming right now. Please try again later.');
      await adapter.ready;
      await adapter.handler({ type: 'preload', ymid: response.externalAdId, requestVar: 'gaming', timeout: 15 });
      await adapter.handler({ ymid: response.externalAdId, requestVar: 'gaming' });
      if (button) { button.textContent = 'VERIFYING…'; button.disabled = true; }
      const previousCount = state.gaming?.adCounts?.[game] || 0;
      let credited = response.duplicate === true;
      for (let i = 0; i < 10 && !credited; i += 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        await load();
        if ((state.gaming.adCounts?.[game] || 0) > previousCount) credited = true;
      }
      toast(credited ? 'Ad verified — reward credited.' : 'Ad watched. Verification can take a little longer — check back shortly.');
    } catch (error) { toast(error.message); }
    finally { setBusy(false); if (button) button.textContent = originalLabel; render(); }
  }

  root.addEventListener('click', event => {
    const view = event.target.closest('[data-gaming-view-link]');
    if (view) return showView(view.dataset.gamingViewLink);
    const spinButton = event.target.closest('[data-spin-action]');
    if (spinButton) return spin();
    const digStart = event.target.closest('[data-dig-start]');
    if (digStart) return startDigging();
    const tile = event.target.closest('[data-tile-id]');
    if (tile) return reveal(Number(tile.dataset.tileId));
    const ad = event.target.closest('[data-gaming-ad]');
    if (ad) return watchAd(ad.dataset.gamingAd);
  });

  document.addEventListener('click', event => {
    const back = event.target.closest('[data-gaming-back]');
    if (back) showView('home');
  });

  load().catch(error => toast(error.message));
})();
