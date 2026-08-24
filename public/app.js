const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const state = { page: 'home', balance: { coin: 0, dzx: 0, dzp: 0 }, user: null, tasks: [], dailyBusy: false, dailyVerificationPending: false, dailyCooldownUntil: null };
const $ = id => document.getElementById(id);
let monetagHandler = null;
const MONETAG_READY_TIMEOUT_MS = 15000;
const MONETAG_PRELOAD_TIMEOUT_SECONDS = 12;
const DAILY_VERIFICATION_POLL_MS = 1000;
const DAILY_VERIFICATION_POLL_LIMIT = 30000;

function getMonetagHandler() {
  const adapter = window.DzMoneyMonetag;
  if (adapter?.handler && typeof adapter.handler === 'function') {
    monetagHandler = adapter.handler;
    return monetagHandler;
  }
  return null;
}
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function ensureMonetagSdk(timeoutMs = MONETAG_READY_TIMEOUT_MS) {
  const started = performance.now();
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
  if (page === 'tasks') loadTasks();
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
function renderTasks() {
  const container = $('tasksList');
  if (!container) return;
  if (!state.tasks.length) {
    container.innerHTML = '<article class="info-card"><strong>No tasks available</strong><p>There are no active tasks available for your account right now.</p></article>';
    return;
  }
  container.innerHTML = state.tasks.map(task => `
    <article class="task-card" data-task-id="${String(task.id)}">
      <div class="task-icon">▶</div>
      <div class="task-info"><strong>${String(task.title || task.name || 'Task')}</strong><span>${String(task.type || 'Activity')}</span><small>${String(task.completion?.mode || 'verified')}</small></div>
      <button class="secondary-btn task-action" data-task-id="${String(task.id)}">${task.completion?.mode === 'open_link' ? 'Open' : 'Verify'}</button>
    </article>`).join('');
}
async function loadTasks() {
  const container = $('tasksList');
  if (container) container.innerHTML = '<article class="info-card"><strong>Loading tasks…</strong></article>';
  try {
    const data = await api('/api/tasks');
    state.tasks = Array.isArray(data.tasks) ? data.tasks : [];
    renderTasks();
  } catch (error) {
    state.tasks = [];
    if (container) container.innerHTML = `<article class="info-card"><strong>Unable to load tasks</strong><p>${String(error.message || 'Please try again later.')}</p></article>`;
  }
}
async function startTaskExecutionFlow(taskId) {
  const task = state.tasks.find(item => String(item.id) === String(taskId));
  if (!task) throw new Error('Task is no longer available');
  const idempotencyKey = `task:${task.id}:${crypto.randomUUID()}`;
  const result = await api('/api/tasks/execute', {
    method: 'POST',
    body: JSON.stringify({ taskId: task.id, idempotencyKey, metadata: { source: 'tasks_ui' } })
  });
  if (task.completion?.mode === 'open_link' && task.completion?.url) {
    window.open(task.completion.url, '_blank', 'noopener,noreferrer');
    toast('Task opened. Complete it, then return to DzMoney for verification.');
    return result;
  }
  toast('Task started. Server verification is pending.');
  return result;
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
  state.dailyVerificationPending = false;
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
function setDailyVerificationPending(pending) {
  state.dailyVerificationPending = pending;
  if (!pending || state.dailyCooldownUntil) return;
  const button = $('dailyBtn');
  setDailyButton(button, 'Verifying…', true);
  $('dailyText').textContent = 'Advertisement completed. Waiting for server verification.';
}
async function loadDailyStatus() {
  try {
    const status = await api('/api/daily-checkin/status');
    if (status.status === 'cooldown' && status.nextEligibleAt) { startDailyCooldown(status.nextEligibleAt); return status; }
    if (status.status === 'pending') { setDailyVerificationPending(true); return status; }
    state.dailyVerificationPending = false;
    if (!state.dailyBusy) setDailyButton($('dailyBtn'), 'Check in', false);
    $('dailyText').textContent = 'Watch the required advertisement to claim today’s reward.';
    return status;
  } catch { return null; }
}
async function waitForDailyVerification() {
  const deadline = Date.now() + DAILY_VERIFICATION_POLL_LIMIT;
  while (Date.now() < deadline) {
    const status = await loadDailyStatus();
    if (status?.status === 'cooldown') { await loadMe(); return true; }
    if (status?.status === 'available') return false;
    await wait(DAILY_VERIFICATION_POLL_MS);
  }
  setDailyVerificationPending(true);
  return false;
}
async function startDailyCheckinAd(ymid) {
  if (!ymid) throw new Error('Daily Check-in advertisement id is missing');
  const handler = await ensureMonetagSdk();
  $('dailyText').textContent = 'Preparing the advertisement…';
  await handler({ type: 'preload', ymid, requestVar: 'daily_checkin', timeout: MONETAG_PRELOAD_TIMEOUT_SECONDS });
  $('dailyText').textContent = 'Watch the advertisement to complete your check-in.';
  await handler({ ymid, requestVar: 'daily_checkin' });
}
async function startDailyCheckinAdFlow() {
  if (state.dailyBusy || state.dailyVerificationPending || state.dailyCooldownUntil) return;
  const button = $('dailyBtn');
  state.dailyBusy = true;
  setDailyButton(button, 'Loading…', true);
  try {
    const handler = await ensureMonetagSdk();
    if (typeof handler !== 'function') throw new Error('Monetag SDK is unavailable');
    const claim = await api('/api/daily-checkin/claim', { method: 'POST', body: JSON.stringify({ idempotencyKey: `daily:${crypto.randomUUID()}` }) });
    await startDailyCheckinAd(claim.adEvent?.external_ad_id);
    setDailyVerificationPending(true);
    toast('Advertisement completed. Your reward is being verified.');
    await waitForDailyVerification();
  } catch (error) {
    if (error.status === 429 && error.data?.nextEligibleAt) { startDailyCooldown(error.data.nextEligibleAt); toast('Daily Check-in is on cooldown.'); }
    else { toast(error.message || 'Unable to show the advertisement.'); $('dailyText').textContent = error.message || 'Unable to show the advertisement.'; }
  } finally {
    state.dailyBusy = false;
    if (!state.dailyVerificationPending && !state.dailyCooldownUntil) setDailyButton(button, 'Check in', false);
  }
}
document.addEventListener('click', event => {
  const nav = event.target.closest('[data-go]');
  if (nav) { showPage(nav.dataset.go); return; }
  if (event.target.closest('#dailyBtn')) startDailyCheckinAdFlow();
  const taskButton = event.target.closest('.task-action');
  if (taskButton) {
    taskButton.disabled = true;
    startTaskExecutionFlow(taskButton.dataset.taskId).catch(error => {
      taskButton.disabled = false;
      toast(error.message || 'Unable to start task.');
    });
  }
  if (event.target.closest('#withdrawBtn')) toast('Withdrawal flow will open after the wallet backend is implemented and verified.');
  if (event.target.closest('#copyReferral')) toast('Referral link generation will be enabled when the Referral phase is implemented.');
});
window.addEventListener('focus', () => { loadDailyStatus(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadDailyStatus(); });
renderBalances();
loadHealth();
loadMe();
loadDailyStatus();