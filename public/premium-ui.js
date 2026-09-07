(() => {
  const root = document.querySelector('.app-shell');
  if (!root) return;
  const promo = document.createElement('article');
  promo.className = 'premium-promo';
  promo.innerHTML = '<span class="premium-promo-icon" aria-hidden="true">✦</span><div><strong>Earn smarter with DzMoney</strong><span>Tasks, Gaming and Squad activity stay verified by the server.</span></div>';
  const quick = document.querySelector('.quick-grid');
  if (quick) quick.insertAdjacentElement('afterend', promo);

  const sheet = document.createElement('div');
  sheet.className = 'profile-sheet';
  sheet.hidden = true;
  sheet.innerHTML = '<section class="profile-panel" role="dialog" aria-modal="true" aria-label="Profile"><div class="profile-head"><div class="profile-avatar" id="premiumAvatar">D</div><div><strong id="premiumName">DzMoney user</strong><span id="premiumId">Telegram account</span></div><button class="profile-close" type="button" aria-label="Close">×</button></div><div class="profile-balances"><div class="profile-balance coin"><small>COIN</small><strong id="premiumCoin">0</strong></div><div class="profile-balance dzx"><small>DZX</small><strong id="premiumDzx">0</strong></div><div class="profile-balance dzp"><small>DZP</small><strong id="premiumDzp">0</strong></div></div><div class="profile-actions"><button class="profile-action" data-profile-go="wallet">Wallet</button><button class="profile-action" data-profile-go="tasks">Tasks</button></div></section></div>';
  root.appendChild(sheet);
  const text = id => document.getElementById(id)?.textContent || '0';
  const close = () => { sheet.classList.remove('open'); setTimeout(() => { sheet.hidden = true; }, 180); };
  const open = () => {
    const eyebrow = document.querySelector('.welcome-row .eyebrow')?.textContent || 'DZ MONEY USER';
    const name = eyebrow.replace(/^WELCOME,\s*/i, '').trim() || 'DzMoney user';
    document.getElementById('premiumName').textContent = name;
    document.getElementById('premiumId').textContent = 'Telegram account';
    document.getElementById('premiumAvatar').textContent = name.charAt(0).toUpperCase() || 'D';
    document.getElementById('premiumCoin').textContent = text('coinBalance');
    document.getElementById('premiumDzx').textContent = text('dzxBalance');
    document.getElementById('premiumDzp').textContent = text('dzpBalance');
    sheet.hidden = false;
    requestAnimationFrame(() => sheet.classList.add('open'));
  };
  document.addEventListener('click', event => {
    if (event.target.closest('#profileBtn')) open();
    if (event.target === sheet || event.target.closest('.profile-close')) close();
    const nav = event.target.closest('[data-profile-go]');
    if (nav) { close(); document.querySelector(`[data-go="${nav.dataset.profileGo}"]`)?.click(); }
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && sheet.classList.contains('open')) close(); });
})();

/* Phase 11 additive user-app UI. The existing profile-sheet above is intentionally unchanged. */
(() => {
  const root = document.querySelector('.app-shell');
  if (!root) return;
  const initData = window.Telegram?.WebApp?.initData;
  const api = async path => {
    const headers = initData ? { 'X-Telegram-Init-Data': initData } : {};
    const response = await fetch(path, { headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const squadNav = document.querySelector('.bottom-nav [data-go="squad"]');
  if (squadNav) squadNav.classList.add('phase11-squad-nav');

  const promoCard = document.getElementById('promoCodeCard');
  const home = document.querySelector('[data-page="home"]');
  if (home && promoCard && !home.querySelector('.phase11-home-overview')) {
    const section = document.createElement('section');
    section.className = 'phase11-home-overview';
    section.innerHTML = `
      <div class="phase11-status-grid">
        <button class="phase11-status-card" type="button" data-go="squad">
          <span class="phase11-status-icon" aria-hidden="true">◆</span>
          <span class="phase11-status-copy"><small>SQUAD</small><strong data-home-squad-summary>Squad #— • Level — • — Members</strong></span>
          <span class="phase11-status-arrow" aria-hidden="true">›</span>
        </button>
        <button class="phase11-status-card" type="button" data-go="gaming">
          <span class="phase11-status-icon" aria-hidden="true">🎮</span>
          <span class="phase11-status-copy"><small>GAMING</small><strong>Ready to play</strong><em><b data-home-spin-balance>0</b> Spins · <b data-home-axe-balance>0</b> Axes</em></span>
          <span class="phase11-status-arrow" aria-hidden="true">›</span>
        </button>
      </div>
      <section class="phase11-home-section"><div class="section-head"><h2>Daily Activity</h2></div><button class="phase11-daily-card" type="button" data-go="tasks"><span class="phase11-status-icon" aria-hidden="true">◷</span><span><strong data-home-daily-title>Daily activity</strong><em data-home-daily-detail>Check today's verified activity.</em></span><span class="phase11-status-arrow" aria-hidden="true">›</span></button></section>
      <section class="phase11-home-section"><div class="section-head"><h2>Package</h2></div><article class="phase11-coming-card phase11-package-card"><span class="phase11-muted-icon" aria-hidden="true">✦</span><div><strong>Packages are coming soon</strong><p>Package purchasing remains disabled while Phase 6 is deferred.</p></div></article></section>
      <section class="phase11-home-section"><div class="section-head"><h2>Coming Soon</h2></div><article class="phase11-coming-card"><span class="phase11-muted-icon" aria-hidden="true">◇</span><div><strong>More ways to earn</strong><p>New features appear here only after they are officially enabled.</p></div></article></section>`;
    promoCard.insertAdjacentElement('afterend', section);
  }

  const wallet = document.querySelector('[data-page="wallet"]');
  const conversion = wallet && [...wallet.querySelectorAll('.info-card')].find(item => item.querySelector('strong')?.textContent.trim() === 'Conversion');
  if (conversion && !conversion.classList.contains('phase11-conversion-notice')) {
    conversion.classList.add('phase11-conversion-notice');
    conversion.setAttribute('role', 'note');
    const icon = document.createElement('span');
    icon.className = 'phase11-notice-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = 'ⓘ';
    conversion.prepend(icon);
  }

  const injectSquadExplanation = () => {
    const card = document.getElementById('squadCard');
    if (!card || card.querySelector('.phase11-squad-rules')) return;
    const section = document.createElement('section');
    section.className = 'squad-section phase11-squad-rules';
    section.innerHTML = `<div class="squad-daily-head"><div><span class="squad-eyebrow">HOW SQUAD WORKS</span><h3>Level & activation</h3></div></div><div class="phase11-rule-list"><article><span>◆</span><div><strong>Hierarchy</strong><p>Squad level follows the configured membership requirements.</p></div></article><article><span>50%</span><div><strong>Daily activity</strong><p>At least 50% of eligible members must complete verified activity.</p></div></article><article><span>D+1</span><div><strong>Next-day activation</strong><p>When the daily activation conditions pass, the modifier applies to the following day.</p></div></article></div><div class="phase11-squad-progress"><div><span>Current Level</span><strong data-phase11-current-level>—</strong></div><div><span>Current Members</span><strong data-phase11-current-members>—</strong></div><div><span>Required</span><strong data-phase11-required-members>—</strong></div><div><span>Progress</span><strong data-phase11-progress>—</strong></div></div><div class="phase11-anti-manipulation"><span aria-hidden="true">⚠</span><div><strong>Anti-manipulation</strong><p>Only verified activity qualifies. Artificial or duplicate activity does not.</p></div></div>`;
    const hero = card.querySelector('.squad-hero');
    if (hero) hero.insertAdjacentElement('afterend', section); else card.prepend(section);
  };

  const updateSquadPresentation = async () => {
    const card = document.getElementById('squadCard');
    const data = await api('/api/squad').catch(() => null);
    const squad = data?.squad;
    const homeSummary = document.querySelector('[data-home-squad-summary]');
    if (homeSummary) homeSummary.textContent = squad ? `Squad #${squad.id} • Level ${squad.tierLevel ?? '—'} • ${squad.memberCount} Members` : 'Squad #— • Level — • — Members';
    if (!card || card.dataset.phase11SquadSynced === '1') return;
    card.dataset.phase11SquadSynced = '1';
    const level = card.querySelector('[data-phase11-current-level]');
    const members = card.querySelector('[data-phase11-current-members]');
    const required = card.querySelector('[data-phase11-required-members]');
    const progress = card.querySelector('[data-phase11-progress]');
    if (level) level.textContent = squad?.tierLevel != null ? `Level ${squad.tierLevel}` : '—';
    if (members) members.textContent = squad ? String(squad.memberCount) : '—';
    if (required) required.textContent = squad?.requiredMembers != null ? String(squad.requiredMembers) : '—';
    if (progress) progress.textContent = squad?.progressPercent != null ? `${squad.progressPercent}%` : '—';
  };

  const updateGaming = () => {
    const spin = document.querySelector('[data-spin-balance]')?.textContent || '0';
    const axe = document.querySelector('[data-axe-balance]')?.textContent || '0';
    document.querySelector('[data-home-spin-balance]')?.replaceChildren(document.createTextNode(spin));
    document.querySelector('[data-home-axe-balance]')?.replaceChildren(document.createTextNode(axe));
    document.querySelector('[data-phase11-drawer-spins]')?.replaceChildren(document.createTextNode(spin));
    document.querySelector('[data-phase11-drawer-axes]')?.replaceChildren(document.createTextNode(axe));
  };

  const loadHomeStatus = async () => {
    try {
      const data = await api('/api/squad');
      const squad = data.squad;
      const summary = document.querySelector('[data-home-squad-summary]');
      if (summary) summary.textContent = squad ? `Squad #${squad.id} • Level ${squad.tierLevel ?? '—'} • ${squad.memberCount} Members` : 'Squad #— • Level — • — Members';
    } catch {}
    try {
      const data = await api('/api/daily-checkin/status');
      const title = document.querySelector('[data-home-daily-title]');
      const detail = document.querySelector('[data-home-daily-detail]');
      if (data.status === 'cooldown') { title.textContent = 'Daily check-in claimed'; detail.textContent = 'Your next check-in will unlock after the cooldown.'; }
      else if (data.status === 'pending') { title.textContent = 'Daily check-in verifying'; detail.textContent = 'Verification is still pending on the server.'; }
      else { title.textContent = 'Daily activity'; detail.textContent = 'Check today’s verified activity.'; }
    } catch {}
  };

  const drawer = document.createElement('aside');
  drawer.className = 'phase11-user-drawer';
  drawer.hidden = true;
  drawer.dir = 'rtl';
  drawer.innerHTML = `<div class="phase11-drawer-overlay" data-phase11-drawer-close></div><section class="phase11-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="phase11DrawerTitle"><header class="phase11-drawer-head"><div class="phase11-drawer-profile"><img id="phase11DrawerPhoto" class="phase11-drawer-photo" alt="" hidden><div id="phase11DrawerAvatar" class="phase11-drawer-avatar" aria-hidden="true">D</div><div><strong id="phase11DrawerTitle">DzMoney user</strong><span id="phase11DrawerUsername">Telegram account</span></div></div><button class="phase11-drawer-close" type="button" aria-label="Close profile" data-phase11-drawer-close>×</button></header><div class="phase11-drawer-balances"><article><small>COIN</small><strong id="phase11DrawerCoin">0</strong></article><article><small>DZX</small><strong id="phase11DrawerDzx">0</strong></article><article><small>DZP</small><strong id="phase11DrawerDzp">0</strong></article></div><section class="phase11-drawer-status"><small>SQUAD</small><strong id="phase11DrawerSquad">—</strong><span><b id="phase11DrawerMembers">—</b> members · Level <b id="phase11DrawerLevel">—</b></span></section><section class="phase11-drawer-status"><small>GAMING</small><div class="phase11-resource"><span>Spins</span><b data-phase11-drawer-spins>0</b></div><div class="phase11-resource"><span>Axes</span><b data-phase11-drawer-axes>0</b></div></section><section class="phase11-drawer-status"><small>DAILY ACTIVITY</small><strong id="phase11DrawerDaily">—</strong><span id="phase11DrawerDailyDetail">Loading daily status…</span></section></section>`;
  root.appendChild(drawer);

  const openDrawer = async event => {
    if (!event.target.closest('#profileBtn')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const user = await api('/api/me').then(data => data.user || {}).catch(() => ({}));
    const name = user.firstName || 'DzMoney user';
    document.getElementById('phase11DrawerTitle').textContent = name;
    document.getElementById('phase11DrawerUsername').textContent = user.username ? `@${user.username}` : 'Telegram account';
    document.getElementById('phase11DrawerAvatar').textContent = String(name).charAt(0).toUpperCase() || 'D';
    document.getElementById('phase11DrawerCoin').textContent = document.getElementById('coinBalance')?.textContent || '0';
    document.getElementById('phase11DrawerDzx').textContent = document.getElementById('dzxBalance')?.textContent || '0';
    document.getElementById('phase11DrawerDzp').textContent = document.getElementById('dzpBalance')?.textContent || '0';
    const photo = document.getElementById('phase11DrawerPhoto');
    if (user.photoUrl) { photo.src = user.photoUrl; photo.hidden = false; document.getElementById('phase11DrawerAvatar').hidden = true; }
    else { photo.hidden = true; document.getElementById('phase11DrawerAvatar').hidden = false; }
    drawer.hidden = false;
    requestAnimationFrame(() => drawer.classList.add('open'));
    try {
      const [squad, daily] = await Promise.all([api('/api/squad'), api('/api/daily-checkin/status')]);
      document.getElementById('phase11DrawerSquad').textContent = squad.squad ? (squad.squad.membershipStatus || 'Active') : 'No Squad';
      document.getElementById('phase11DrawerMembers').textContent = squad.squad ? String(squad.squad.memberCount) : '0';
      document.getElementById('phase11DrawerLevel').textContent = squad.squad?.tierLevel != null ? String(squad.squad.tierLevel) : '—';
      document.getElementById('phase11DrawerDaily').textContent = daily.status === 'cooldown' ? 'Cooldown' : daily.status === 'pending' ? 'Verifying' : 'Ready';
      document.getElementById('phase11DrawerDailyDetail').textContent = daily.status === 'cooldown' ? 'Next check-in is locked by the server cooldown.' : 'Daily check-in is available through the verified flow.';
    } catch {}
    updateGaming();
  };
  const closeDrawer = event => { if (event && !event.target.closest('[data-phase11-drawer-close]')) return; drawer.classList.remove('open'); setTimeout(() => { drawer.hidden = true; }, 300); };

  document.addEventListener('click', openDrawer, true);
  drawer.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && drawer.classList.contains('open')) closeDrawer({ target: drawer.querySelector('.phase11-drawer-overlay') }); });

  loadHomeStatus();
  updateGaming();
  injectSquadExplanation();
  updateSquadPresentation();

  const observer = new MutationObserver(() => {
    observer.disconnect();
    try {
      injectSquadExplanation();
      updateGaming();
      document.querySelectorAll('.task-open-action').forEach(button => {
        if (button.textContent.trim() === 'Open') button.textContent = 'Execute';
      });
    } finally {
      observer.observe(root, { childList: true, subtree: true });
    }
  });
  observer.observe(root, { childList: true, subtree: true });
})();