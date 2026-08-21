const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const $ = (id) => document.getElementById(id);
const state = {
  squad: null,
  daily: null,
  adsgram: { enabled: false, blockId: null },
  adController: null,
  adEventId: null,
};

function headers(extra = {}) {
  const result = { ...extra };
  if (tg?.initData) result['X-Telegram-Init-Data'] = tg.initData;
  return result;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: headers(options.headers || {}),
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw Object.assign(new Error(data.error || `HTTP ${response.status}`), {
      status: response.status,
      data,
    });
  }

  return data;
}

function toast(message) {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}

function formatReward(reward) {
  const parts = [];
  if (Number(reward?.coin) > 0) parts.push(`${Number(reward.coin).toLocaleString()} COIN`);
  if (Number(reward?.dzx) > 0) parts.push(`${Number(reward.dzx).toLocaleString()} DZX`);
  if (Number(reward?.dzp) > 0) parts.push(`${Number(reward.dzp).toLocaleString()} DZP`);
  return parts.join(' • ') || '—';
}

function formatCountdown(date) {
  const ms = Math.max(0, new Date(date).getTime() - Date.now());
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function renderDaily(data) {
  state.daily = data;

  const reward = $('dailyReward');
  const status = $('dailyStatus');
  const action = $('dailyAction');
  const note = $('dailyNote');

  if (!reward || !status || !action) return;

  reward.textContent = formatReward(data.reward);
  action.disabled = false;
  action.onclick = null;

  if (data.status === 'cooldown') {
    const tick = () => {
      if (state.daily?.status !== 'cooldown') return;
      status.textContent = `Available in ${formatCountdown(data.nextAvailableAt)}`;
      action.textContent = '24H COOLDOWN';
      action.disabled = true;
      if (Date.now() < new Date(data.nextAvailableAt).getTime()) {
        setTimeout(tick, 1000);
      } else {
        loadDaily();
      }
    };
    tick();
    return;
  }

  if (data.status === 'ad_pending') {
    state.adEventId = data.pendingAdEventId;
    status.textContent = 'Advertisement completed — claim your reward';
    action.textContent = 'Claim Reward';
    action.disabled = false;
    action.onclick = claimDaily;
    return;
  }

  state.adEventId = null;
  status.textContent = state.adsgram.enabled
    ? 'Watch an ad to unlock today’s reward'
    : 'AdsGram is not configured yet.';
  action.textContent = 'Daily Check-in';
  action.disabled = false;
  action.onclick = startDailyAd;

  if (note) {
    note.textContent = state.adsgram.enabled
      ? 'The reward is issued only after a verified advertisement completion.'
      : 'AdsGram Block ID is required before an advertisement can be started.';
  }
}

async function loadDaily() {
  try {
    const data = await api('/api/daily/checkin');
    renderDaily(data);
  } catch (error) {
    const status = $('dailyStatus');
    const action = $('dailyAction');
    if (status) status.textContent = error.status === 401 ? 'Authentication required' : 'Daily activity unavailable';
    if (action) {
      action.textContent = 'Daily Check-in';
      action.disabled = false;
      action.onclick = () => toast(error.status === 401 ? 'Open DzMoney inside Telegram to authenticate.' : 'Daily activity is temporarily unavailable.');
    }
  }
}

async function loadAdsgramConfig() {
  try {
    const config = await api('/api/config');
    state.adsgram = config.adsgram || { enabled: false, blockId: null };

    if (state.adsgram.enabled && state.adsgram.blockId && window.Adsgram) {
      state.adController = window.Adsgram.init({
        blockId: state.adsgram.blockId,
      });
    }
  } catch {
    state.adsgram = { enabled: false, blockId: null };
    state.adController = null;
  }

  await loadDaily();
}

async function startDailyAd() {
  if (!state.adsgram.enabled || !state.adsgram.blockId) {
    toast('AdsGram is not configured yet. Add the official Block ID first.');
    return;
  }

  if (!state.adController) {
    toast('AdsGram could not be initialized.');
    return;
  }

  const action = $('dailyAction');
  const key = `daily-ad-${crypto.randomUUID()}`;
  if (action) {
    action.disabled = true;
    action.textContent = 'Preparing…';
  }

  try {
    const started = await api('/api/daily/checkin/ad/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      body: JSON.stringify({}),
    });

    state.adEventId = started.adEvent?.id || null;
    if (!state.adEventId) throw new Error('Daily advertisement event was not created.');

    if (action) action.textContent = 'Watching…';
    await state.adController.show();

    if (action) action.textContent = 'Waiting for verification…';
    toast('Ad finished. Waiting for verified reward confirmation.');
    await loadDaily();
  } catch (error) {
    toast(error.message || 'Advertisement could not be completed.');
    if (action) {
      action.disabled = false;
      action.textContent = 'Daily Check-in';
    }
  }
}

async function claimDaily() {
  if (!state.adEventId) {
    toast('No active daily advertisement.');
    return;
  }

  const action = $('dailyAction');
  const key = `daily-claim-${crypto.randomUUID()}`;
  if (action) action.disabled = true;

  try {
    const result = await api('/api/daily/checkin/claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      body: JSON.stringify({ adEventId: state.adEventId }),
    });

    if (result.status === 'claimed') {
      toast('Daily reward claimed successfully.');
      state.adEventId = null;
      await loadDaily();
      await loadSquad();
    }
  } catch (error) {
    toast(error.message || 'Reward could not be claimed.');
    if (action) action.disabled = false;
  }
}

function renderSquad(data) {
  state.squad = data;
  const members = $('members');
  const active = $('active');
  const activity = $('activity');
  const squadMembers = $('squadMembers');
  const squadActive = $('squadActive');
  const squadActivity = $('squadActivity');
  const goals = $('goals');

  if (!data.inSquad) {
    if (members) members.textContent = '0';
    if (active) active.textContent = '0';
    if (activity) activity.textContent = '0%';
    if (squadMembers) squadMembers.textContent = '0';
    if (squadActive) squadActive.textContent = '0';
    if (squadActivity) squadActivity.textContent = '0%';
    if (goals) goals.innerHTML = '<article class="info-card"><strong>No squad yet</strong><p>Your account is not currently assigned to a squad.</p></article>';
    return;
  }

  const squad = data.squad || {};
  const memberCount = Number(squad.memberCount || 0);
  const activeCount = Number(squad.activeMemberCount || 0);
  const activityPercent = Number(squad.activityPercent || 0);

  if (members) members.textContent = memberCount.toLocaleString();
  if (active) active.textContent = activeCount.toLocaleString();
  if (activity) activity.textContent = `${activityPercent}%`;
  if (squadMembers) squadMembers.textContent = memberCount.toLocaleString();
  if (squadActive) squadActive.textContent = activeCount.toLocaleString();
  if (squadActivity) squadActivity.textContent = `${activityPercent}%`;
}

async function loadSquad() {
  try {
    const data = await api('/api/squad');
    renderSquad(data);
    await loadGoals();
  } catch (error) {
    if (error.status === 401) {
      const account = $('accountText');
      if (account) account.textContent = 'Open DzMoney inside Telegram to authenticate your account.';
      return;
    }
    const account = $('accountText');
    if (account) account.textContent = 'The Squad service is temporarily unavailable.';
  }
}

async function loadGoals() {
  const goals = $('goals');
  if (!goals) return;
  try {
    const data = await api('/api/squad/goals');
    if (!data.inSquad || !data.goals?.length) {
      goals.innerHTML = '<article class="info-card"><strong>Squad goals</strong><p>No active goals are published for your squad.</p></article>';
      return;
    }
    goals.innerHTML = data.goals.map((goal) => {
      const progress = Math.min(100, (Number(goal.progress || 0) / Math.max(1, Number(goal.target_quantity || 1))) * 100);
      return `<article class="goal-card"><div class="goal-top"><span>${escapeHtml(goal.target_type || 'Goal')}</span><strong>${escapeHtml(goal.title || 'Squad goal')}</strong></div><p>${escapeHtml(goal.description || 'Contribute qualifying activity to this goal.')}</p><div class="progress"><i style="width:${progress}%"></i></div><div class="goal-meta"><span>${Number(goal.progress || 0).toLocaleString()} / ${Number(goal.target_quantity || 0).toLocaleString()}</span><span>${progress.toFixed(0)}%</span></div></article>`;
    }).join('');
  } catch {
    goals.innerHTML = '<article class="info-card"><strong>Squad goals</strong><p>Goals are temporarily unavailable.</p></article>';
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>\'\"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[char]));
}

function showPage(page) {
  document.querySelectorAll('.page').forEach((element) => {
    element.classList.toggle('active', element.dataset.page === page);
  });
  document.querySelectorAll('.nav-item').forEach((element) => {
    element.classList.toggle('active', element.dataset.go === page);
  });
  if (page === 'squad') loadSquad();
  if (page === 'home') loadDaily();
}

document.addEventListener('click', (event) => {
  const nav = event.target.closest('[data-go]');
  if (nav) showPage(nav.dataset.go);
});

const user = tg?.initDataUnsafe?.user;
if (user) {
  const welcome = $('welcomeLabel');
  const account = $('accountText');
  if (welcome) welcome.textContent = `WELCOME, ${String(user.first_name || '').toUpperCase()}`;
  if (account) account.textContent = `Connected as ${user.first_name || ''}${user.last_name ? ` ${user.last_name}` : ''}.`;
}

loadSquad();
loadAdsgramConfig();
