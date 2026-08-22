const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const MONETAG_ZONE_ID = '11627577';
const MONETAG_GLOBAL_NAME = `show_${MONETAG_ZONE_ID}`;
const state = { page: 'home', balance: { coin: 0, dzx: 0, dzp: 0 }, user: null, dailyBusy: false, dailyCooldownUntil: null };
const $ = id => document.getElementById(id);

let monetagHandler = null;
const monetagDiagnostics = { startedAt: performance.now(), adapterReadyAt: null, attempts: 0, preloadReadyAt: null };

function getMonetagHandler() {
  const adapter = window.DzMoneyMonetag;
  if (adapter?.handler && typeof adapter.handler === 'function') {
    if (monetagDiagnostics.adapterReadyAt == null) monetagDiagnostics.adapterReadyAt = performance.now();
    monetagHandler = adapter.handler;
    return monetagHandler;
  }
  return null;
}

function getMonetagGlobalState() {
  const globalHandler = window[MONETAG_GLOBAL_NAME];
  const adapter = window.DzMoneyMonetag;
  return {
    globalName: MONETAG_GLOBAL_NAME,
    globalType: typeof globalHandler,
    globalReady: typeof globalHandler === 'function',
    matchingGlobals: Object.keys(window).filter(key => /^show_\\d+$/.test(key)).slice(0, 20),
    adapterKeys: adapter && typeof adapter === 'object' ? Object.keys(adapter) : [],
    adapterHasHandler: Boolean(adapter?.handler && typeof adapter.handler === 'function')
  };
}

function getMonetagResourceState() {
  const names = [
    'https://libtl.com/sdk.js',
    'https://telegram.org/js/telegram-web-app.js'
  ];
  return names.map(name => performance.getEntriesByName(name).map(entry => ({
    name: entry.name,
    duration: Math.round(entry.duration),
    transferSize: entry.transferSize ?? null,
    encodedBodySize: entry.encodedBodySize ?? null,
    decodedBodySize: entry.decodedBodySize ?? null,
    responseStatus: entry.responseStatus ?? null
  })));
}

function serializeMonetagError(error) {
  if (!error) return null;
  return {
    name: error.name || 'Error',
    message: String(error.message || error),
    code: error.code ?? null,
    type: error.type ?? null,
    stack: error.stack ? String(error.stack).split('\\n').slice(0, 6).join('\\n') : null,
    ownKeys: Object.keys(error)
  };
}

function monetagSnapshot() {
  const handler = getMonetagHandler();
  return {
    provider: 'monetag-tg-sdk',
    zoneId: MONETAG_ZONE_ID,
    adapterPresent: Boolean(window.DzMoneyMonetag),
    handlerType: typeof handler,
    apiReady: typeof handler === 'function',
    adapterReadyAfterMs: monetagDiagnostics.adapterReadyAt == null ? null : Math.round(monetagDiagnostics.adapterReadyAt - monetagDiagnostics.startedAt),
    preloadReadyAfterMs: monetagDiagnostics.preloadReadyAt == null ? null : Math.round(monetagDiagnostics.preloadReadyAt - monetagDiagnostics.startedAt),
    attempts: monetagDiagnostics.attempts,
    telegramPlatform: tg?.platform || 'unknown',
    telegramVersion: tg?.version || 'unknown',
    readyState: document.readyState,
    userAgent: navigator.userAgent,
    monetagGlobal: getMonetagGlobalState(),
    sdkResources: getMonetagResourceState().flat()
  };
}

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function ensureMonetagSdk(timeoutMs = 15000) {
  const started = performance.now();
  monetagDiagnostics.attempts += 1;
  while (true) {
    const handler = getMonetagHandler();
    if (handler) return handler;
    if (performance.now() - started >= timeoutMs) throw new Error('Monetag SDK adapter did not initialize');
    await wait(100);
  }
}

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

function format(value) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(Number(value || 0)); }
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
  try { await api('/health'); document.querySelector('.status').innerHTML = '<i></i> Online'; }
  catch { document.querySelector('.status').innerHTML = '<i style="background:#ff8d8d"></i> Offline'; }
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

function setDailyButton(button, text, disabled) { button.disabled = disabled; button.textContent = text; }
function formatCooldown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
function startDailyCooldown(nextEligibleAt) {
  const until = new Date(nextEligibleAt).getTime();
  if (!Number.isFinite(until)) return;
  state.dailyCooldownUntil = until;
  clearInterval(startDailyCooldown.timer);
  const button = $('dailyBtn');
  const tick = () => {
    const remaining = state.dailyCooldownUntil - Date.now();
    if (remaining <= 0) {
      state.dailyCooldownUntil = null;
      clearInterval(startDailyCooldown.timer);
      setDailyButton(button, 'Check in', false);
      $('dailyText').textContent = 'Watch the required advertisement to claim today’s reward.';
      return;
    }
    setDailyButton(button, `Cooldown ${formatCooldown(remaining)}`, true);
    $('dailyText').textContent = `Daily Check-in available again in ${formatCooldown(remaining)}.`;
  };
  tick();
  startDailyCooldown.timer = setInterval(tick, 1000);
}

function renderMonetagDiagnostic(extra = null) {
  const result = $('monetagDiagnosticResult');
  if (!result) return;
  result.textContent = JSON.stringify({ snapshot: monetagSnapshot(), ...(extra || {}) }, null, 2);
}

async function preloadMonetagAd(ymid) {
  const handler = await ensureMonetagSdk();
  const id = ymid || `preload-${Date.now()}`;
  await handler({ type: 'preload', timeout: 8, catchIfNoFeed: true, ymid: id });
  monetagDiagnostics.preloadReadyAt = performance.now();
  return { handler, ymid: id };
}

async function runMonetagDiagnostic() {
  renderMonetagDiagnostic({ status: 'checking adapter and real Monetag global…' });
  try {
    await ensureMonetagSdk();
    const beforePreload = { snapshot: monetagSnapshot() };
    renderMonetagDiagnostic({ status: 'SDK adapter ready. Checking real show_11627577 and preloading…', beforePreload });
    const ymid = `diagnostic-${Date.now()}`;
    await preloadMonetagAd(ymid);
    renderMonetagDiagnostic({
      status: 'Rewarded Interstitial preload succeeded. Ready to show.',
      ymid,
      afterPreload: { snapshot: monetagSnapshot() }
    });
  } catch (error) {
    renderMonetagDiagnostic({
      status: 'Advertisement unavailable',
      error: serializeMonetagError(error),
      afterFailure: { snapshot: monetagSnapshot() }
    });
  }
}

async function testMonetagAd() {
  const result = $('monetagDiagnosticResult');
  if (!result) return;
  try {
    const handler = await ensureMonetagSdk();
    const ymid = `diagnostic-${Date.now()}`;
    renderMonetagDiagnostic({ status: 'Preloading Rewarded Interstitial…', ymid, beforePreload: { snapshot: monetagSnapshot() } });
    await handler({ type: 'preload', timeout: 8, catchIfNoFeed: true, ymid });
    monetagDiagnostics.preloadReadyAt = performance.now();
    renderMonetagDiagnostic({ status: 'Preload succeeded. Showing Rewarded Interstitial…', ymid, beforeShow: { snapshot: monetagSnapshot() } });
    const adResult = await handler({ ymid, requestVar: 'diagnostic' });
    renderMonetagDiagnostic({ status: 'Advertisement completed', adResult, ymid, afterShow: { snapshot: monetagSnapshot() } });
  } catch (error) {
    renderMonetagDiagnostic({
      status: 'Advertisement call failed',
      error: serializeMonetagError(error),
      afterFailure: { snapshot: monetagSnapshot() }
    });
  }
}

async function startDailyCheckinAd(ymid) {
  if (!ymid) throw new Error('Daily Check-in advertisement id is missing');
  const handler = await ensureMonetagSdk();
  $('dailyText').textContent = 'Preparing the advertisement…';
  await handler({ type: 'preload', timeout: 8, catchIfNoFeed: true, ymid });
  $('dailyText').textContent = 'Watch the advertisement to complete your check-in.';
  await handler({ ymid, requestVar: 'daily_checkin' });
}

async function startDailyCheckinAdFlow() {
  if (state.dailyBusy || state.dailyCooldownUntil) return;
  const button = $('dailyBtn');
  state.dailyBusy = true;
  setDailyButton(button, 'Loading…', true);
  try {
    const handler = await ensureMonetagSdk();
    if (typeof handler !== 'function') throw new Error('Monetag SDK is unavailable');
    const claim = await api('/api/daily-checkin/claim', { method: 'POST', body: JSON.stringify({ idempotencyKey: `daily:${crypto.randomUUID()}` }) });
    await startDailyCheckinAd(claim.adEvent?.external_ad_id);
    $('dailyText').textContent = 'Advertisement completed. Waiting for server verification.';
    toast('Advertisement completed. Your reward is being verified.');
    await loadMe();
  } catch (error) {
    if (error.status === 429 && error.data?.nextEligibleAt) {
      startDailyCooldown(error.data.nextEligibleAt);
      toast('Daily Check-in is on cooldown.');
    } else {
      toast(error.message || 'Unable to show the advertisement.');
      $('dailyText').textContent = error.message || 'Unable to show the advertisement.';
    }
  } finally {
    state.dailyBusy = false;
    if (!state.dailyCooldownUntil) setDailyButton(button, 'Check in', false);
  }
}

document.addEventListener('click', event => {
  const nav = event.target.closest('[data-go]');
  if (nav) { showPage(nav.dataset.go); if (nav.dataset.go === 'monetag') renderMonetagDiagnostic({ status: 'ready to test' }); return; }
  if (event.target.closest('#dailyBtn')) startDailyCheckinAdFlow();
  if (event.target.closest('#monetagTestBtn')) { showPage('monetag'); renderMonetagDiagnostic({ status: 'checking adapter and real Monetag global…' }); runMonetagDiagnostic(); }
  if (event.target.closest('#runMonetagDiagnostic')) runMonetagDiagnostic();
  if (event.target.closest('#runMonetagAdTest')) testMonetagAd();
  if (event.target.closest('#taskVerifyBtn')) toast('Task verification is awaiting the real task/provider adapter.');
  if (event.target.closest('#withdrawBtn')) toast('Withdrawal flow will open after the wallet backend is implemented and verified.');
  if (event.target.closest('#copyReferral')) toast('Referral link generation will be enabled when the Referral phase is implemented.');
});

renderBalances();
loadHealth();
loadMe();
