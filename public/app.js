const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const $ = (id) => document.getElementById(id);
const state = {
  squad: null,
  daily: null,
  adsgram: { enabled: false, blockId: null },
  adController: null,
  adEventId: null,
  dailyLoading: null,
};

function headers(extra = {}) {
  const h = { ...extra };
  if (tg?.initData) h['X-Telegram-Init-Data'] = tg.initData;
  return h;
}

async function api(path, options = {}) {
  const r = await fetch(path, { ...options, headers: headers(options.headers || {}) });
  const text = await r.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  if (!r.ok) throw Object.assign(new Error(data.error || `HTTP ${r.status}`), { status: r.status, data });
  return data;
}

function toast(message) { const e = $('toast'); if (!e) return; e.textContent = message; e.classList.add('show'); setTimeout(() => e.classList.remove('show'), 2600); }
function formatReward(r) { const p = []; if (Number(r?.coin) > 0) p.push(`${Number(r.coin).toLocaleString()} COIN`); if (Number(r?.dzx) > 0) p.push(`${Number(r.dzx).toLocaleString()} DZX`); if (Number(r?.dzp) > 0) p.push(`${Number(r.dzp).toLocaleString()} DZP`); return p.join(' • ') || '—'; }
function formatCountdown(d) { const t = Math.ceil(Math.max(0, new Date(d).getTime() - Date.now()) / 1000); return `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; }
function setDailyView(text, disabled = false) { const a = $('dailyAction'); if (!a) return; a.textContent = text; a.disabled = disabled; }

function renderDaily(data) {
  state.daily = data;
  state.adEventId = data.status === 'ad_pending' ? data.pendingAdEventId : null;
  const reward = $('dailyReward'); const status = $('dailyStatus'); const note = $('dailyNote');
  if (reward) reward.textContent = formatReward(data.reward);
  if (data.status === 'cooldown') {
    const tick = () => {
      if (state.daily?.status !== 'cooldown') return;
      if (status) status.textContent = `Available in ${formatCountdown(data.nextAvailableAt)}`;
      setDailyView('24H COOLDOWN', true);
      if (Date.now() < new Date(data.nextAvailableAt).getTime()) setTimeout(tick, 1000); else loadDaily();
    };
    tick(); return;
  }
  if (data.status === 'ad_pending') {
    if (status) status.textContent = 'Advertisement completed — claim your reward';
    setDailyView('Claim Reward', false); return;
  }
  if (status) status.textContent = state.adsgram.enabled ? 'Watch an ad to unlock today’s reward' : 'AdsGram is not configured yet.';
  if (note) note.textContent = state.adsgram.enabled ? 'The reward is issued only after a verified advertisement completion.' : 'AdsGram Block ID is required before an advertisement can be started.';
  setDailyView('Daily Check-in', false);
}

async function loadDaily() {
  if (state.dailyLoading) return state.dailyLoading;
  state.dailyLoading = (async () => {
    try {
      const data = await api('/api/daily/checkin');
      renderDaily(data);
      return data;
    } catch (e) {
      if ($('dailyStatus')) $('dailyStatus').textContent = e.status === 401 ? 'Authentication required' : 'Daily activity unavailable';
      setDailyView('Daily Check-in', false);
      throw e;
    } finally { state.dailyLoading = null; }
  })();
  return state.dailyLoading;
}

async function loadAdsgramConfig() {
  try {
    const config = await api('/api/config');
    state.adsgram = config.adsgram || { enabled: false, blockId: null };
    if (state.adsgram.enabled && state.adsgram.blockId && window.Adsgram) state.adController = window.Adsgram.init({ blockId: state.adsgram.blockId });
  } catch { state.adsgram = { enabled: false, blockId: null }; state.adController = null; }
  await loadDaily().catch(() => {});
}

async function handleDailyAction() {
  if (!state.daily) {
    try { await loadDaily(); } catch { return; }
  }
  const data = state.daily;
  if (!data) { toast('Daily Activity is unavailable right now.'); return; }
  if (data.status === 'cooldown') return;
  if (data.status === 'ad_pending') return claimDaily();
  return startDailyAd();
}

async function startDailyAd() {
  if (!state.adsgram.enabled || !state.adsgram.blockId) { toast('AdsGram is not configured yet. Add the official Block ID first.'); return; }
  if (!state.adController) { toast('AdsGram could not be initialized.'); return; }
  const action = $('dailyAction'); if (action) { action.disabled = true; action.textContent = 'Preparing…'; }
  try {
    const started = await api('/api/daily/checkin/ad/start', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `daily-ad-${crypto.randomUUID()}` }, body: '{}' });
    state.adEventId = started.adEvent?.id || null;
    if (!state.adEventId) throw new Error('Daily advertisement event was not created.');
    if (action) action.textContent = 'Watching…';
    await state.adController.show();
    if (action) action.textContent = 'Waiting for verification…';
    toast('Ad finished. Waiting for verified reward confirmation.');
    await loadDaily();
  } catch (e) { toast(e.message || 'Advertisement could not be completed.'); setDailyView('Daily Check-in', false); }
}

async function claimDaily() {
  if (!state.adEventId) { toast('No active daily advertisement.'); return; }
  const action = $('dailyAction'); if (action) action.disabled = true;
  try {
    const result = await api('/api/daily/checkin/claim', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `daily-claim-${crypto.randomUUID()}` }, body: JSON.stringify({ adEventId: state.adEventId }) });
    if (result.status === 'claimed') { toast('Daily reward claimed successfully.'); state.adEventId = null; await loadDaily(); await loadSquad(); }
  } catch (e) { toast(e.message || 'Reward could not be claimed.'); setDailyView('Claim Reward', false); }
}

function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
function renderSquad(d) { const s = d.squad || {}; if ($('members')) $('members').textContent = Number(s.memberCount || 0).toLocaleString(); if ($('active')) $('active').textContent = Number(s.activeMemberCount || 0).toLocaleString(); if ($('activity')) $('activity').textContent = `${Number(s.activityPercent || 0)}%`; if ($('squadMembers')) $('squadMembers').textContent = Number(s.memberCount || 0).toLocaleString(); if ($('squadActive')) $('squadActive').textContent = Number(s.activeMemberCount || 0).toLocaleString(); if ($('squadActivity')) $('squadActivity').textContent = `${Number(s.activityPercent || 0)}%`; if (!d.inSquad && $('goals')) $('goals').innerHTML = '<article class="info-card"><strong>No squad yet</strong><p>Your account is not currently assigned to a squad.</p></article>'; }
async function loadSquad() { try { renderSquad(await api('/api/squad')); await loadGoals(); } catch (e) { if ($('accountText')) $('accountText').textContent = e.status === 401 ? 'Open DzMoney inside Telegram to authenticate your account.' : 'The Squad service is temporarily unavailable.'; } }
async function loadGoals() { const g = $('goals'); if (!g) return; try { const d = await api('/api/squad/goals'); if (!d.inSquad || !d.goals?.length) { g.innerHTML = '<article class="info-card"><strong>Squad goals</strong><p>No active goals are published for your squad.</p></article>'; return; } g.innerHTML = d.goals.map((x) => { const p = Math.min(100, Number(x.progress || 0) / Math.max(1, Number(x.target_quantity || 1)) * 100); return `<article class="goal-card"><div class="goal-top"><span>${escapeHtml(x.target_type || 'Goal')}</span><strong>${escapeHtml(x.title || 'Squad goal')}</strong></div><p>${escapeHtml(x.description || 'Contribute qualifying activity to this goal.')}</p><div class="progress"><i style="width:${p}%"></i></div><div class="goal-meta"><span>${Number(x.progress || 0).toLocaleString()} / ${Number(x.target_quantity || 0).toLocaleString()}</span><span>${p.toFixed(0)}%</span></div></article>`; }).join(''); } catch { g.innerHTML = '<article class="info-card"><strong>Squad goals</strong><p>Goals are temporarily unavailable.</p></article>'; } }
function showPage(page) { document.querySelectorAll('.page').forEach((e) => e.classList.toggle('active', e.dataset.page === page)); document.querySelectorAll('.nav-item').forEach((e) => e.classList.toggle('active', e.dataset.go === page)); if (page === 'home') loadDaily().catch(() => {}); if (page === 'squad') loadSquad(); }

// Bind the Daily Check-in directly to the real button. This avoids relying on event delegation and keeps this control isolated.
const dailyAction = $('dailyAction');
if (dailyAction) dailyAction.addEventListener('click', (event) => { event.preventDefault(); void handleDailyAction(); });

document.querySelectorAll('[data-go]').forEach((element) => element.addEventListener('click', (event) => { event.preventDefault(); showPage(element.dataset.go); }));

const user = tg?.initDataUnsafe?.user;
if (user) { if ($('welcomeLabel')) $('welcomeLabel').textContent = `WELCOME, ${String(user.first_name || '').toUpperCase()}`; if ($('accountText')) $('accountText').textContent = `Connected as ${user.first_name || ''}${user.last_name ? ` ${user.last_name}` : ''}.`; }

loadSquad();
loadAdsgramConfig();
