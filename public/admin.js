const telegram = window.Telegram?.WebApp;
const errorState = document.getElementById('errorState');
const economyState = document.getElementById('economyState');
const usersState = document.getElementById('usersState');
const referralState = document.getElementById('referralState');
const squadState = document.getElementById('squadState');
let selectedAdminUserId = null;

function setError(message) { errorState.textContent = message; errorState.hidden = false; }
function clearError() { errorState.hidden = true; errorState.textContent = ''; }
function setUsersState(message, isError = false) { usersState.textContent = message; usersState.dataset.state = isError ? 'error' : 'ok'; }
function setReferralState(message, isError = false) { referralState.textContent = message; referralState.dataset.state = isError ? 'error' : 'ok'; }
function setSquadState(message, isError = false) { squadState.textContent = message; squadState.dataset.state = isError ? 'error' : 'ok'; }
function formatNumber(value) { return new Intl.NumberFormat('en-US').format(Number(value || 0)); }
function escapeHtml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }

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
function memberLabel(row) { return row.username ? `@${row.username}` : (row.firstName || `User ${row.telegramUserId}`); }
function renderRankingList(elementId, rows, valueKey, valueLabel) {
  const root = document.getElementById(elementId);
  root.innerHTML = rows.length ? rows.map((row, index) => `<li><span class="rank">${index + 1}</span><span class="member-name">${escapeHtml(memberLabel(row))}</span><strong>${formatNumber(row[valueKey])}<small>${valueLabel}</small></strong></li>`).join('') : '<li class="empty-ranking">No qualifying activity yet.</li>';
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

function setEconomyState(message, isError = false) { economyState.textContent = message; economyState.dataset.state = isError ? 'error' : 'ok'; }
function economyInputs() { return { 'economy.dzx_per_ton': document.getElementById('economyDZXPerTon'), 'economy.coin_per_dzp': document.getElementById('economyCoinPerDZP'), 'economy.dzx_per_dzp': document.getElementById('economyDZXPerDZP') }; }
async function loadEconomySettings() {
  const response = await fetch('/api/admin/economy', { headers: { 'X-Telegram-Init-Data': telegram.initData }, cache: 'no-store' });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to load economy settings');
  Object.entries(economyInputs()).forEach(([key, input]) => { input.value = data.settings?.[key] ?? ''; });
}
async function saveEconomySetting(key) {
  const input = economyInputs()[key]; const value = input.value.trim();
  if (!value || Number(value) <= 0 || !Number.isFinite(Number(value))) { setEconomyState('Enter a positive numeric value.', true); return; }
  input.disabled = true; setEconomyState('Saving…');
  try {
    const response = await fetch(`/api/admin/economy/${encodeURIComponent(key)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': telegram.initData }, body: JSON.stringify({ value }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to save economy setting');
    input.value = data.setting.value; setEconomyState(data.setting.changed ? 'Saved and audited.' : 'No change required.');
  } catch (error) { setEconomyState(error.message || 'Unable to save economy setting.', true); } finally { input.disabled = false; }
}

function renderUserList(users) {
  const root = document.getElementById('adminUserList');
  root.innerHTML = users.length ? users.map(user => `<li><button class="user-row" type="button" data-user-id="${escapeHtml(user.id)}"><span><strong>${escapeHtml(memberLabel(user))}</strong><small>Telegram ${escapeHtml(user.telegramUserId)}</small></span><small>#${escapeHtml(user.id)}</small></button></li>`).join('') : '<li class="empty-ranking">No members found.</li>';
  root.querySelectorAll('[data-user-id]').forEach(button => button.addEventListener('click', () => loadUserProfile(button.dataset.userId)));
}
function walletCard(wallet) { const source = wallet.currency === 'DZP' ? `<small>Earned ${wallet.earned_dzp} · Converted ${wallet.converted_dzp} · Purchased ${wallet.purchased_dzp}</small>` : '<small>Canonical wallet balance</small>'; return `<div class="wallet-card"><span>${escapeHtml(wallet.currency)}</span><strong>${escapeHtml(wallet.balance)}</strong>${source}</div>`; }
function ledgerRow(entry) { const amount = Number(entry.amount); const sign = amount >= 0 ? '+' : ''; return `<li><span>${escapeHtml(entry.currency)}</span><span class="${amount >= 0 ? 'positive' : 'negative'}">${sign}${escapeHtml(entry.amount)}<small> · ${escapeHtml(entry.source || '—')}</small></span><small>${escapeHtml(entry.transaction_type)}</small></li>`; }
function renderUserProfile(data) {
  const user = data.user; const root = document.getElementById('adminUserProfile');
  root.innerHTML = `<div class="section-heading"><div><span class="eyebrow">PROFILE</span><h2>${escapeHtml(memberLabel(user))}</h2><span class="user-meta">Telegram ${escapeHtml(user.telegramUserId)} · User #${escapeHtml(user.id)}</span></div></div><div class="wallet-grid">${data.wallets.map(walletCard).join('')}</div><form id="adminBalanceAdjustment" class="users-form"><input name="amount" inputmode="decimal" placeholder="Amount (negative to debit)" required><select name="currency"><option>COIN</option><option>DZX</option><option>DZP</option></select><select name="dzpSource"><option value="earned_dzp">DZP: earned</option><option value="converted_dzp">DZP: converted</option><option value="purchased_dzp">DZP: purchased</option></select><textarea name="reason" placeholder="Mandatory reason" required maxlength="500"></textarea><button type="submit">Apply Balance Adjustment</button></form><ul class="ledger-list">${data.ledger.length ? data.ledger.map(ledgerRow).join('') : '<li>No ledger activity yet.</li>'}</ul>`;
  const form = document.getElementById('adminBalanceAdjustment'); const currency = form.elements.currency; const source = form.elements.dzpSource;
  const syncSource = () => { source.disabled = currency.value !== 'DZP'; }; currency.addEventListener('change', syncSource); syncSource(); form.addEventListener('submit', submitBalanceAdjustment);
}
async function loadUsers() {
  setUsersState('Loading…'); const query = document.getElementById('adminUserSearch').value.trim();
  const response = await fetch(`/api/admin/users?q=${encodeURIComponent(query)}`, { headers: { 'X-Telegram-Init-Data': telegram.initData }, cache: 'no-store' });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to load members'); renderUserList(data.users || []); setUsersState(`${(data.users || []).length} member(s) found.`);
}
async function loadUserProfile(userId) {
  selectedAdminUserId = userId; setUsersState('Loading profile…');
  try { const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, { headers: { 'X-Telegram-Init-Data': telegram.initData }, cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to load member profile'); renderUserProfile(data); setUsersState('Profile loaded.'); }
  catch (error) { setUsersState(error.message || 'Unable to load member profile.', true); }
}
async function submitBalanceAdjustment(event) {
  event.preventDefault(); if (!selectedAdminUserId) return; const form = event.currentTarget;
  const payload = { amount: form.elements.amount.value.trim(), currency: form.elements.currency.value, dzpSource: form.elements.dzpSource.value, reason: form.elements.reason.value.trim(), idempotencyKey: crypto.randomUUID() };
  form.querySelector('button').disabled = true; setUsersState('Applying adjustment…');
  try { const response = await fetch(`/api/admin/users/${encodeURIComponent(selectedAdminUserId)}/balance-adjustment`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': telegram.initData }, body: JSON.stringify(payload) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to apply balance adjustment'); setUsersState(data.duplicate ? 'Existing adjustment returned (idempotent).' : 'Adjustment applied and recorded in ledger.'); await loadUserProfile(selectedAdminUserId); }
  catch (error) { setUsersState(error.message || 'Unable to apply balance adjustment.', true); } finally { form.querySelector('button').disabled = false; }
}

function referralInputs() { return { 'referral.reward_coin': document.getElementById('referralActivationCoin'), 'referral.reward_dzx': document.getElementById('referralActivationDzx'), 'referral.reward_dzp': document.getElementById('referralActivationDzp'), 'referral.lifetime_percent': document.getElementById('referralLifetime') }; }
async function loadReferralSettings() {
  const response = await fetch('/api/admin/referral', { headers: { 'X-Telegram-Init-Data': telegram.initData }, cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to load referral settings');
  Object.entries(referralInputs()).forEach(([key, input]) => { input.value = data.settings?.[key] ?? ''; }); document.getElementById('referralQualification').textContent = data.qualification?.rule || 'Verified task or advertisement';
}
async function saveReferralSetting(key) {
  const input = referralInputs()[key]; const value = input.value.trim(); if (!value || Number(value) < 0 || !Number.isFinite(Number(value))) { setReferralState('Enter a valid non-negative numeric value.', true); return; }
  if (key === 'referral.lifetime_percent' && Number(value) > 100) { setReferralState('Lifetime percentage must be between 0 and 100.', true); return; }
  input.disabled = true; setReferralState('Saving…');
  try { const response = await fetch(`/api/admin/referral/${encodeURIComponent(key)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': telegram.initData }, body: JSON.stringify({ value }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to save referral setting'); input.value = data.value; setReferralState(data.changed ? 'Saved and audited.' : 'No change required.'); }
  catch (error) { setReferralState(error.message || 'Unable to save referral setting.', true); } finally { input.disabled = false; }
}

function squadInputs() { return { 'squad.daily_target_dzp_per_member': document.getElementById('squadDailyTarget'), 'squad.daily_verified_ad_target': document.getElementById('squadVerifiedAdTarget') }; }
function renderSquadSettings(data) {
  const inputs = squadInputs(); Object.entries(inputs).forEach(([key, input]) => { input.value = data.settings?.[key] ?? ''; });
  const tiers = data.settings?.['squad.membership_tiers'] || [];
  document.getElementById('squadMembershipTiers').textContent = tiers.length ? tiers.map(tier => `${tier.minMembers}–${tier.maxMembers}: ${tier.price} DZP`).join(' · ') : 'No configured tiers.';
  document.getElementById('squadModifierMapping').textContent = (data.modifierMapping || []).map(row => `${formatNumber(row.contribution)} DZP → ${Math.round(row.modifier * 100)}%`).join(' · ');
  document.getElementById('squadChallengeScopes').textContent = 'Loading challenge scopes…';
}
async function loadSquadSettings() {
  const response = await fetch('/api/admin/squad/settings', { headers: { 'X-Telegram-Init-Data': telegram.initData }, cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to load Squad settings');
  renderSquadSettings(data);
  const scopesResponse = await fetch('/api/admin/squad/challenges/scopes', { headers: { 'X-Telegram-Init-Data': telegram.initData }, cache: 'no-store' }); const scopesData = await scopesResponse.json(); if (!scopesResponse.ok) throw new Error(scopesData.error || 'Unable to load Squad challenge scopes');
  document.getElementById('squadChallengeScopes').textContent = (scopesData.scopes || []).join(' · ') || 'No challenge scopes configured.';
}
async function saveSquadSetting(key) {
  const input = squadInputs()[key]; const value = input.value.trim(); if (!value || Number(value) < 0 || !Number.isFinite(Number(value))) { setSquadState('Enter a valid non-negative numeric value.', true); return; }
  if (key === 'squad.daily_verified_ad_target' && !Number.isInteger(Number(value))) { setSquadState('Verified ad target must be an integer.', true); return; }
  input.disabled = true; setSquadState('Saving…');
  try { const response = await fetch(`/api/admin/squad/settings/${encodeURIComponent(key)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': telegram.initData }, body: JSON.stringify({ value }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to save Squad setting'); input.value = Array.isArray(data.value) ? JSON.stringify(data.value) : data.value; setSquadState(data.changed ? 'Saved and audited.' : 'No change required.'); }
  catch (error) { setSquadState(error.message || 'Unable to save Squad setting.', true); } finally { input.disabled = false; }
}

async function loadDashboard() {
  clearError(); if (!telegram?.initData) { setError('Open the Admin Panel from the authenticated Telegram Mini App.'); return; }
  try { const response = await fetch('/api/admin/dashboard', { headers: { 'X-Telegram-Init-Data': telegram.initData }, cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Admin dashboard request failed'); renderDashboard(data); await loadEconomySettings(); await loadUsers(); await loadReferralSettings(); await loadSquadSettings(); }
  catch (error) { setError(error.message || 'Unable to load Admin dashboard.'); }
}

const adminTabs = {
  dashboard: document.getElementById('dashboardSection'),
  economy: document.getElementById('economySection'),
  users: document.getElementById('usersSection'),
  referral: document.getElementById('referralSection'),
  squad: document.getElementById('squadSection'),
  enforcement: document.getElementById('enforcementSection'),
  campaigns: document.getElementById('adminTaskCampaignSection'),
};
function setActiveAdminTab(tabName) {
  const activeTab = adminTabs[tabName] ? tabName : 'dashboard';
  Object.entries(adminTabs).forEach(([name, section]) => {
    section.hidden = name !== activeTab;
    const button = document.querySelector(`[data-admin-tab="${name}"]`);
    if (button) {
      button.classList.toggle('active', name === activeTab);
      button.setAttribute('aria-selected', String(name === activeTab));
    }
  });
  sessionStorage.setItem('dzmoney-admin-tab', activeTab);
}

document.querySelectorAll('[data-admin-tab]').forEach(button => button.addEventListener('click', () => setActiveAdminTab(button.dataset.adminTab)));

telegram?.ready(); telegram?.expand();
document.getElementById('refreshButton').addEventListener('click', loadDashboard);
document.querySelectorAll('[data-economy-key]').forEach(button => button.addEventListener('click', () => saveEconomySetting(button.dataset.economyKey)));
document.querySelectorAll('[data-referral-key]').forEach(button => button.addEventListener('click', () => saveReferralSetting(button.dataset.referralKey)));
document.querySelectorAll('[data-squad-key]').forEach(button => button.addEventListener('click', () => saveSquadSetting(button.dataset.squadKey)));
document.getElementById('adminUserSearchButton').addEventListener('click', () => loadUsers().catch(error => setUsersState(error.message, true)));
document.getElementById('adminUserSearch').addEventListener('keydown', event => { if (event.key === 'Enter') loadUsers().catch(error => setUsersState(error.message, true)); });
setActiveAdminTab(sessionStorage.getItem('dzmoney-admin-tab') || 'dashboard');
loadDashboard();