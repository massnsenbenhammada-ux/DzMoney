const telegram = window.Telegram?.WebApp;
const errorState = document.getElementById('errorState');

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

function renderDashboard(data) {
  document.getElementById('membersValue').textContent = formatNumber(data.realtime.totalMembers);
  document.getElementById('adsValue').textContent = formatNumber(data.realtime.advertisementsWatched);
  document.getElementById('tasksValue').textContent = formatNumber(data.realtime.tasksCompleted);
  renderBars('membersChart', data.sevenDay, 'totalMembers');
  renderBars('adsChart', data.sevenDay, 'advertisementsWatched');
  renderBars('tasksChart', data.sevenDay, 'tasksCompleted');
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
  } catch (error) {
    setError(error.message || 'Unable to load Admin dashboard.');
  }
}

telegram?.ready();
telegram?.expand();
document.getElementById('refreshButton').addEventListener('click', loadDashboard);
loadDashboard();
