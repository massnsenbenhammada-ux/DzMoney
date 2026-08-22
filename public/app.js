const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const state = { page: 'home', balance: { coin: 0, dzx: 0, dzp: 0 }, user: null, dailyBusy: false };
const $ = id => document.getElementById(id);

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}

function showPage(page) {
  state.page = page;
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.go === page));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function format(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(Number(value || 0));
}

function renderBalances() {
  $('coinBalance').textContent = format(state.balance.coin);
  $('dzxBalance').textContent = format(state.balance.dzx);
  $('dzpBalance').textContent = format(state.balance.dzp);
  $('totalBalance').textContent = format(state.balance.dzx);
  $('walletBalance').textContent = format(state.balance.dzx);
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (tg?.initData) headers['X-Telegram-Init-Data'] = tg.initData;
  const response = await fetch(path, { ...options, headers });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) throw Object.assign(new Error(data.error || `Request failed: ${response.status}`), { status: response.status, data });
  return data;
}

async function loadHealth() {
  try {
    await api('/health');
    document.querySelector('.status').innerHTML = '<i></i> Online';
  } catch {
    document.querySelector('.status').innerHTML = '<i style="background:#ff8d8d"></i> Offline';
  }
}

async function loadMe() {
  try {
    const data = await api('/api/me');
    state.user = data.user || null;
    const balances = data.balances || {};
    state.balance = { coin: balances.COIN || 0, dzx: balances.DZX || 0, dzp: balances.DZP || 0 };
    renderBalances();
    if (state.user?.firstName) {
      const title = document.querySelector('.welcome-row .eyebrow');
      if (title) title.textContent = `WELCOME, ${String(state.user.firstName).toUpperCase()}`;
    }
  } catch (error) {
    renderBalances();
    if (error.status === 401) toast('Open DzMoney inside Telegram to load your account.');
    else toast('Account data is temporarily unavailable.');
  }
}

/** Start the server-authoritative Daily Check-in advertisement flow. */
async function startDailyCheckinAd() {
  if (state.dailyBusy) return;
  const button = $('dailyBtn');
  state.dailyBusy = true;
  button.disabled = true;
  button.textContent = 'Loading…';
  try {
    const claim = await api('/api/daily-checkin/claim', { method: 'POST', body: JSON.stringify({ idempotencyKey: `daily:${crypto.randomUUID()}` }) });
    const ymid = claim.adEvent?.external_ad_id;
    if (!ymid || typeof window.show_11627577 !== 'function') throw new Error('Monetag SDK is not ready');
    $('dailyText').textContent = 'Watch the advertisement to complete your check-in.';
    await window.show_11627577({ type: 'end', ymid, requestVar: 'daily_checkin' });
    $('dailyText').textContent = 'Advertisement completed. Waiting for server verification.';
    toast('Advertisement completed. Your reward is being verified.');
    await loadMe();
  } catch (error) {
    toast(error.message || 'Unable to show the advertisement.');
    $('dailyText').textContent = 'Watch the required advertisement to claim today’s reward.';
  } finally {
    state.dailyBusy = false;
    button.disabled = false;
    button.textContent = 'Check in';
  }
}

document.addEventListener('click', event => {
  const nav = event.target.closest('[data-go]');
  if (nav) {
    showPage(nav.dataset.go);
    return;
  }
  if (event.target.closest('#dailyBtn')) startDailyCheckinAd();
  if (event.target.closest('#taskVerifyBtn')) toast('Task verification is awaiting the real task/provider adapter.');
  if (event.target.closest('#withdrawBtn')) toast('Withdrawal flow will open after the wallet backend is implemented and verified.');
  if (event.target.closest('#copyReferral')) {
    toast('Referral link generation will be enabled when the Referral phase is implemented.');
  }
});

renderBalances();
loadHealth();
loadMe();
