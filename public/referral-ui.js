(() => {
  const tg = window.Telegram?.WebApp;
  const $ = id => document.getElementById(id);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = { data: null, busy: new Set() };

  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (tg?.initData) headers['X-Telegram-Init-Data'] = tg.initData;
    const response = await fetch(path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: response.status, data });
    return data;
  }

  function toast(message) {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  async function attributeFromStartParam() {
    const startParam = tg?.initDataUnsafe?.start_param || '';
    if (!/^ref[_:-]/i.test(startParam)) return;
    try {
      await api('/api/referral/attribute', { method: 'POST', body: JSON.stringify({ referralCode: startParam }) });
    } catch (error) {
      if (!/already assigned|Self-referral/i.test(error.message || '')) console.warn('Referral attribution:', error.message);
    }
  }

  function render(data) {
    state.data = data;
    const count = $('refCount');
    if (count) count.textContent = `${data.qualifiedCount} qualified friends`;
    const linkText = $('referralLinkText');
    if (linkText) linkText.textContent = data.link || 'Referral link is not configured yet.';
    const container = $('referralAchievements');
    if (!container) return;
    container.innerHTML = data.achievements.map(item => {
      const status = item.claimed ? 'COMPLETED' : item.eligible ? 'CLAIM' : 'INVITE';
      const disabled = item.claimed ? 'disabled' : '';
      return `<article class="task-card referral-achievement" data-milestone="${item.milestone}">
        <div class="task-icon">↗</div>
        <div class="task-info"><strong>${String(item.title)}</strong><span>${item.milestone} qualified referrals</span><small>${item.rewardCoin} COIN • ${item.rewardDzx} DZX • ${item.rewardDzp} DZP</small></div>
        <button class="secondary-btn achievement-action" data-milestone="${item.milestone}" ${disabled}>${status}</button>
      </article>`;
    }).join('');
  }

  async function load() {
    try {
      await attributeFromStartParam();
      render(await api('/api/referral/me'));
    } catch (error) {
      toast(error.message || 'Referral data is temporarily unavailable.');
    }
  }

  async function showVerificationAd(ymid) {
    const adapter = window.DzMoneyMonetag;
    if (!adapter?.handler) throw new Error('Advertisement provider is not ready');
    await Promise.resolve(adapter.ready);
    if (ymid) await adapter.handler({ type: 'preload', ymid, requestVar: 'verification', timeout: 12 });
    await adapter.handler({ ymid, requestVar: 'verification' });
  }

  async function waitForClaim(milestone) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const status = await api(`/api/referral/achievement/${encodeURIComponent(milestone)}/status`);
      if (status.status === 'ready_to_claim' || status.status === 'claimed') return status;
      await wait(1000);
    }
    return api(`/api/referral/achievement/${encodeURIComponent(milestone)}/status`);
  }

  async function invite(milestone) {
    if (!state.data?.link) throw new Error('Referral link is not configured');
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(state.data.link)}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(shareUrl);
    else window.open(shareUrl, '_blank', 'noopener,noreferrer');
    toast(`Invite a friend to reach Invite ${milestone}.`);
  }

  async function claim(milestone) {
    if (state.busy.has(milestone)) return;
    state.busy.add(milestone);
    const button = document.querySelector(`.achievement-action[data-milestone="${milestone}"]`);
    if (button) { button.disabled = true; button.textContent = 'Loading…'; }
    try {
      const start = await api(`/api/referral/achievement/${encodeURIComponent(milestone)}/start`, { method: 'POST', body: JSON.stringify({}) });
      if (start.claimed) { await load(); return; }
      await showVerificationAd(start.verificationAdId);
      toast('Advertisement completed. Waiting for server verification…');
      const status = await waitForClaim(milestone);
      if (status.status !== 'ready_to_claim') throw new Error('Advertisement verification is still pending');
      const result = await api(`/api/referral/achievement/${encodeURIComponent(milestone)}/finalize`, { method: 'POST', body: JSON.stringify({}) });
      toast(result.rewarded ? 'Achievement reward credited.' : 'Achievement already claimed.');
      await load();
    } catch (error) {
      toast(error.message || 'Unable to claim achievement.');
      await load();
    } finally {
      state.busy.delete(milestone);
    }
  }

  document.addEventListener('click', event => {
    const copy = event.target.closest('#copyReferral');
    if (copy) {
      event.preventDefault();
      if (!state.data?.link) return toast('Referral link is not configured.');
      navigator.clipboard?.writeText(state.data.link).then(() => toast('Referral link copied.')).catch(() => toast(state.data.link));
      return;
    }
    const button = event.target.closest('.achievement-action');
    if (!button || button.disabled) return;
    const milestone = Number(button.dataset.milestone);
    const achievement = state.data?.achievements?.find(item => Number(item.milestone) === milestone);
    if (!achievement) return;
    if (achievement.eligible) claim(milestone).catch(error => toast(error.message));
    else invite(milestone).catch(error => toast(error.message));
  });

  window.addEventListener('focus', load);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  load();
})();
