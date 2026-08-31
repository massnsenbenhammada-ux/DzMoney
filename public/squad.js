const squadCard = () => document.getElementById('squadCard');

function renderSquad(squad) {
  const card = squadCard();
  if (!card) return;
  if (!squad) {
    card.innerHTML = '<strong>Squad is being formed</strong><p>DzMoney creates Squads automatically when the required member pool is available.</p>';
    return;
  }
  const ownerText = squad.isOwner ? 'You are the Squad Owner' : 'Server-assigned Squad Owner';
  card.innerHTML = `<strong>Squad #${String(squad.id)}</strong><p>${ownerText}</p><p><b>${Number(squad.memberCount)}</b> members</p>`;
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
});

window.loadSquad = loadSquad;
