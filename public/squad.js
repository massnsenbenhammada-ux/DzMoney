const squadCard = () => document.getElementById('squadCard');
const escapeHtml = value => String(value ?? '').replace(/[&<>\"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[char]));
const idempotencyKey = () => `squad-ad:${crypto.randomUUID()}`;

function renderLoading() {
  return '<div class="squad-loading" aria-busy="true"><div class="squad-spin"></div><div class="squad-skeleton short"></div><div class="squad-skeleton long"></div><div class="squad-skeleton long"></div></div>';
}

function renderPaidMembership(tiers) {
  if (!tiers.length) return '';
  return `<section class="squad-section"><div class="squad-daily-head"><div><span class="squad-eyebrow">MEMBERSHIP</span><h3>Choose your Squad</h3></div></div><p>Select a tier. DzMoney chooses the smallest eligible Squad in that tier.</p><div class="squad-tier-grid">${tiers.map(tier => `<button type="button" class="squad-tier" data-squad-tier="${Number(tier.maxMembers)}"><span class="squad-tier-label">MEMBERSHIP TIER</span><span class="squad-tier-members">${Number(tier.minMembers)}–${Number(tier.maxMembers)} members</span><span class="squad-tier-price">${Number(tier.price)} DZP</span></button>`).join('')}</div></section>`;
}

function renderDailyState(state) {
  if (!state) return '';
  const active = Math.max(0, Number(state.activeMemberCount));
  const eligible = Math.max(0, Number(state.eligibleMemberCount));
  const contribution = Math.max(0, Number(state.dzpContribution));
  const target = Math.max(0, Number(state.dailyTarget));
  const memberPercent = eligible ? Math.min(100, (active / eligible) * 100) : 0;
  const dzpPercent = target ? Math.min(100, (contribution / target) * 100) : 0;
  const status = String(state.status || '').toLowerCase();
  const reason = state.activationReason ? `<span> · ${escapeHtml(state.activationReason)}</span>` : '';
  return `<section class="squad-section"><div class="squad-daily-head"><div><span class="squad-eyebrow">TODAY</span><h3>Daily Squad</h3><p class="squad-date">Effective ${escapeHtml(state.effectiveForDate)}</p></div><span class="squad-status ${status === 'active' ? 'active' : 'inactive'}">${escapeHtml(status || 'unknown')}</span></div><div class="squad-metric"><div class="squad-progress-meta"><span>Active members</span><strong>${active}/${eligible}</strong></div><div class="squad-progress" role="progressbar" aria-valuenow="${Math.round(memberPercent)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${memberPercent}%"></i></div></div><div class="squad-metric"><div class="squad-progress-meta"><span>DZP contribution</span><strong>${escapeHtml(state.dzpContribution)}/${escapeHtml(state.dailyTarget)}</strong></div><div class="squad-progress dzp" role="progressbar" aria-valuenow="${Math.round(dzpPercent)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${dzpPercent}%"></i></div></div><p>${escapeHtml(state.verifiedAdTarget)} verified Squad ads target${reason}</p><div class="squad-ad-action"><button type="button" class="squad-btn primary" data-squad-ad>WATCH AD</button><small data-squad-ad-status></small></div></section>`;
}

function renderInvitationsShell() {
  return '<section class="squad-section"><div class="squad-daily-head"><div><span class="squad-eyebrow">INBOX</span><h3>Invitations</h3></div></div><div id="squadInvitations" class="squad-invitations"><div class="squad-skeleton short"></div><div class="squad-skeleton long"></div></div></section>';
}

function renderSquad(squad, tiers = [], state = null) {
  const card = squadCard();
  if (!card) return;
  if (!squad) {
    card.innerHTML = `<div class="squad-empty"><div class="squad-empty-icon" aria-hidden="true">◆</div><span class="squad-eyebrow">YOUR COMMUNITY</span><h2>No Squad yet</h2><p>Join a membership tier or wait for DzMoney to place you in an eligible Squad.</p></div>${renderPaidMembership(tiers)}${renderInvitationsShell()}`;
    loadInvitations();
    return;
  }
  const membership = String(squad.membershipStatus || 'active');
  const owner = Boolean(squad.isOwner);
  const purchase = membership === 'cancelled' ? renderPaidMembership(tiers) : '';
  card.innerHTML = `<div class="squad-hero"><div class="squad-hero-top"><div><span class="squad-eyebrow">SQUAD</span><h2 class="squad-number">#${escapeHtml(squad.id)}</h2></div>${owner ? '<span class="squad-owner-badge">OWNER</span>' : `<span class="squad-status active">${escapeHtml(membership)}</span>`}</div><div class="squad-stats"><div class="squad-stat"><strong>${Number(squad.memberCount)}</strong><span>Members</span></div><div class="squad-stat"><strong>${owner ? 'Owner' : 'Member'}</strong><span>Your role</span></div></div></div>${renderDailyState(state)}${purchase}${renderInvitationsShell()}${owner ? '<section class="squad-section"><span class="squad-eyebrow">GROW YOUR SQUAD</span><h3>Invite a member</h3><p>Enter the member Telegram ID to send an invitation.</p><form id="squadInviteForm" class="squad-invite-form"><div class="squad-invite-row"><input class="squad-input" id="squadInviteTelegramId" inputmode="numeric" autocomplete="off" placeholder="Telegram user ID" aria-label="Invitee Telegram ID" required><button class="squad-btn primary" type="submit">Invite</button></div></form></section>' : ''}`;
  loadInvitations();
}

async function loadPaidTiers() { const data = await api('/api/squad/membership-tiers'); return Array.isArray(data.tiers) ? data.tiers : []; }
async function loadInvitations() {
  const container = document.getElementById('squadInvitations');
  if (!container) return;
  try {
    const data = await api('/api/squad/invitations');
    const invitations = Array.isArray(data.invitations) ? data.invitations : [];
    container.innerHTML = invitations.length ? invitations.map(item => `<article class="squad-invitation"><div><strong>Squad #${escapeHtml(item.squadId)}</strong><small>Pending invitation</small></div><button class="squad-btn primary" type="button" data-accept-invitation="${escapeHtml(item.id)}">Accept</button></article>`).join('') : '<div class="squad-empty-inline">No pending invitations.</div>';
  } catch (error) { container.innerHTML = `<div class="squad-empty-inline">${escapeHtml(error.message || 'Invitations unavailable')}</div>`; }
}

async function watchSquadAd() {
  const button = document.querySelector('[data-squad-ad]');
  const status = document.querySelector('[data-squad-ad-status]');
  if (!button || button.disabled) return;
  button.disabled = true;
  button.textContent = 'LOADING…';
  if (status) status.textContent = '';
  try {
    if (typeof window.DzMoneyAdClient?.getProvider !== 'function') throw new Error('Advertisement providers are unavailable');
    const response = await api('/api/squad/ads/start', { method: 'POST', body: JSON.stringify({ idempotencyKey: idempotencyKey() }) });
    const adapter = window.DzMoneyAdClient.getProvider(response.providerId);
    if (!adapter?.handler || typeof adapter.handler !== 'function') throw new Error('Advertisement provider is unavailable');
    button.textContent = 'WATCHING…';
    await adapter.ready;
    await adapter.handler({ requestVar: 'squad', adEventId: response.adEventId, ymid: response.externalAdId });
    button.textContent = 'VERIFYING…';
    const deadline = Date.now() + 15000;
    let verified = false;
    while (Date.now() < deadline) {
      const state = await api(`/api/squad/ads/status?adEventId=${encodeURIComponent(response.adEventId)}`);
      if (state.verified) { verified = true; break; }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!verified) throw new Error('Advertisement verification is still pending');
    if (status) status.textContent = 'Verified. Reward credited.';
    await loadSquad();
  } catch (error) {
    button.disabled = false;
    button.textContent = 'WATCH AD';
    if (status) status.textContent = String(error.message || 'Advertisement unavailable');
  }
}

async function inviteUser(event) {
  event.preventDefault();
  const form = event.target;
  const input = document.getElementById('squadInviteTelegramId');
  const submit = form.querySelector('button[type="submit"]');
  if (!input || !submit) return;
  submit.disabled = true; submit.textContent = 'Sending…';
  try {
    const squad = await api('/api/squad');
    if (!squad.squad || !squad.squad.isOwner) return;
    await api('/api/squad/invitations', { method: 'POST', body: JSON.stringify({ squadId: squad.squad.id, inviteeTelegramUserId: input.value.trim() }) });
    input.value = ''; await loadInvitations();
  } finally { submit.disabled = false; submit.textContent = 'Invite'; }
}

async function purchaseMembership(maxMembers) {
  const button = document.querySelector(`[data-squad-tier="${String(maxMembers)}"]`);
  if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
  try { await api('/api/squad/membership/purchase', { method: 'POST', body: JSON.stringify({ maxMembers, idempotencyKey: crypto.randomUUID() }) }); await loadSquad(); }
  catch (error) { if (button) { button.disabled = false; button.removeAttribute('aria-busy'); } alert(String(error.message || 'Squad membership purchase failed')); }
}

async function acceptInvitation(event) {
  const button = event.target.closest('[data-accept-invitation]');
  if (!button) return;
  button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = 'Accepting…';
  try { await api(`/api/squad/invitations/${button.dataset.acceptInvitation}/accept`, { method: 'POST' }); await loadSquad(); }
  catch (error) { button.disabled = false; button.removeAttribute('aria-busy'); button.textContent = 'Accept'; alert(String(error.message || 'Invitation could not be accepted')); }
}

async function loadSquad() {
  const card = squadCard();
  if (!card) return;
  card.innerHTML = renderLoading();
  try { const [data, tiers, stateData] = await Promise.all([api('/api/squad'), loadPaidTiers(), api('/api/squad/daily-state')]); renderSquad(data.squad || null, tiers, stateData.state || null); }
  catch (error) { card.innerHTML = `<div class="squad-empty"><div class="squad-empty-icon" aria-hidden="true">!</div><span class="squad-eyebrow">TEMPORARILY UNAVAILABLE</span><h2>Squad unavailable</h2><p>${escapeHtml(error.message || 'Please try again later.')}</p></div>`; }
}

document.addEventListener('click', event => {
  const nav = event.target.closest('[data-go="squad"]');
  if (nav) setTimeout(loadSquad, 0);
  const tier = event.target.closest('[data-squad-tier]');
  if (tier) purchaseMembership(Number(tier.dataset.squadTier));
  if (event.target.closest('[data-squad-ad]')) watchSquadAd();
  acceptInvitation(event);
});

document.addEventListener('submit', event => {
  if (event.target.id === 'squadInviteForm') inviteUser(event).catch(error => alert(String(error.message || 'Invitation failed')));
});

window.loadSquad = loadSquad;
