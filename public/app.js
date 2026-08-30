const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const state = { page: 'home', balance: { coin: 0, dzx: 0, dzp: 0 }, user: null, tasks: [], taskCategory: null, taskActions: {}, dailyTaskBusy: false, dailyTaskPending: false, dailyTaskCooldownUntil: null, dailyAdProgress: null };
const $ = id => document.getElementById(id);
const TASK_CATEGORY_ORDER = [
  { key: 'daily', label: 'Daily Activity', description: 'Daily system and activity tasks', icon: '◷' },
  { key: 'game', label: 'Game Task', description: 'Game and Mini App activities', icon: '◆' },
  { key: 'social', label: 'Social Task', description: 'Social and community activities', icon: '↗' },
  { key: 'web', label: 'Web Task', description: 'Web campaigns and visits', icon: '◎' },
  { key: 'special', label: 'Special / Partner Task', description: 'Partner campaigns and integrations', icon: '★' }
];
const DAILY_SUBTYPE_ORDER = ['daily_check_in', 'check_for_update', 'share_with_friends', 'view_ads', 'invite_1_friend', 'invite_10_friends', 'invite_20_friends', 'invite_50_friends', 'invite_100_friends'];
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
function taskReward(task) { return `${format(task.rewardCoin)} COIN • ${format(task.rewardDzx)} DZX • ${format(task.rewardDzp)} DZP`; }
function isInviteTask(task) { return /^invite_(1|10|20|50|100)_friend/.test(String(task.systemKey || '')) || /^invite_(10|20|50|100)_friends$/.test(String(task.systemKey || '')); }
function taskActionLabel(task) {
  const key = String(task.systemKey || '');
  const saved = state.taskActions[task.id];
  if (key === 'daily_check_in') return 'Check in';
  if (key === 'check_for_update') return saved?.attemptId ? 'Verify' : 'Check for Update';
  if (key === 'share_with_friends') return saved?.attemptId ? 'Verify' : 'Share';
  if (key === 'view_ads') return 'Watch';
  if (isInviteTask(task)) return task.claimable === true ? 'Claim' : 'Invite';
  return saved?.attemptId ? 'Verify' : 'Open Task';
}
function taskCard(task) {
  const key = String(task.systemKey || '');
  const method = task.verification?.method ? String(task.verification.method).replace(/_/g, ' ') : 'verified';
  const progress = key === 'view_ads' ? `<small class="task-progress">${state.dailyAdProgress?.completed || 0}/${state.dailyAdProgress?.target || 20}</small>` : '';
  const reward = key === 'view_ads' ? '<b class="task-reward">+1,000 COIN • +1 DZX at 20/20</b>' : `<b class="task-reward">${taskReward(task)}</b>`;
  const isDaily = key === 'daily_check_in' || key === 'check_for_update' || key === 'share_with_friends' || key === 'view_ads' || isInviteTask(task);
  if (!isDaily) {
    const saved = state.taskActions[task.id];
    const verifyDisabled = saved?.attemptId ? '' : 'disabled';
    return `<article class="task-card" data-task-id="${String(task.id)}"><div class="task-icon">▶</div><div class="task-info"><strong>${String(task.title || task.name || 'Task')}</strong><span>${String(task.taskType || task.type || 'Activity')}</span><small>${method}</small>${reward}</div><div class="task-actions"><button class="secondary-btn task-open-action" data-task-open="${String(task.id)}">Open Task</button><button class="secondary-btn task-verify-action" data-task-verify="${String(task.id)}" ${verifyDisabled}>Verify</button></div></article>`;
  }
  const label = taskActionLabel(task);
  const action = `data-system-key="${key}"`;
  const actionClass = 'daily-system-action';
  return `<article class="task-card" data-task-id="${String(task.id)}"><div class="task-icon">▶</div><div class="task-info"><strong>${String(task.title || task.name || 'Task')}</strong><span>${String(task.taskType || task.type || 'Activity')}</span><small>${method}</small>${progress}${reward}</div><button class="secondary-btn ${actionClass}" data-task-action="${key}" ${action}>${label}</button></article>`;
}
function renderTaskCategories() {
  const container = $('tasksList');
  if (!container) return;
  container.innerHTML = `<div class="task-category-list">${TASK_CATEGORY_ORDER.map(category => { const count = state.tasks.filter(task => task.taskType === category.key).length; return `<button class="task-category-card" data-task-category="${category.key}"><span class="task-category-icon">${category.icon}</span><span class="task-category-copy"><strong>${category.label}</strong><small>${category.description}</small><em>${count} active task${count === 1 ? '' : 's'}</em></span><span class="task-category-arrow">›</span></button>`; }).join('')}</div>`;
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
  if (categoryKey === 'daily') { loadDailyTaskStatus(); loadDailyAdProgress(); }
}
function renderTasks() { if (state.taskCategory) renderTaskCategory(state.taskCategory); else renderTaskCategories(); }
async function loadTasks() {
  const container = $('tasksList');
  if (container) container.innerHTML = '<article class="info-card"><strong>Loading tasks…</strong></article>';
  try { const data = await api('/api/tasks'); state.tasks = Array.isArray(data.tasks) ? data.tasks : []; renderTasks(); }
  catch (error) { state.tasks = []; if (container) container.innerHTML = `<article class="info-card"><strong>Unable to load tasks</strong><p>${String(error.message || 'Please try again later.')}</p></article>`; }
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
    try { return await api('/api/daily-tasks/verify', { method: 'POST', body: JSON.stringify({ attemptId, idempotencyKey: `daily-system:${attemptId}` }) }); }
    catch (error) { if (!String(error.message || '').includes('must be verified first')) throw error; }
    await wait(TASK_VERIFICATION_POLL_MS);
  }
  throw new Error('Server verification is still pending');
}
async function startDailySystemTaskFlow(systemKey, button) {
  if (state.dailyTaskBusy || state.dailyTaskPending || state.dailyTaskCooldownUntil) return;
  if (systemKey === 'view_ads') return startDailyAdvertisementFlow(button);
  if (isInviteTask(state.tasks.find(task => task.systemKey === systemKey) || {})) return startInviteTaskFlow(systemKey, button);
  if (systemKey === 'share_with_friends') return startShareTaskFlow(button);
  const task = state.tasks.find(item => item.systemKey === systemKey);
  const saved = task && state.taskActions[task.id];
  if (saved?.attemptId) {
    button.disabled = true; button.textContent = 'Verifying…'; state.dailyTaskBusy = true;
    try { await showTaskVerificationAd(saved.verificationAdId); const finalized = await finalizeDailySystemTask(saved.attemptId); if (finalized.status === 'verified') { delete state.taskActions[task.id]; await loadMe(); toast('Daily task verified and reward credited.'); } else if (finalized.status === 'rejected') toast('Task verification was rejected.'); }
    catch (error) { toast(error.message || 'Unable to verify task.'); }
    finally { state.dailyTaskBusy = false; button.disabled = false; await loadDailyTaskStatus(); renderTaskCategory('daily'); }
    return;
  }
  state.dailyTaskBusy = true; button.disabled = true; button.textContent = 'Loading…';
  try {
    const result = await api('/api/daily-tasks/execute', { method: 'POST', body: JSON.stringify({ systemKey, idempotencyKey: `daily:${systemKey}:${crypto.randomUUID()}`, metadata: { source: 'tasks_ui' } }) });
    if (task) state.taskActions[task.id] = { attemptId: result.attemptId, verificationAdId: result.verificationAdId };
    toast('Preparing the verification advertisement…');
    await showTaskVerificationAd(result.verificationAdId);
    state.dailyTaskPending = true; button.textContent = 'Verifying…';
    const finalized = await finalizeDailySystemTask(result.attemptId);
    if (finalized.status === 'verified') { if (task) delete state.taskActions[task.id]; await loadMe(); toast(`${systemKey === 'check_for_update' ? 'Check for Update' : 'Daily task'} verified and reward credited.`); }
    else if (finalized.status === 'rejected') toast('Task verification was rejected.');
  } catch (error) { toast(error.message || 'Unable to complete task.'); }
  finally { state.dailyTaskBusy = false; state.dailyTaskPending = false; await loadDailyTaskStatus(); renderTaskCategory('daily'); }
}
async function startShareTaskFlow(button) {
  if (button.disabled) return;
  const task = state.tasks.find(item => item.systemKey === 'share_with_friends');
  const saved = task && state.taskActions[task.id];
  if (saved?.attemptId) return verifyTaskAttempt(task, button, saved);
  button.disabled = true; button.textContent = 'Preparing…';
  try {
    const referral = await api('/api/me');
    const result = await api('/api/daily-tasks/execute', { method: 'POST', body: JSON.stringify({ systemKey: 'share_with_friends', idempotencyKey: `share-with-friends:${crypto.randomUUID()}` }) });
    state.taskActions[task.id] = { attemptId: result.attemptId, verificationAdId: result.verificationAdId };
    const url = referral.user?.referralLink;
    if (!url) throw new Error('Referral link is unavailable.');
    if (typeof tg?.openTelegramLink === 'function') tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}`); else window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer');
    button.textContent = 'Verify';
    toast('Share action opened. Tap Verify to complete the verification gate.');
  } catch (error) { toast(error.message || 'Unable to start Share with Friends.'); button.textContent = 'Share'; }
  finally { button.disabled = false; }
}
async function startInviteTaskFlow(systemKey, button) {
  const task = state.tasks.find(item => item.systemKey === systemKey);
  if (!task) return;
  button.disabled = true; button.textContent = 'Checking…';
  try {
    const current = await api(`/api/daily-tasks?systemKey=${encodeURIComponent(systemKey)}`);
    const serverTask = current.task || {};
    task.claimable = serverTask.progress?.claimable === true;
    task.progress = serverTask.progress || null;
    if (task.claimable) {
      const result = await api('/api/daily-tasks/execute', { method: 'POST', body: JSON.stringify({ systemKey, idempotencyKey: `daily:${systemKey}:${crypto.randomUUID()}` }) });
      await showTaskVerificationAd(result.verificationAdId);
      const finalized = await finalizeDailySystemTask(result.attemptId);
      if (finalized.status === 'verified') { await loadMe(); toast('Achievement claimed and reward credited.'); await loadTasks(); }
      return;
    }
    const referral = await api('/api/me');
    const url = referral.user?.referralLink;
    if (!url) throw new Error('Referral link is unavailable.');
    if (typeof tg?.openTelegramLink === 'function') tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}`, '_blank'); else window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer');
    toast(`Invite progress: ${serverTask.progress?.completed || 0}/${serverTask.progress?.target || 'target'}.`);
  } catch (error) { toast(error.message || 'Unable to process invitation task.'); }
  finally { button.disabled = false; button.textContent = task.claimable ? 'Claim' : 'Invite'; }
}
async function verifyTaskAttempt(task, button, saved) {
  button.disabled = true; button.textContent = 'Verifying…';
  try {
    await showTaskVerificationAd(saved.verificationAdId);
    if (task.verification?.method === 'click_proof') await api('/api/tasks/click', { method: 'POST', body: JSON.stringify({ attemptId: saved.attemptId }) });
    const status = await waitForTaskVerification(saved.attemptId);
    if (status.status === 'verified') { await loadMe(); toast('Task verified and reward credited.'); delete state.taskActions[task.id]; renderTaskCategory(state.taskCategory); }
    else if (status.status === 'rejected') toast('Task verification was rejected.');
  } catch (error) { toast(error.message || 'Unable to verify task.'); }
  finally { button.disabled = false; if (button.isConnected) button.textContent = 'Verify'; }
}
async function startTaskAction(taskId) {
  const task = state.tasks.find(item => String(item.id) === String(taskId));
  if (!task) throw new Error('Task is no longer available');
  const numericTaskId = Number(task.id);
  if (!Number.isSafeInteger(numericTaskId) || numericTaskId <= 0) throw new Error('Task id is invalid');
  const saved = state.taskActions[task.id];
  if (saved?.attemptId) {
    if (task.campaignUrl) window.open(task.campaignUrl, '_blank', 'noopener,noreferrer');
    toast('Task opened. Tap Verify after completing the task.');
    return saved;
  }
  const result = await api('/api/tasks/execute', { method: 'POST', body: JSON.stringify({ taskId: numericTaskId, idempotencyKey: `task:${task.id}:${crypto.randomUUID()}`, metadata: { source: 'tasks_ui' } }) });
  state.taskActions[task.id] = { attemptId: result.attemptId, verificationAdId: result.verificationAdId };
  if (task.campaignUrl) window.open(task.campaignUrl, '_blank', 'noopener,noreferrer');
  toast('Task opened. Tap Verify to complete the verification gate.');
  renderTaskCategory(state.taskCategory);
  return result;
}
async function startDailyAdvertisementFlow(button) {
  const task = state.tasks.find(item => item.systemKey === 'view_ads');
  if (!task || state.dailyTaskBusy) return;
  state.dailyTaskBusy = true; button.disabled = true; button.textContent = 'Loading…';
  try {
    const result = await api('/api/daily-tasks/execute', { method: 'POST', body: JSON.stringify({ systemKey: 'view_ads', idempotencyKey: `daily:view_ads:${crypto.randomUUID()}` }) });
    toast('Preparing the advertisement…');
    const handler = await ensureMonetagSdk();
    await handler({ type: 'preload', ymid: result.externalAdId, requestVar: 'task', timeout: MONETAG_PRELOAD_TIMEOUT_SECONDS });
    await handler({ ymid: result.externalAdId, requestVar: 'task' });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      try { const finalized = await api('/api/daily-tasks/advertisement/finalize', { method: 'POST', body: JSON.stringify({ adEventId: result.adEventId }) }); if (finalized.progress) { state.dailyAdProgress = finalized.progress; } if (finalized.rewarded || finalized.progress?.completed >= finalized.progress?.target) { await loadMe(); toast('Ad View target reached. Reward credited.'); break; } } catch (error) { if (!String(error.message || '').includes('must be verified first')) throw error; }
      await wait(1000);
    }
    await loadDailyAdProgress();
  } catch (error) { toast(error.message || 'Unable to show advertisement.'); }
  finally { state.dailyTaskBusy = false; button.disabled = false; await loadDailyAdProgress(); renderTaskCategory('daily'); }
}
async function loadDailyAdProgress() {
  try { const data = await api('/api/daily-tasks?systemKey=view_ads'); state.dailyAdProgress = data.progress || data.task?.progress || null; if (state.taskCategory === 'daily') renderTaskCategory('daily'); return data; } catch { return null; }
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
      const until = new Date(status.nextEligibleAt).getTime(); state.dailyTaskCooldownUntil = Number.isFinite(until) ? until : null; setDailyTaskButton(`Cooldown ${formatCooldown(until - Date.now())}`, true); clearInterval(loadDailyTaskStatus.timer); loadDailyTaskStatus.timer = setInterval(() => { const remaining = state.dailyTaskCooldownUntil - Date.now(); if (remaining <= 0) { clearInterval(loadDailyTaskStatus.timer); state.dailyTaskCooldownUntil = null; setDailyTaskButton('Check in', false); return; } setDailyTaskButton(`Cooldown ${formatCooldown(remaining)}`, true); }, 1000); return status;
    }
    clearInterval(loadDailyTaskStatus.timer); state.dailyTaskCooldownUntil = null;
    if (status.status === 'pending') { if (status.retryable) { state.dailyTaskPending = false; setDailyTaskButton('Retry', false); return status; } state.dailyTaskPending = true; setDailyTaskButton('Verifying…', true); const pendingSince = new Date(status.pendingSince || 0).getTime(); const remaining = Number.isFinite(pendingSince) ? Math.max(0, DAILY_TASK_RETRY_AFTER_MS - (Date.now() - pendingSince)) : DAILY_TASK_RETRY_AFTER_MS; loadDailyTaskStatus.retryTimer = setTimeout(loadDailyTaskStatus, remaining + 50); return status; }
    state.dailyTaskPending = false; if (!state.dailyTaskBusy) setDailyTaskButton('Check in', false); return status;
  } catch { return null; }
}
function formatCooldown(ms) { const totalSeconds = Math.max(0, Math.ceil(ms / 1000)); const hours = Math.floor(totalSeconds / 3600); const minutes = Math.floor((totalSeconds % 3600) / 60); const seconds = totalSeconds % 60; return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`; }
document.addEventListener('click', event => {
  const nav = event.target.closest('[data-go]'); if (nav) { showPage(nav.dataset.go); return; }
  const category = event.target.closest('[data-task-category]'); if (category) { renderTaskCategory(category.dataset.taskCategory); return; }
  const back = event.target.closest('[data-task-back]'); if (back) { state.taskCategory = null; renderTaskCategories(); return; }
  const dailyButton = event.target.closest('.daily-system-action');
  if (dailyButton) { startDailySystemTaskFlow(dailyButton.dataset.systemKey, dailyButton); return; }
  const verifyButton = event.target.closest('.task-verify-action');
  if (verifyButton) {
    const task = state.tasks.find(item => String(item.id) === String(verifyButton.dataset.taskVerify));
    const saved = task && state.taskActions[task.id];
    if (!task || !saved?.attemptId) return;
    verifyTaskAttempt(task, verifyButton, saved).catch(error => { verifyButton.disabled = false; toast(error.message || 'Unable to verify task.'); });
    return;
  }
  const openButton = event.target.closest('.task-open-action');
  if (openButton) {
    openButton.disabled = true;
    startTaskAction(openButton.dataset.taskOpen).catch(error => { openButton.disabled = false; toast(error.message || 'Unable to open task.'); });
    return;
  }
  const taskButton = event.target.closest('.task-action');
  if (taskButton) { taskButton.disabled = true; startTaskAction(taskButton.dataset.taskId).catch(error => { taskButton.disabled = false; toast(error.message || 'Unable to start task.'); }); }
  if (event.target.closest('#withdrawBtn')) toast('Withdrawal flow will open after the wallet backend is implemented and verified.');
  if (event.target.closest('#copyReferral')) toast('Referral link generation will be enabled when the Referral phase is implemented.');
});
window.addEventListener('focus', () => { if (state.page === 'tasks') { loadDailyTaskStatus(); loadDailyAdProgress(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.page === 'tasks') { loadDailyTaskStatus(); loadDailyAdProgress(); } });
renderBalances();
loadHealth();
loadMe();
