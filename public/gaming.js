(() => {
  const tg = window.Telegram?.WebApp;
  const root = document.querySelector('[data-page="gaming"]');
  if (!root) return;
  const state = { gaming: null, view: 'home', busy: false };
  const assetVersion = new URL(document.currentScript?.src || '', window.location.href).searchParams.get('v') || 'runtime';

  const api = async (path, options = {}) => {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (tg?.initData) headers['X-Telegram-Init-Data'] = tg.initData;
    const response = await fetch(path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Gaming request failed');
    return data;
  };

  const idempotencyKey = prefix => `${prefix}:${crypto.randomUUID()}`;
  const formatReward = (reward, result) => {
    if (result === 'extra_spin') return '+1 SPIN';
    if (result === 'extra_axe') return '+1 AXE';
    return Object.entries(reward || {}).map(([key, value]) => `${value} ${key.toUpperCase()}`).join(' + ') || 'No Reward';
  };
  const toast = message => { if (typeof window.showToast === 'function') window.showToast(message); else console.info(message); };
  const setAll = (selector, value) => root.querySelectorAll(selector).forEach(el => { el.textContent = value; });
  const formatGamingAdFailure = (providerId, stage, error) => {
    const providerName = providerId || 'unknown';
    if (stage === 'start') return `${providerName}: the ad session could not be started.`;
    if (stage === 'ready') return `${providerName}: the ad SDK is not ready.`;
    if (stage === 'show') return `${providerName}: the advertisement could not be displayed.`;
    if (stage === 'complete') return `${providerName}: the advertisement was shown, but completion could not be confirmed.`;
    return `${providerName}: ${error?.message || 'the advertisement failed.'}`;
  };

  const wheelResults = ['coin_100', 'coin_1000', 'dzx_1', 'dzx_10', 'dzp_1', 'dzp_10', 'extra_spin', 'none'];
  const wheelLabels = { coin_100:'100 COIN', coin_1000:'1K COIN', dzx_1:'1 DZX', dzx_10:'10 DZX', dzp_1:'1 DZP', dzp_10:'10 DZP', extra_spin:'+1 SPIN', none:'NO REWARD' };

  function ensureGamingRuntimeStyles() {
    if (document.querySelector('link[data-dzmoney-gaming-runtime-css]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `/gaming-runtime.css?v=${encodeURIComponent(assetVersion)}`;
    link.dataset.dzmoneyGamingRuntimeCss = 'true';
    document.head.appendChild(link);
  }

  function ensureSpinWheel() {
    ensureGamingRuntimeStyles();
    const card = root.querySelector('[data-spin-wheel-host]') || root.querySelector('[data-spin-result]')?.parentElement;
    if (!card || card.querySelector('[data-spin-wheel]')) return;
    const host = document.createElement('div');
    host.className = 'spin-wheel-host';
    host.setAttribute('data-spin-wheel-host', '');
    host.innerHTML = `<div class="spin-wheel-wrap"><span class="spin-wheel-pointer" aria-hidden="true"></span><div class="spin-wheel" data-spin-wheel role="button" tabindex="0" aria-label="Spin the wheel"><div class="spin-wheel-labels">${wheelResults.map((result, index) => `<span class="spin-wheel-segment" data-spin-wheel-segment="${result}" style="--i:${index}"><b>${wheelLabels[result]}</b></span>`).join('')}</div><div class="spin-wheel-center">SPIN</div></div></div>`;
    const result = card.querySelector('[data-spin-result]');
    result?.before(host);
  }

  function renderRewardLists() {
    const spinList = root.querySelector('[data-gaming-view="spin"] .gaming-reward-list');
    if (spinList) spinList.innerHTML = wheelResults.map(result => `<span class="gaming-pill gaming-pill-${result}">${wheelLabels[result]}</span>`).join('');
    const diggingList = root.querySelector('[data-gaming-view="digging"] .gaming-reward-list');
    if (diggingList) diggingList.innerHTML = wheelResults.map(result => `<span class="gaming-pill gaming-pill-${result === 'extra_spin' ? 'extra_axe' : result}">${result === 'extra_spin' ? '+1 AXE' : wheelLabels[result]}</span>`).join('');
  }

  function render() {
    const gaming = state.gaming;
    if (!gaming) return;
    ensureSpinWheel();
    renderRewardLists();
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
    root.querySelectorAll('[data-gaming-ad]').forEach(btn => {
      const reachedLimit = (gaming.adCounts?.[btn.dataset.gamingAd] || 0) >= dailyAdLimit;
      btn.disabled = state.busy || reachedLimit;
      if (!state.busy) btn.textContent = reachedLimit ? 'DAILY LIMIT REACHED' : 'WATCH AD';
    });
    root.querySelectorAll('.gaming-card-count').forEach(count => {
      const value = Number(count.querySelector('strong')?.textContent) || 0;
      count.classList.toggle('ready', value > 0);
      count.classList.toggle('empty', value < 1);
    });
    const wheel = root.querySelector('[data-spin-wheel]');
    if (wheel) {
      const unavailable = account.spins < 1 || state.busy;
      wheel.classList.toggle('is-unavailable', account.spins < 1);
      wheel.classList.toggle('is-busy', state.busy);
      wheel.setAttribute('aria-disabled', String(unavailable));
      wheel.setAttribute('tabindex', unavailable ? '-1' : '0');
      const center = wheel.querySelector('.spin-wheel-center');
      if (center) center.textContent = state.busy ? '…' : 'SPIN';
    }
    renderSession();
  }

  function renderSession() {
    const session = state.gaming?.activeSession;
    const board = root.querySelector('[data-board]');
    if (!board) return;
    if (!session) { board.innerHTML = ''; board.classList.remove('is-active'); return; }
    board.classList.add('is-active');
    board.innerHTML = session.board.map((tile, index) => `<button type="button" class="gaming-tile${tile.revealed ? ' revealed gaming-tile-' + (tile.result || 'none') : ''}" style="--tile-delay:${index * 25}ms" data-tile-id="${tile.id}" ${tile.revealed ? 'disabled' : ''} aria-label="Dig tile ${tile.id}"><span class="gaming-tile-image" data-digging-image>${tile.revealed ? `<span class="gaming-tile-reward">${formatReward(tile.reward, tile.result)}</span>` : '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="34" r="22" fill="rgba(85,230,176,.08)" stroke="none"/><path d="M14 49h36M24 45l18-18M38 25l7-7 8 8-7 7M25 44l-5 5M18 50h14"/><path d="M43 13l8 8"/></svg>'}</span></button>`).join('');
  }

  async function load() {
    const response = await api('/api/gaming');
    state.gaming = response.gaming;
    render();
  }

  function showView(view) {
    state.view = view;
    render();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }

  function setBusy(isBusy) {
    state.busy = isBusy;
    root.classList.toggle('gaming-busy', isBusy);
  }

  function animateWheel(result) {
    const wheel = root.querySelector('[data-spin-wheel]');
    if (!wheel) return Promise.resolve();
    const index = Math.max(0, wheelResults.indexOf(result));
    const segment = 360 / wheelResults.length;
    const rotation = 360 * 3 - index * segment - segment / 2;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    wheel.style.setProperty('--wheel-rotation', `${rotation}deg`);
    wheel.classList.remove('is-winner', 'is-spinning');
    void wheel.offsetWidth;
    if (reduced) {
      wheel.classList.add('is-winner');
      wheel.querySelector(`[data-spin-wheel-segment="${result}"]`)?.classList.add('is-winning');
      return Promise.resolve();
    }
    wheel.classList.add('is-spinning');
    return new Promise(resolve => {
      window.setTimeout(() => {
        wheel.classList.remove('is-spinning');
        wheel.classList.add('is-winner');
        wheel.querySelectorAll('[data-spin-wheel-segment]').forEach(segmentEl => segmentEl.classList.remove('is-winning'));
        wheel.querySelector(`[data-spin-wheel-segment="${result}"]`)?.classList.add('is-winning');
        root.querySelector('.spin-wheel-pointer')?.classList.add('is-bouncing');
        window.setTimeout(() => root.querySelector('.spin-wheel-pointer')?.classList.remove('is-bouncing'), 260);
        resolve();
      }, 3200);
    });
  }

  async function spin() {
    if (state.busy || (state.gaming?.account?.spins || 0) < 1) return;
    setBusy(true);
    render();
    const resultEl = root.querySelector('[data-spin-result]');
    try {
      const response = await api('/api/gaming/spin', { method: 'POST', body: JSON.stringify({ idempotencyKey: idempotencyKey('gaming-spin') }) });
      await animateWheel(response.result.result);
      resultEl.textContent = `${response.result.result.replace(/_/g, ' ')}: ${formatReward(response.result.reward, response.result.result)}`;
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
      root.querySelector('[data-dig-result]').textContent = formatReward(response.tile.reward, response.tile.result);
      await load();
    } catch (error) { toast(error.message); }
    finally { setBusy(false); render(); }
  }

  async function watchAd(game) {
    if (state.busy) return;
    if (typeof window.DzMoneyAdClient?.getProvider !== 'function') {
      toast('Advertisement providers are not ready. Please try again later.');
      return;
    }
    const button = root.querySelector(`[data-gaming-ad="${game}"]`);
    const originalLabel = button?.textContent || 'WATCH AD';
    let providerId = null;
    let stage = 'start';
    setBusy(true);
    if (button) { button.textContent = 'LOADING AD…'; button.setAttribute('aria-busy', 'true'); }
    try {
      let response;
      try {
        response = await api('/api/gaming/ads/start', { method: 'POST', body: JSON.stringify({ game, idempotencyKey: idempotencyKey(`gaming-ad:${game}`) }) });
        providerId = response.providerId;
      } catch (error) {
        throw error;
      }
      const adapter = window.DzMoneyAdClient.getProvider(providerId);
      stage = 'ready';
      if (!adapter?.ready || typeof adapter.handler !== 'function') throw new Error('provider adapter is unavailable');
      try {
        await adapter.ready;
      } catch (error) {
        throw error;
      }
      stage = 'show';
      let completion;
      try {
        completion = await adapter.handler({ requestVar: 'gaming', adEventId: response.adEventId, ymid: response.externalAdId });
      } catch (error) {
        throw error;
      }
      stage = 'complete';
      if (button) button.textContent = 'CREDITING…';
      await load();
      toast(completion.duplicate ? 'Ad already credited.' : 'Ad watched — reward credited.');
    } catch (error) {
      toast(`Gaming Ad failed — ${formatGamingAdFailure(providerId, stage, error)}`);
    } finally {
      setBusy(false);
      if (button) { button.textContent = originalLabel; button.removeAttribute('aria-busy'); }
      render();
    }
  }

  root.addEventListener('click', event => {
    const view = event.target.closest('[data-gaming-view-link]');
    if (view) return showView(view.dataset.gamingViewLink);
    const wheel = event.target.closest('[data-spin-wheel]');
    if (wheel) return spin();
    const spinButton = event.target.closest('[data-spin-action]');
    if (spinButton) return spin();
    const digStart = event.target.closest('[data-dig-start]');
    if (digStart) return startDigging();
    const tile = event.target.closest('[data-tile-id]');
    if (tile) return reveal(Number(tile.dataset.tileId));
    const ad = event.target.closest('[data-gaming-ad]');
    if (ad) return watchAd(ad.dataset.gamingAd);
  });

  root.addEventListener('keydown', event => {
    const wheel = event.target.closest('[data-spin-wheel]');
    if (wheel && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); spin(); }
  });

  document.addEventListener('click', event => {
    const back = event.target.closest('[data-gaming-back]');
    if (back) showView('home');
  });

  load().catch(error => toast(error.message));
})();
