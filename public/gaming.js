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

  function render() {
    const gaming = state.gaming;
    if (!gaming) return;
    const account = gaming.account || {};
    root.querySelector('[data-spin-balance]').textContent = account.spins ?? 0;
    root.querySelector('[data-axe-balance]').textContent = account.axes ?? 0;
    root.querySelector('[data-energy]').textContent = `${account.energy_remaining ?? 0}/3`;
    root.querySelector('[data-spin-ad-count]').textContent = `${gaming.adCounts?.spin || 0}/${gaming.config.dailyAdLimit}`;
    root.querySelector('[data-dig-ad-count]').textContent = `${gaming.adCounts?.digging || 0}/${gaming.config.dailyAdLimit}`;
    const spinBar = root.querySelector('[data-spin-ad-bar]');
    const digBar = root.querySelector('[data-dig-ad-bar]');
    spinBar.style.width = `${Math.min(100, ((gaming.adCounts?.spin || 0) / gaming.config.dailyAdLimit) * 100)}%`;
    digBar.style.width = `${Math.min(100, ((gaming.adCounts?.digging || 0) / gaming.config.dailyAdLimit) * 100)}%`;
    root.querySelectorAll('[data-gaming-view]').forEach(el => el.classList.toggle('gaming-hidden', el.dataset.gamingView !== state.view));
    renderSession();
  }

  function renderSession() {
    const session = state.gaming?.activeSession;
    const board = root.querySelector('[data-board]');
    if (!session) { board.innerHTML = ''; return; }
    board.innerHTML = session.board.map(tile => `<button type="button" class="gaming-tile${tile.revealed ? ' revealed' : ''}" data-tile-id="${tile.id}" ${tile.revealed ? 'disabled' : ''} aria-label="Tile ${tile.id}">${tile.revealed ? formatReward(tile.reward) : '◆'}</button>`).join('');
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

  async function spin() {
    if (state.busy) return;
    state.busy = true;
    const button = root.querySelector('[data-spin-action]');
    button.disabled = true;
    try {
      const response = await api('/api/gaming/spin', { method: 'POST', body: JSON.stringify({ idempotencyKey: idempotencyKey('gaming-spin') }) });
      root.querySelector('[data-spin-result]').textContent = `${response.result.result}: ${formatReward(response.result.reward)}`;
      await load();
    } catch (error) { toast(error.message); }
    finally { state.busy = false; button.disabled = false; }
  }

  async function startDigging() {
    try { await api('/api/gaming/digging/start', { method: 'POST' }); await load(); }
    catch (error) { toast(error.message); }
  }

  async function reveal(tileId) {
    if (state.busy) return;
    state.busy = true;
    try {
      const session = state.gaming.activeSession;
      const response = await api('/api/gaming/digging/reveal', { method: 'POST', body: JSON.stringify({ sessionId: session.id, tileId }) });
      root.querySelector('[data-dig-result]').textContent = `${formatReward(response.tile.reward)}`;
      await load();
    } catch (error) { toast(error.message); }
    finally { state.busy = false; }
  }

  async function watchAd(game) {
    if (state.busy) return;
    state.busy = true;
    try {
      const response = await api('/api/gaming/ads/start', { method: 'POST', body: JSON.stringify({ game, idempotencyKey: idempotencyKey(`gaming-ad:${game}`) }) });
      const adapter = window.DzMoneyGamingAd;
      if (!adapter?.ready || typeof adapter.handler !== 'function') throw new Error('Gaming advertisement provider is unavailable');
      await adapter.ready;
      await adapter.handler({ type: 'preload', ymid: response.externalAdId, requestVar: 'gaming', timeout: 15 });
      await adapter.handler({ ymid: response.externalAdId, requestVar: 'gaming' });
      for (let i = 0; i < 10; i += 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        await load();
        if ((state.gaming.adCounts?.[game] || 0) >= Number(state.gaming.config.dailyAdLimit) || response.duplicate) break;
      }
      toast('Advertisement completed. Verification is server-side.');
    } catch (error) { toast(error.message); }
    finally { state.busy = false; }
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
