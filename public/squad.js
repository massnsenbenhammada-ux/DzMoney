const squadCard = () => document.getElementById('squadCard');

function renderSquad(squad) {
  const card = squadCard();
  if (!card) return;
  if (!squad) {
    card.innerHTML = '<strong>Squad is being formed</strong><p>DzMoney creates Squads automatically when the required member pool is available.</p><div id="squadInvitations"></div>';
    return;
  }
  const ownerText = squad.isOwner ? 'You are the Squad Owner' : 'Server-assigned Squad Owner';
  card.innerHTML = `<strong>Squad #${String(squad.id)}</strong><p>${ownerText}</p><p><b>${Number(squad.memberCount)}</b> members</p><p>Membership: <b>${String(squad.membershipStatus || 'active')}</b></p><div id="squadInvitations"></div>${squad.isOwner ? '<form id="squadInviteForm"><input id="squadInviteTelegramId" inputmode="numeric" placeholder="Invitee Telegram ID" required><button type="submit">Invite</button></form>' : ''}`;
  loadInvitations();
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
    const data = await api('/api/squad');
    renderSquad(data.squad || null);
  } catch (error) {
    card.innerHTML = `<strong>Squad unavailable</strong><p>${String(error.message || 'Please try again later.')}</p>`;
  }
}

document.addEventListener('click', event => {
  const nav = event.target.closest('[data-go="squad"]');
  if (nav) setTimeout(loadSquad, 0);
  acceptInvitation(event);
});

document.addEventListener('submit', event => {
  if (event.target.id === 'squadInviteForm') inviteUser(event).catch(error => alert(String(error.message || 'Invitation failed')));
});

window.loadSquad = loadSquad;
