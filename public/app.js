const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const MONETAG_ZONE_ID = '11627577';
const MONETAG_SDK_SRC = 'https://libtl.com/sdk.js';
const state = { page: 'home', balance: { coin: 0, dzx: 0, dzp: 0 }, user: null, dailyBusy: false, dailyCooldownUntil: null };
const $ = id => document.getElementById(id);

let monetagScript = null;
let monetagSdkPromise = null;
const monetagDiagnostics = {
  startedAt: performance.now(),
  scriptLoadedAt: null,
  scriptErrorAt: null,
  apiReadyAt: typeof window.show_11627577 === 'function' ? performance.now() : null,
  platform: tg?.platform || 'unknown',
  version: tg?.version || 'unknown',
  attempts: 0
};
let monetagScriptState = typeof window.show_11627577 === 'function' ? 'ready' : 'not_started';

function monetagSnapshot() {
  return {
    sdkScriptPresent: Boolean(monetagScript),
    sdkScriptState: monetagScriptState,
    apiType: typeof window.show_11627577,
    apiReady: typeof window.show_11627577 === 'function',
    sdkLoadedAfterMs: monetagDiagnostics.scriptLoadedAt == null ? null : Math.round(monetagDiagnostics.scriptLoadedAt - monetagDiagnostics.startedAt),
    apiReadyAfterMs: monetagDiagnostics.apiReadyAt == null ? null : Math.round(monetagDiagnostics.apiReadyAt - monetagDiagnostics.startedAt),
    sdkErrorAfterMs: monetagDiagnostics.scriptErrorAt == null ? null : Math.round(monetagDiagnostics.scriptErrorAt - monetagDiagnostics.startedAt),
    attempts: monetagDiagnostics.attempts,
    telegramPlatform: tg?.platform || 'unknown',
    telegramVersion: tg?.version || 'unknown',
    readyState: document.readyState,
    userAgent: navigator.userAgent,
    sdkResources: performance.getEntriesByName(MONETAG_SDK_SRC).map(x => ({ duration: Math.round(x.duration), transferSize: x.transferSize, encodedBodySize: x.encodedBodySize }))
  };
}

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitForMonetagGlobal(timeoutMs = 15000) {
  const started = performance.now();
  while (typeof window.show_11627577 !== 'function') {
    if (performance.now() - started >= timeoutMs) throw new Error('Monetag SDK loaded but show_11627577 was not created');
    await wait(100);
  }
  monetagDiagnostics.apiReadyAt = performance.now();
  monetagScriptState = 'ready';
}

function loadMonetagSdkOnce() {
  if (typeof window.show_11627577 === 'function') {
    monetagScriptState = 'ready';
    monetagDiagnostics.apiReadyAt = performance.now();
    return Promise.resolve();
  }
  if (monetagSdkPromise) return monetagSdkPromise;

  monetagSdkPromise = new Promise((resolve, reject) => {
    monetagDiagnostics.attempts += 1;
    monetagScriptState = 'loading';

    const script = document.createElement('script');
    monetagScript = script;
    script.type = 'text/javascript';
    script.src = MONETAG_SDK_SRC;
    script.async = true;
    script.setAttribute('data-zone', MONETAG_ZONE_ID);
    script.setAttribute('data-sdk', `show_${MONETAG_ZONE_ID}`);
    script.setAttribute('data-cfasync', 'false');

    let settled = false;
    const fail = error => {
      if (settled) return;
      settled = true;
      monetagScriptState = 'load_error';
      monetagDiagnostics.scriptErrorAt = performance.now();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    script.onload = async () => {
      monetagDiagnostics.scriptLoadedAt = performance.now();
      monetagScriptState = 'loaded_waiting_api';
      try {
        await waitForMonetagGlobal(15000);
        if (settled) return;
        settled = true;
        resolve();
      } catch (error) {
        fail(error);
      }
    };

    script.onerror = () => fail(new Error('Monetag SDK script failed to load'));
    document.head.appendChild(script);

    setTimeout(() => {
      if (!settled && typeof window.show_11627577 !== 'function') fail(new Error('Monetag SDK did not become ready'));
    }, 20000);
  });

  return monetagSdkPromise;
}

async function ensureMonetagSdk() {
  if (typeof window.show_11627577 === 'function') return;
  try {
    await loadMonetagSdkOnce();
  } catch (firstError) {
    // A transient Telegram WebView/network failure should not permanently disable ads.
    monetagSdkPromise = null;
    if (monetagScript?.parentNode) monetagScript.parentNode.removeChild(monetagScript);
    monetagScript = null;
    await wait(500);
    await loadMonetagSdkOnce();
    if (typeof window.show_11627577 !== 'function') throw firstError;
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

async function runMonetagDiagnostic() {
  renderMonetagDiagnostic({ status: 'loading Monetag SDK…' });
  try {
    await ensureMonetagSdk();
    renderMonetagDiagnostic({ status: 'SDK ready. show_11627577 is available.' });
  } catch (error) {
    renderMonetagDiagnostic({ status: 'SDK not ready', error: String(error?.message || error) });
  }
}

async function testMonetagAd() {
  const result = $('monetagDiagnosticResult');
  if (!result) return;
  try {
    await ensureMonetagSdk();
    renderMonetagDiagnostic({ status: 'Calling show_11627577…' });
    const adResult = await window.show_11627577({ type: 'end', ymid: `diagnostic-${Date.now()}`, requestVar: 'diagnostic' });
    renderMonetagDiagnostic({ status: 'Advertisement call completed', adResult });
  } catch (error) {
    renderMonetagDiagnostic({ status: 'Advertisement call failed', error: String(error?.message || error) });
  }
}

async function startDailyCheckinAd(ymid) {
  if (!ymid) throw new Error('Daily Check-in advertisement id is missing');
  await ensureMonetagSdk();
  $('dailyText').textContent = 'Watch the advertisement to complete your check-in.';
  await window.show_11627577({ type: 'end', ymid, requestVar: 'daily_checkin' });
}

async function startDailyCheckinAdFlow() {
  if (state.dailyBusy || state.dailyCooldownUntil) return;
  const button = $('dailyBtn');
  state.dailyBusy = true;
  setDailyButton(button, 'Loading…', true);
  try {
    // Never create a server-side claim while the ad SDK is unavailable.
    await ensureMonetagSdk();
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
  if (event.target.closest('#monetagTestBtn')) { showPage('monetag'); renderMonetagDiagnostic({ status: 'loading Monetag SDK…' }); runMonetagDiagnostic(); }
  if (event.target.closest('#runMonetagDiagnostic')) runMonetagDiagnostic();
  if (event.target.closest('#runMonetagAdTest')) testMonetagAd();
  if (event.target.closest('#taskVerifyBtn')) toast('Task verification is awaiting the real task/provider adapter.');
  if (event.target.closest('#withdrawBtn')) toast('Withdrawal flow will open after the wallet backend is implemented and verified.');
  if (event.target.closest('#copyReferral')) toast('Referral link generation will be enabled when the Referral phase is implemented.');
});

renderBalances();
loadHealth();
loadMe();
// Start SDK loading from application code so Telegram WebView does not depend on a parser-time third-party script.
loadMonetagSdkOnce().catch(() => {});
