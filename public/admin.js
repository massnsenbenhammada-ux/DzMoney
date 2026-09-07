const telegram = window.Telegram?.WebApp;
const errorState = document.getElementById('errorState');
const economyState = document.getElementById('economyState');

function setError(message) {
  errorState.textContent = message;
  errorState.hidden = false;
}

function clearError() {
  errorState.hidden = true;
  errorState.textContent = '';
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderBars(elementId, rows, valueKey) {
  const root = document.getElementById(elementId);
  const values = rows.map(row => Number(row[valueKey] || 0));
  const max = Math.max(...values, 1);
  root.innerHTML = rows.map(row => {
    const value = Number(row[valueKey] || 0);
    const height = Math.max(2, (value / max) * 100);
    const date = new Date(`${row.date}T00:00:00+01:00`);
    const label = date.toLocaleDateString('en-US', { weekday: 'short' });
    return `<div class="bar-item"><span class="bar-value">${formatNumber(value)}</span><div class="bar-track"><div class="bar-fill" style="height:${height}%"></div></div><span class="bar-label">${label}</span></div>`;
  }).join('');
}

function memberLabel(row) {
  return row.username ? `@${row.username}` : (row.firstName || `User ${row.telegramUserId}`);
}

function renderRankingList(elementId, rows, valueKey, valueLabel) {
  const root = document.getElementById(elementId);
  root.innerHTML = rows.length
    ? rows.map((row, index) => `<li><span class="rank">${index + 1}</span><span class="member-name">${escapeHtml(memberLabel(row))}</span><strong>${formatNumber(row[valueKey])}<small>${valueLabel}</small></strong></li>`).join('')
    : '<li class="empty-ranking">No qualifying activity yet.</li>';
}

function renderDashboard(data) {
  document.getElementById('membersValue').textContent = formatNumber(data.realtime.totalMembers);
  document.getElementById('adsValue').textContent = formatNumber(data.realtime.advertisementsWatched);
  document.getElementById('tasksValue').textContent = formatNumber(data.realtime.tasksCompleted);
  renderBars('membersChart', data.sevenDay, 'totalMembers');
  renderBars('adsChart', data.sevenDay, 'advertisementsWatched');
  renderBars('tasksChart', data.sevenDay, 'tasksCompleted');
  renderRankingList('activeMembersList', data.topActiveMembers || [], 'activityCount', 'activities');
  renderRankingList('referrersList', data.topReferrers || [], 'referralCount', 'qualified referrals');
}

function setEconomyState(message, isError = false) {
  economyState.textContent = message;
  economyState.dataset.state = isError ? 'error' : 'ok';
}

function economyInputs() {
  return {
    'economy.dzx_per_ton': document.getElementById('economyDZXPerTon'),
    'economy.coin_per_dzp': document.getElementById('economyCoinPerDZP'),
    'economy.dzx_per_dzp': document.getElementById('economyDZXPerDZP'),
  };
}

async function loadEconomySettings() {
  const response = await fetch('/api/admin/economy', {
    headers: { 'X-Telegram-Init-Data': telegram.initData },
    cache: 'no-store'
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to load economy settings');
  const inputs = economyInputs();
  Object.entries(inputs).forEach(([key, input]) => { input.value = data.settings?.[key] ?? ''; });
}

async function saveEconomySetting(key) {
  const input = economyInputs()[key];
  const value = input.value.trim();
  if (!value || Number(value) <= 0 || !Number.isFinite(Number(value))) {
    setEconomyState('Enter a positive numeric value.', true);
    return;
  }
  input.disabled = true;
  setEconomyState('Saving…');
  try {
    const response = await fetch(`/api/admin/economy/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': telegram.initData },
      body: JSON.stringify({ value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to save economy setting');
    input.value = data.setting.value;
    setEconomyState(data.setting.changed ? 'Saved and audited.' : 'No change required.');
  } catch (error) {
    setEconomyState(error.message || 'Unable to save economy setting.', true);
  } finally {
    input.disabled = false;
  }
}

async function loadDashboard() {
  clearError();
  if (!telegram?.initData) {
    setError('Open the Admin Panel from the authenticated Telegram Mini App.');
    return;
  }
  try {
    const response = await fetch('/api/admin/dashboard', {
      headers: { 'X-Telegram-Init-Data': telegram.initData },
      cache: 'no-store'
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Admin dashboard request failed');
    renderDashboard(data);
    await loadEconomySettings();
  } catch (error) {
    setError(error.message || 'Unable to load Admin dashboard.');
  }
}

telegram?.ready();
telegram?.expand();
document.getElementById('refreshButton').addEventListener('click', loadDashboard);
document.querySelectorAll('[data-economy-key]').forEach(button => button.addEventListener('click', () => saveEconomySetting(button.dataset.economyKey)));
loadDashboard();
