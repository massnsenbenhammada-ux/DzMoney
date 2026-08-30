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
const DAILY_AD_FINALIZE_POLL_MS = 3000;
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
function showRewardPopup(reward, success = true) {
  const el = $('rewardPopup');
  if (!el) return;
  const amounts = reward || {};
  if (!success) {
    el.innerHTML = '<strong>Reward not credited ❌</strong><span>The task was not verified, so no reward was added.</span>';
  } else {
    el.innerHTML = `<strong>Reward credited ✅</strong><span>${format(amounts.coin)} COIN + ${format(amounts.dzx)} DZX + ${format(amounts.dzp)} DZP</span>`;
  }
  el.hidden = false;
  el.classList.add('show');
  clearTimeout(showRewardPopup.timer);
  showRewardPopup.timer = setTimeout(() => { el.classList.remove('show'); el.hidden = true; }, 3600);
}
function rewardFromTask(task) { return { coin: Number(task?.rewardCoin || 0), dzx: Number(task?.rewardDzx || 0), dzp: Number(task?.rewardDzp || 0) }; }
function showRewardOutcome(result, fallbackTask = null) {
  if (result?.reward) return showRewardPopup(result.reward, result.rewarded !== false);
  if (result?.rewarded === false || result?.status === 'rejected') return showRewardPopup(null, false);
  if (fallbackTask) return showRewardPopup(rewardFromTask(fallbackTask), true);
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
  const reward = key === 'view_ads' ? '<b class="task-reward">+1,000 COIN • +1 DZX • +1 DZP / verified ad</b>' : `<b class="task-reward">${taskReward(task)}</b>`;
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
function setTaskModeTabsVisible(visible) {
  const tabs = document.querySelector('.task-mode-tabs');
  if (tabs) tabs.hidden = !visible;
}
function renderTaskCategories() {
  const container = $('tasksList');
  if (!container) return;
  setTaskModeTabsVisible(true);
  const creatorPanel = $('creatorTaskPanel');
  if (creatorPanel && state.page === 'tasks') creatorPanel.hidden = true;
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
  setTaskModeTabsVisible(false);
  const creatorPanel = $('creatorTaskPanel');
  if (creatorPanel) creatorPanel.hidden = true;
  state.taskCategory = categoryKey;
  const tasks = state.tasks.filter(task => task.taskType === categoryKey);
  const ordered = categoryKey === 'daily' ? sortDailyTasks(tasks) : tasks;
  container.innerHTML = `<button class="task-back" data-task-back="true">‹ <span>All task types</span></button><div class="task-category-heading"><span class="task-category-icon">${category.icon}</span><div><span>Tasks</span><h2>${category.label}</h2></div></div><div class="task-list">${ordered.length ? ordered.map(taskCard).join('') : '<article class="info-card"><strong>No active tasks</strong><p>There are no active tasks available in this category right now.</p></article>'}</div>`;
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
  if (state.dailyTaskBusy || state.dailyTaskPending || (systemKey === 'daily_check_in' && state.dailyTaskCooldownUntil)) return;
  if (systemKey === 'view_ads') return startDailyAdvertisementFlow(button);
  if (isInviteTask(state.tasks.find(task => task.systemKey === systemKey) || {})) return startInviteTaskFlow(systemKey, button);
  if (systemKey === 'share_with_friends') return startShareTaskFlow(button);
  const task = state.tasks.find(item => item.systemKey === systemKey);
  const saved = task && state.taskActions[task.id];
  if (saved?.attemptId) {
    button.disabled = true; button.textContent = 'Verifying…'; state.dailyTaskBusy = true;
    try { await showTaskVerificationAd(saved.verificationAdId); const finalized = await finalizeDailySystemTask(saved.attemptId); if (finalized.status === 'verified') { delete state.taskActions[task.id]; await loadMe(); showRewardOutcome(finalized, task); } else if (finalized.status === 'rejected') showRewardOutcome(finalized); }
    catch (error) { showRewardPopup(null, false); toast(error.message || 'Unable to verify task.'); }
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
    if (finalized.status === 'verified') { delete state.taskActions[task?.id]; await loadMe(); showRewardOutcome(finalized, task); }
    else if (finalized.status === 'rejected') showRewardOutcome(finalized);
  } catch (error) { toast(error.message || 'Unable to complete task.'); showRewardPopup(null, false); }
  finally { state.dailyTaskBusy = false; state.dailyTaskPending = false; button.disabled = false; await loadDailyTaskStatus(); renderTaskCategory('daily'); }
}
async function startDailyAdvertisementFlow(button) {
  if (state.dailyTaskBusy || state.dailyTaskPending) return;
  const task = state.tasks.find(item => item.systemKey === 'view_ads');
  if (!task) return toast('View Ads task is unavailable.');
  state.dailyTaskBusy = true; button.disabled = true; button.textContent = 'Loading…';
  try {
    const result = await api('/api/daily-tasks/execute', { method: 'POST', body: JSON.stringify({ systemKey: 'view_ads', idempotencyKey: `daily:view_ads:${crypto.randomUUID()}`, metadata: { source: 'tasks_ui' } }) });
    await showTaskVerificationAd(result.verificationAdId);
    const deadline = Date.now() + TASK_VERIFICATION_POLL_LIMIT;
    let finalized = null;
    while (Date.now() < deadline) {
      try { finalized = await api('/api/daily-tasks/verify', { method: 'POST', body: JSON.stringify({ attemptId: result.attemptId, idempotencyKey: `daily-system:${result.attemptId}` }) }); break; }
      catch (error) { if (!String(error.message || '').includes('must be verified first')) throw error; }
      await wait(DAILY_AD_FINALIZE_POLL_MS);
    }
    if (!finalized) finalized = await api('/api/daily-tasks/verify', { method: 'POST', body: JSON.stringify({ attemptId: result.attemptId, idempotencyKey: `daily-system:${result.attemptId}` }) });
    if (finalized.status === 'verified') { await loadMe(); showRewardOutcome(finalized, task); }
    else showRewardOutcome(finalized);
  } catch (error) { toast(error.message || 'Unable to complete Watch task.'); showRewardPopup(null, false); }
  finally { state.dailyTaskBusy = false; state.dailyTaskPending = false; button.disabled = false; button.textContent = 'Watch'; await loadDailyAdProgress(); renderTaskCategory('daily'); }
}
async function startInviteTaskFlow(systemKey, button) {
  const task = state.tasks.find(item => item.systemKey === systemKey);
  if (!task || button.disabled) return;
  button.disabled = true; button.textContent = 'Loading…';
  try { const result = await api('/api/tasks/invite/claim', { method: 'POST', body: JSON.stringify({ systemKey, idempotencyKey: `invite:${systemKey}:${crypto.randomUUID()}` }) }); await loadMe(); showRewardOutcome(result, task); }
  catch (error) { toast(error.message || 'Unable to claim invite reward.'); }
  finally { button.disabled = false; await loadTasks(); }
}
async function startShareTaskFlow(button) {
  if (button.disabled) return;
  button.disabled = true; button.textContent = 'Loading…';
  try { const result = await api('/api/tasks/share-with-friends/execute', { method: 'POST', body: JSON.stringify({ idempotencyKey: `share:${crypto.randomUUID()}` }) }); if (result.verificationAdId) { await showTaskVerificationAd(result.verificationAdId); const finalized = await finalizeDailySystemTask(result.attemptId); if (finalized.status === 'verified') { await loadMe(); showRewardOutcome(finalized); } else showRewardOutcome(finalized); } }
  catch (error) { toast(error.message || 'Unable to share task.'); showRewardPopup(null, false); }
  finally { button.disabled = false; await loadTasks(); }
}
async function loadDailyTaskStatus() {
  try { const data = await api('/api/daily-checkin/status'); state.dailyTaskCooldownUntil = data.cooldownUntil ? new Date(data.cooldownUntil).getTime() : null; }
  catch { state.dailyTaskCooldownUntil = null; }
}
async function loadDailyAdProgress() {
  try { const data = await api('/api/daily-tasks/view-ads/progress'); state.dailyAdProgress = data.progress || null; if (state.page === 'tasks' && state.taskCategory === 'daily') renderTaskCategory('daily'); }
  catch { state.dailyAdProgress = null; }
}
function formatCooldown(ms) { const totalSeconds = Math.max(0, Math.ceil(ms / 1000)); const hours = Math.floor(totalSeconds / 3600); const minutes = Math.floor((totalSeconds % 3600) / 60); const seconds = totalSeconds % 60; return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`; }
document.addEventListener('click', event => {
  const nav = event.target.closest('[data-go]'); if (nav) { showPage(nav.dataset.go); if (nav.dataset.openTaskMode === 'creator') setTimeout(() => window.setCreatorPanelVisible?.(true), 0); return; }
  const category = event.target.closest('[data-task-category]'); if (category) { renderTaskCategory(category.dataset.taskCategory); if (category.dataset.taskCategory === 'daily') { loadDailyTaskStatus(); loadDailyAdProgress(); } return; }
  const back = event.target.closest('[data-task-back]'); if (back) { state.taskCategory = null; renderTaskCategories(); return; }
  const dailyButton = event.target.closest('.daily-system-action');
  if (dailyButton) { startDailySystemTaskFlow(dailyButton.dataset.systemKey, dailyButton); return; }
  const taskOpen = event.target.closest('[data-task-open]');
  if (taskOpen) { const task = state.tasks.find(item => String(item.id) === String(taskOpen.dataset.taskOpen)); if (task?.config?.campaignUrl) window.open(task.config.campaignUrl, '_blank', 'noopener'); return; }
  const taskVerify = event.target.closest('[data-task-verify]');
  if (taskVerify) { const task = state.tasks.find(item => String(item.id) === String(taskVerify.dataset.taskVerify)); if (task?.config?.verification?.method === 'click_proof') { const saved = state.taskActions[task.id]; if (saved?.attemptId) { waitForTaskVerification(saved.attemptId).then(result => { showRewardOutcome(result, task); delete state.taskActions[task.id]; renderTaskCategory(task.taskType); }); } } return; }
  if (event.target.closest('#profileBtn')) toast('Profile settings will be enabled after the profile phase.');
  if (event.target.closest('#withdrawBtn')) toast('Withdrawal flow will open after the wallet backend is implemented and verified.');
  if (event.target.closest('#copyReferral')) toast('Referral link generation will be enabled when the Referral phase is implemented.');
});
window.addEventListener('focus', () => { if (state.page === 'tasks' && state.taskCategory === 'daily') { loadDailyTaskStatus(); loadDailyAdProgress(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.page === 'tasks' && state.taskCategory === 'daily') { loadDailyTaskStatus(); loadDailyAdProgress(); } });
renderBalances();
loadHealth();
loadMe();