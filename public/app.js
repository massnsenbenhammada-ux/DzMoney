const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const state = { page: 'home', balance: { coin: 0, dzx: 0, dzp: 0 }, user: null, tasks: [], taskCategory: null, dailyTaskBusy: false, dailyTaskPending: false, dailyTaskCooldownUntil: null };
const $ = id => document.getElementById(id);
const TASK_CATEGORY_ORDER = [
  { key: 'daily', label: 'Daily Activity', description: 'Daily system and activity tasks', icon: '◷' },
  { key: 'game', label: 'Game Task', description: 'Game and Mini App activities', icon: '◆' },
  { key: 'social', label: 'Social Task', description: 'Social and community activities', icon: '↗' },
  { key: 'web', label: 'Web Task', description: 'Web campaigns and visits', icon: '◎' },
  { key: 'special', label: 'Special / Partner Task', description: 'Partner campaigns and integrations', icon: '★' }
];
const DAILY_SUBTYPE_ORDER = ['daily_check_in', 'check_for_update', 'share_with_friends', 'ad_view', 'invite_1_friend', 'invite_10_friends', 'invite_20_friends', 'invite_50_friends', 'invite_100_friends'];
let monetagHandler = null;
const MONETAG_READY_TIMEOUT_MS = 15000;
const MONETAG_PRELOAD_TIMEOUT_SECONDS = 12;
const TASK_VERIFICATION_POLL_MS = 1000;
const TASK_VERIFICATION_POLL_LIMIT = 30000;
const DAILY_SYSTEM_VERIFY_POLL_LIMIT = 30000;
const DAILY_TASK_RETRY_AFTER_MS = DAILY_SYSTEM_VERIFY_POLL_LIMIT;

function getMonetagHandler() {
  const adapter = window.DzMoneyMonetag;
  if (adapter?.handler && typeof adapter.handler === 'function') { monetagHandler = adapter.handler; return monetagHandler; }
  return null;
}
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function ensureMonetagSdk(timeoutMs = MONETAG_READY_TIMEOUT_MS) {
  const adapter = window.DzMoneyMonetag;
  if (!adapter?.ready) throw new Error('Advertisement SDK adapter is unavailable');
  await Promise.race([adapter.ready, wait(timeoutMs).then(() => { throw new Error('Advertisement SDK readiness timed out'); })]);
  const handler = getMonetagHandler();
  if (!handler) throw new Error('Advertisement SDK handler is unavailable after readiness');
  return handler;
}
function toast(message) {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}
function showPage(page) {
  state.page = page;
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.go === page));
  if (page === 'tasks') { state.taskCategory = null; loadTasks(); }
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
function taskReward(task) {
  return `${format(task.rewardCoin)} COIN • ${format(task.rewardDzx)} DZX • ${format(task.rewardDzp)} DZP`;
}
function taskCard(task) {
  const special = task.systemKey === 'daily_check_in';
  const label = special ? 'Check in' : 'Verify';
  const action = special ? `data-system-key="${String(task.systemKey)}"` : `data-task-id="${String(task.id)}"`;
  const method = task.verification?.method ? String(task.verification.method).replace(/_/g, ' ') : 'verified';
  return `<article class="task-card" data-task-id="${String(task.id)}"><div class="task-icon">▶</div><div class="task-info"><strong>${String(task.title || task.name || 'Task')}</strong><span>${String(task.taskType || task.type || 'Activity')}</span><small>${method}</small><b class="task-reward">${taskReward(task)}</b></div><button class="secondary-btn ${special ? 'daily-system-action' : 'task-action'}" ${action}>${label}</button></article>`;
}
function renderTaskCategories() {
  const container = $('tasksList');
  if (!container) return;
  container.innerHTML = `<div class="task-category-list">${TASK_CATEGORY_ORDER.map(category => {
    const count = state.tasks.filter(task => task.taskType === category.key).length;
    return `<button class="task-category-card" data-task-category="${category.key}"><span class="task-category-icon">${category.icon}</span><span class="task-category-copy"><strong>${category.label}</strong><small>${category.description}</small><em>${count} active task${count === 1 ? '' : 's'}</em></span><span class="task-category-arrow">›</span></button>`;
  }).join('')}</div>`;
}
function sortDailyTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const aIndex = DAILY_SUBTYPE_ORDER.indexOf(a.systemKey);
    const bIndex = DAILY_SUBTYPE_ORDER.indexOf(b.systemKey);
    return (aIndex < 0 ? DAILY_SUBTYPE_ORDER.length : aIndex) - (bIndex < 0 ? DAILY_SUBTYPE_ORDER.length : bIndex) || Number(a.id) - Number(b.id);
  });
}
function renderTaskCategory(categoryKey) {
  const container = $('tasksList');
  const category = TASK_CATEGORY_ORDER.find(item => item.key === categoryKey);
  if (!container || !category) return renderTaskCategories();
  state.taskCategory = categoryKey;
  const tasks = state.tasks.filter(task => task.taskType === categoryKey);
  const ordered = categoryKey === 'daily' ? sortDailyTasks(tasks) : tasks;
  container.innerHTML = `<button class="task-back" data-task-back="true">‹ <span>All task types</span></button><div class="task-category-heading"><span class="task-category-icon">${category.icon}</span><div><span>Tasks</span><h2>${category.label}</h2></div></div><div class="task-list">${ordered.length ? ordered.map(taskCard).join('') : '<article class="info-card"><strong>No active tasks</strong><p>There are no active tasks available in this category right now.</p></article>'}</div>`;
  if (categoryKey === 'daily') loadDailyTaskStatus();
}
function renderTasks() {
  if (state.taskCategory) renderTaskCategory(state.taskCategory);
  else renderTaskCategories();
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
async function waitForTaskVerification(attemptId) {
  const deadline = Date.now() + TASK_VERIFICATION_POLL_LIMIT;
  while (Date.now() < deadline) {
    const status = await api(`/api/tasks/attempt/${encodeURIComponent(attemptId)}`);
    if (status.status === 'verified') { await loadMe(); return status; }
    if (status.status === 'rejected') return status;
    await wait(TASK_VERIFICATION_POLL_MS);
  }
  return api(`/api/tasks/attempt/${encodeURIComponent(attemptId)}`);
}
async function showTaskVerificationAd(ymid) {
  if (!ymid) throw new Error('Verification advertisement id is missing');
  const handler = await ensureMonetagSdk();
  await handler({ type: 'preload', ymid, requestVar: 'verification', timeout: MONETAG_PRELOAD_TIMEOUT_SECONDS });
  await handler({ ymid, requestVar: 'verification' });
}
async function finalizeDailySystemTask(attemptId) {
  const deadline = Date.now() + DAILY_SYSTEM_VERIFY_POLL_LIMIT;
  while (Date.now() < deadline) {
    try {
      const result = await api('/api/daily-tasks/verify', { method: 'POST', body: JSON.stringify({ attemptId, idempotencyKey: `daily-system:${attemptId}` }) });
      return result;
    } catch (error) {
      if (!String(error.message || '').includes('must be verified first')) throw error;
    }
    await wait(TASK_VERIFICATION_POLL_MS);
  }
  throw new Error('Server verification is still pending');
}
async function startDailySystemTaskFlow(systemKey, button) {
  if (state.dailyTaskBusy || state.dailyTaskPending || state.dailyTaskCooldownUntil) return;
  state.dailyTaskBusy = true;
  button.disabled = true;
  button.textContent = 'Loading…';
  try {
    const result = await api('/api/daily-tasks/execute', { method: 'POST', body: JSON.stringify({ systemKey, idempotencyKey: `daily:${systemKey}:${crypto.randomUUID()}`, metadata: { source: 'tasks_ui' } }) });
    toast('Preparing the verification advertisement…');
    await showTaskVerificationAd(result.verificationAdId);
    state.dailyTaskPending = true;
    button.textContent = 'Verifying…';
    const finalized = await finalizeDailySystemTask(result.attemptId);
    if (finalized.status === 'verified') {
      await loadMe();
      toast('Daily Check-in verified and reward credited.');
      await loadDailyTaskStatus();
    } else if (finalized.status === 'rejected') toast('Daily Check-in verification was rejected.');
  } catch (error) {
    toast(error.message || 'Unable to complete Daily Check-in.');
  } finally {
    state.dailyTaskBusy = false;
    state.dailyTaskPending = false;
    await loadDailyTaskStatus();
  }
}
function setDailyTaskButton(text, disabled) {
  const button = document.querySelector('.daily-system-action[data-system-key="daily_check_in"]');
  if (!button) return;
  button.disabled = disabled;
  button.textContent = text;
}
async function loadDailyTaskStatus() {
  clearTimeout(loadDailyTaskStatus.retryTimer);
  try {
    const status = await api('/api/daily-checkin/status');
    if (status.status === 'cooldown' && status.nextEligibleAt) {
      const until = new Date(status.nextEligibleAt).getTime();
      state.dailyTaskCooldownUntil = Number.isFinite(until) ? until : null;
      setDailyTaskButton(`Cooldown ${formatCooldown(until - Date.now())}`, true);
      clearInterval(loadDailyTaskStatus.timer);
      loadDailyTaskStatus.timer = setInterval(() => {
        const remaining = state.dailyTaskCooldownUntil - Date.now();
        if (remaining <= 0) { clearInterval(loadDailyTaskStatus.timer); state.dailyTaskCooldownUntil = null; setDailyTaskButton('Check in', false); return; }
        setDailyTaskButton(`Cooldown ${formatCooldown(remaining)}`, true);
      }, 1000);
      return status;
    }
    clearInterval(loadDailyTaskStatus.timer);
    state.dailyTaskCooldownUntil = null;
    if (status.status === 'pending') {
      if (status.retryable) {
        state.dailyTaskPending = false;
        setDailyTaskButton('Retry', false);
        return status;
      }
      state.dailyTaskPending = true;
      setDailyTaskButton('Verifying…', true);
      const pendingSince = new Date(status.pendingSince || 0).getTime();
      const remaining = Number.isFinite(pendingSince) ? Math.max(0, DAILY_TASK_RETRY_AFTER_MS - (Date.now() - pendingSince)) : DAILY_TASK_RETRY_AFTER_MS;
      loadDailyTaskStatus.retryTimer = setTimeout(loadDailyTaskStatus, remaining + 50);
      return status;
    }
    state.dailyTaskPending = false;
    if (!state.dailyTaskBusy) setDailyTaskButton('Check in', false);
    return status;
  } catch { return null; }
}
function formatCooldown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
async function startTaskExecutionFlow(taskId) {
  const task = state.tasks.find(item => String(item.id) === String(taskId));
  if (!task) throw new Error('Task is no longer available');
  const numericTaskId = Number(task.id);
  if (!Number.isSafeInteger(numericTaskId) || numericTaskId <= 0) throw new Error('Task id is invalid');
  const completionWindow = task.completion?.mode === 'open_link' && task.completion?.url ? window.open('about:blank', '_blank', 'noopener,noreferrer') : null;
  const idempotencyKey = `task:${task.id}:${crypto.randomUUID()}`;
  const result = await api('/api/tasks/execute', { method: 'POST', body: JSON.stringify({ taskId: numericTaskId, idempotencyKey, metadata: { source: 'tasks_ui' } }) });
  toast('Preparing the verification advertisement…');
  await showTaskVerificationAd(result.verificationAdId);
  if (task.completion?.mode === 'open_link' && task.completion?.url) {
    if (completionWindow) completionWindow.location.href = task.completion.url;
    else { window.location.href = task.completion.url; return result; }
    const click = await api('/api/tasks/click', { method: 'POST', body: JSON.stringify({ attemptId: result.attemptId }) });
    if (click.status === 'verified') { await loadMe(); toast('Task verified and reward credited.'); return { ...result, ...click }; }
    const status = await waitForTaskVerification(result.attemptId);
    if (status.status === 'verified') toast('Task verified and reward credited.');
    else if (status.status === 'rejected') toast('Task verification was rejected.');
    return { ...result, ...click, verification: status };
  }
  const status = await waitForTaskVerification(result.attemptId);
  if (status.status === 'verified') toast('Task verified and reward credited.');
  else if (status.status === 'rejected') toast('Task verification was rejected.');
  else toast('Task verification is still pending.');
  return { ...result, verification: status };
}
document.addEventListener('click', event => {
  const nav = event.target.closest('[data-go]');
  if (nav) { showPage(nav.dataset.go); return; }
  const category = event.target.closest('[data-task-category]');
  if (category) { renderTaskCategory(category.dataset.taskCategory); return; }
  const back = event.target.closest('[data-task-back]');
  if (back) { state.taskCategory = null; renderTaskCategories(); return; }
  const dailyButton = event.target.closest('.daily-system-action');
  if (dailyButton) { startDailySystemTaskFlow(dailyButton.dataset.systemKey, dailyButton); return; }
  const taskButton = event.target.closest('.task-action');
  if (taskButton) {
    taskButton.disabled = true;
    startTaskExecutionFlow(taskButton.dataset.taskId).catch(error => { taskButton.disabled = false; toast(error.message || 'Unable to start task.'); });
  }
  if (event.target.closest('#withdrawBtn')) toast('Withdrawal flow will open after the wallet backend is implemented and verified.');
  if (event.target.closest('#copyReferral')) toast('Referral link generation will be enabled when the Referral phase is implemented.');
});
window.addEventListener('focus', () => { if (state.page === 'tasks') loadDailyTaskStatus(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.page === 'tasks') loadDailyTaskStatus(); });
renderBalances();
loadHealth();
loadMe();
