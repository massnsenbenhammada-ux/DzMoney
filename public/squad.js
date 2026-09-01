const squadCard = () => document.getElementById('squadCard');

function renderPaidMembership(tiers) {
  return `<section><h3>Join a Squad</h3><p>Select a membership tier. DzMoney chooses the smallest eligible Squad in that tier.</p><div>${tiers.map(tier => `<button type="button" data-squad-tier="${Number(tier.maxMembers)}">${Number(tier.minMembers)}–${Number(tier.maxMembers)} members · ${Number(tier.price)} DZP</button>`).join('')}</div></section>`;
}

function renderDailyState(state) {
  if (!state) return '<section><h4>Daily Squad</h4><p>No Squad membership yet.</p></section>';
  const status = String(state.status).toUpperCase();
  const reason = state.activationReason ? ` · ${String(state.activationReason)}` : '';
  return `<section><h4>Daily Squad · ${status}</h4><p>${Number(state.activeMemberCount)}/${Number(state.eligibleMemberCount)} members active · ${String(state.dzpContribution)}/${String(state.dailyTarget)} DZP contribution${reason}</p><p>Effective for ${String(state.effectiveForDate)} · Verified Squad ads target: ${Number(state.verifiedAdTarget)}</p></section>`;
}

function renderSquad(squad, tiers = [], state = null) {
  const card = squadCard();
  if (!card) return;
  if (!squad) {
    card.innerHTML = `<strong>Squad is being formed</strong><p>DzMoney creates Squads automatically when the required member pool is available.</p>${renderPaidMembership(tiers)}<div id="squadInvitations"></div>`;
    return;
  }
  const ownerText = squad.isOwner ? 'You are the Squad Owner' : 'Server-assigned Squad Owner';
  const purchase = squad.membershipStatus === 'cancelled' ? renderPaidMembership(tiers) : '';
  card.innerHTML = `<strong>Squad #${String(squad.id)}</strong><p>${ownerText}</p><p><b>${Number(squad.memberCount)}</b> members</p><p>Membership: <b>${String(squad.membershipStatus || 'active')}</b></p>${renderDailyState(state)}${purchase}<div id="squadInvitations"></div>${squad.isOwner ? '<form id="squadInviteForm"><input id="squadInviteTelegramId" inputmode="numeric" placeholder="Invitee Telegram ID" required><button type="submit">Invite</button></form>' : ''}`;
  loadInvitations();
}

async function loadPaidTiers() {
  const data = await api('/api/squad/membership-tiers');
  return Array.isArray(data.tiers) ? data.tiers : [];
}

async function loadInvitations() {
  const container = document.getElementById('squadInvitations');
  if (!container) return;
  try {
    const data = await api('/api/squad/invitations');
    const invitations = data.invitations || [];
    container.innerHTML = invitations.length
      ? `<h4>Pending invitations</h4>${invitations.map(item => `<div><span>Squad #${String(item.squadId)}</span> <button data-accept-invitation="${String(item.id)}">Accept</button></div>`).join('')}`
      : '<p>No pending invitations.</p>';
  } catch (error) {
    container.innerHTML = `<p>${String(error.message || 'Invitations unavailable')}</p>`;
  }
}

async function inviteUser(event) {
  event.preventDefault();
  const input = document.getElementById('squadInviteTelegramId');
  const squad = await api('/api/squad');
  if (!squad.squad || !squad.squad.isOwner) return;
  await api('/api/squad/invitations', { method: 'POST', body: JSON.stringify({ squadId: squad.squad.id, inviteeTelegramUserId: input.value.trim() }) });
  input.value = '';
  await loadInvitations();
}

async function purchaseMembership(maxMembers) {
  const button = document.querySelector(`[data-squad-tier="${String(maxMembers)}"]`);
  if (button) button.disabled = true;
  try {
    await api('/api/squad/membership/purchase', {
      method: 'POST',
      body: JSON.stringify({ maxMembers, idempotencyKey: crypto.randomUUID() })
    });
    await loadSquad();
  } catch (error) {
    if (button) button.disabled = false;
    alert(String(error.message || 'Squad membership purchase failed'));
  }
}

async function acceptInvitation(event) {
  const button = event.target.closest('[data-accept-invitation]');
  if (!button) return;
  button.disabled = true;
  try {
    await api(`/api/squad/invitations/${button.dataset.acceptInvitation}/accept`, { method: 'POST' });
    await loadSquad();
  } catch (error) {
    button.disabled = false;
    alert(String(error.message || 'Invitation could not be accepted'));
  }
}

async function loadSquad() {
  const card = squadCard();
  if (!card) return;
  card.innerHTML = '<strong>Loading Squad…</strong><p>Checking your server-side membership.</p>';
  try {
    const [data, tiers, stateData] = await Promise.all([api('/api/squad'), loadPaidTiers(), api('/api/squad/daily-state')]);
    renderSquad(data.squad || null, tiers, stateData.state || null);
  } catch (error) {
    card.innerHTML = `<strong>Squad unavailable</strong><p>${String(error.message || 'Please try again later.')}</p>`;
  }
}

document.addEventListener('click', event => {
  const nav = event.target.closest('[data-go="squad"]');
  if (nav) setTimeout(loadSquad, 0);
  const tier = event.target.closest('[data-squad-tier]');
  if (tier) purchaseMembership(Number(tier.dataset.squadTier));
  acceptInvitation(event);
});

document.addEventListener('submit', event => {
  if (event.target.id === 'squadInviteForm') inviteUser(event).catch(error => alert(String(error.message || 'Invitation failed')));
});

window.loadSquad = loadSquad;
