(() => {
  const root = document.querySelector('.app-shell');
  if (!root) return;

  const api = async path => {
    const headers = {};
    const initData = window.Telegram?.WebApp?.initData;
    if (initData) headers['X-Telegram-Init-Data'] = initData;
    const response = await fetch(path, { headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const promo = document.createElement('article');
  promo.className = 'premium-promo';
  promo.innerHTML = '<span class="premium-promo-icon" aria-hidden="true">✦</span><div><strong>Earn smarter with DzMoney</strong><span>Tasks, Gaming and Squad activity stay verified by the server.</span></div>';
  const quick = document.querySelector('.quick-grid');
  if (quick) quick.insertAdjacentElement('afterend', promo);

  function addHomeOverview() {
    const home = document.querySelector('[data-page="home"]');
    const promoCard = document.getElementById('promoCodeCard');
    if (!home || !promoCard || home.querySelector('.phase11-home-overview')) return;
    const section = document.createElement('section');
    section.className = 'phase11-home-overview';
    section.innerHTML = `
      <div class="phase11-status-grid">
        <button class="phase11-status-card" type="button" data-go="squad">
          <span class="phase11-status-icon" aria-hidden="true">◆</span>
          <span class="phase11-status-copy"><small>SQUAD</small><strong>My Squad</strong><em><b data-home-squad-members>—</b> members · Level <b data-home-squad-level>—</b></em></span>
          <span class="phase11-status-arrow" aria-hidden="true">›</span>
        </button>
        <button class="phase11-status-card" type="button" data-go="gaming">
          <span class="phase11-status-icon" aria-hidden="true">🎮</span>
          <span class="phase11-status-copy"><small>GAMING</small><strong>Ready to play</strong><em><b data-home-spin-balance>0</b> Spins · <b data-home-axe-balance>0</b> Axes</em></span>
          <span class="phase11-status-arrow" aria-hidden="true">›</span>
        </button>
      </div>
      <section class="phase11-home-section">
        <div class="section-head"><h2>Daily Activity</h2></div>
        <button class="phase11-daily-card" type="button" data-go="tasks">
          <span class="phase11-status-icon" aria-hidden="true">◷</span>
          <span><strong data-home-daily-title>Daily activity</strong><em data-home-daily-detail>Check today's verified activity.</em></span>
          <span class="phase11-status-arrow" aria-hidden="true">›</span>
        </button>
      </section>
      <section class="phase11-home-section">
        <div class="section-head"><h2>Package</h2></div>
        <article class="phase11-coming-card phase11-package-card">
          <span class="phase11-muted-icon" aria-hidden="true">✦</span>
          <div><strong>Packages are coming soon</strong><p>Package purchasing remains disabled while Phase 6 is deferred.</p></div>
        </article>
      </section>
      <section class="phase11-home-section">
        <div class="section-head"><h2>Coming Soon</h2></div>
        <article class="phase11-coming-card">
          <span class="phase11-muted-icon" aria-hidden="true">◇</span>
          <div><strong>More ways to earn</strong><p>New features appear here only after they are officially enabled.</p></div>
        </article>
      </section>`;
    promoCard.insertAdjacentElement('afterend', section);
  }

  function decorateConversionNotice() {
    const wallet = document.querySelector('[data-page="wallet"]');
    if (!wallet || wallet.querySelector('.phase11-conversion-notice')) return;
    const card = [...wallet.querySelectorAll('.info-card')].find(item => item.querySelector('strong')?.textContent.trim() === 'Conversion');
    if (!card) return;
    card.classList.add('phase11-conversion-notice');
    card.setAttribute('role', 'note');
    const icon = document.createElement('span');
    icon.className = 'phase11-notice-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = 'ⓘ';
    card.prepend(icon);
  }

  function injectSquadExplanation() {
    const card = document.getElementById('squadCard');
    if (!card || card.querySelector('.phase11-squad-rules')) return;
    const section = document.createElement('section');
    section.className = 'squad-section phase11-squad-rules';
    section.innerHTML = `
      <div class="squad-daily-head"><div><span class="squad-eyebrow">HOW SQUAD WORKS</span><h3>Level & activation</h3></div></div>
      <div class="phase11-rule-list">
        <article><span>◆</span><div><strong>Hierarchy</strong><p>Squad level follows the configured membership requirements.</p></div></article>
        <article><span>50%</span><div><strong>Daily activity</strong><p>At least 50% of eligible members must complete verified activity.</p></div></article>
        <article><span>D+1</span><div><strong>Next-day activation</strong><p>When the daily activation conditions pass, the modifier applies to the following day.</p></div></article>
      </div>
      <div class="phase11-anti-manipulation"><span aria-hidden="true">⚠</span><div><strong>Anti-manipulation</strong><p>Only verified activity qualifies. Artificial or duplicate activity does not.</p></div></div>`;
    const hero = card.querySelector('.squad-hero');
    if (hero) hero.insertAdjacentElement('afterend', section);
    else card.prepend(section);
  }

  function updateHomeGaming() {
    const spin = document.querySelector('[data-spin-balance]');
    const axe = document.querySelector('[data-axe-balance]');
    const spinTarget = document.querySelector('[data-home-spin-balance]');
    const axeTarget = document.querySelector('[data-home-axe-balance]');
    if (spinTarget) spinTarget.textContent = spin?.textContent || '0';
    if (axeTarget) axeTarget.textContent = axe?.textContent || '0';
  }

  async function loadHomeStatus() {
    const members = document.querySelector('[data-home-squad-members]');
    const level = document.querySelector('[data-home-squad-level]');
    try {
      const data = await api('/api/squad');
      members.textContent = data.squad ? String(data.squad.memberCount) : '0';
      level.textContent = '—';
    } catch {
      if (members) members.textContent = '—';
    }
    try {
      const data = await api('/api/daily-checkin/status');
      const title = document.querySelector('[data-home-daily-title]');
      const detail = document.querySelector('[data-home-daily-detail]');
      if (data.status === 'cooldown') {
        title.textContent = 'Daily check-in claimed';
        detail.textContent = 'Your next check-in will unlock after the cooldown.';
      } else if (data.status === 'pending') {
        title.textContent = 'Daily check-in ready';
        detail.textContent = 'Complete the verification flow from Daily Activity.';
      } else {
        title.textContent = 'Daily activity';
        detail.textContent = 'Check today’s verified activity.';
      }
    } catch {}
  }

  const drawer = document.createElement('aside');
  drawer.className = 'phase11-user-drawer';
  drawer.hidden = true;
  drawer.dir = 'rtl';
  drawer.innerHTML = `
    <div class="phase11-drawer-overlay" data-phase11-drawer-close></div>
    <section class="phase11-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="phase11DrawerTitle">
      <header class="phase11-drawer-head">
        <div class="phase11-drawer-profile">
          <img id="phase11DrawerPhoto" class="phase11-drawer-photo" alt="" hidden>
          <div id="phase11DrawerAvatar" class="phase11-drawer-avatar" aria-hidden="true">D</div>
          <div><strong id="phase11DrawerTitle">DzMoney user</strong><span id="phase11DrawerUsername">Telegram account</span></div>
        </div>
        <button class="phase11-drawer-close" type="button" aria-label="Close profile" data-phase11-drawer-close>×</button>
      </header>
      <div class="phase11-drawer-balances">
        <article><small>COIN</small><strong id="phase11DrawerCoin">0</strong></article>
        <article><small>DZX</small><strong id="phase11DrawerDzx">0</strong></article>
        <article><small>DZP</small><strong id="phase11DrawerDzp">0</strong></article>
      </div>
      <section class="phase11-drawer-status"><small>SQUAD</small><strong id="phase11DrawerSquad">—</strong><span><b id="phase11DrawerMembers">—</b> members · Level <b>—</b></span></section>
      <section class="phase11-drawer-status"><small>GAMING</small><div class="phase11-resource"><span>Spins</span><b data-phase11-drawer-spins>0</b></div><div class="phase11-resource"><span>Axes</span><b data-phase11-drawer-axes>0</b></div></section>
      <section class="phase11-drawer-status"><small>DAILY ACTIVITY</small><strong id="phase11DrawerDaily">—</strong><span id="phase11DrawerDailyDetail">Loading daily status…</span></section>
    </section>`;
  root.appendChild(drawer);

  const profileSheet = root.querySelector('.profile-sheet');
  const closeOldSheet = () => profileSheet?.classList.remove('open');
  const openDrawer = async event => {
    event?.preventDefault();
    event?.stopPropagation();
    closeOldSheet();
    const user = window.__dzMoneyPremiumUser;
    const name = user?.firstName || document.querySelector('.welcome-row .eyebrow')?.textContent?.replace(/^WELCOME,\s*/i, '') || 'DzMoney user';
    const username = user?.username ? `@${user.username}` : 'Telegram account';
    document.getElementById('phase11DrawerTitle').textContent = name;
    document.getElementById('phase11DrawerUsername').textContent = username;
    document.getElementById('phase11DrawerAvatar').textContent = String(name).charAt(0).toUpperCase() || 'D';
    document.getElementById('phase11DrawerCoin').textContent = document.getElementById('coinBalance')?.textContent || '0';
    document.getElementById('phase11DrawerDzx').textContent = document.getElementById('dzxBalance')?.textContent || '0';
    document.getElementById('phase11DrawerDzp').textContent = document.getElementById('dzpBalance')?.textContent || '0';
    const photo = document.getElementById('phase11DrawerPhoto');
    if (user?.photoUrl) { photo.src = user.photoUrl; photo.hidden = false; document.getElementById('phase11DrawerAvatar').hidden = true; }
    else { photo.hidden = true; document.getElementById('phase11DrawerAvatar').hidden = false; }
    drawer.hidden = false;
    requestAnimationFrame(() => drawer.classList.add('open'));
    try {
      const [squad, daily] = await Promise.all([api('/api/squad'), api('/api/daily-checkin/status')]);
      document.getElementById('phase11DrawerSquad').textContent = squad.squad ? (squad.squad.membershipStatus || 'Active') : 'No Squad';
      document.getElementById('phase11DrawerMembers').textContent = squad.squad ? String(squad.squad.memberCount) : '0';
      document.getElementById('phase11DrawerDaily').textContent = daily.status === 'cooldown' ? 'Cooldown' : 'Ready';
      document.getElementById('phase11DrawerDailyDetail').textContent = daily.status === 'cooldown' ? 'Next check-in is locked by the server cooldown.' : 'Daily check-in is available through the verified flow.';
    } catch {}
    updateDrawerGaming();
  };
  const closeDrawer = () => { drawer.classList.remove('open'); setTimeout(() => { drawer.hidden = true; }, 300); };
  const updateDrawerGaming = () => {
    document.querySelector('[data-phase11-drawer-spins]').textContent = document.querySelector('[data-spin-balance]')?.textContent || '0';
    document.querySelector('[data-phase11-drawer-axes]').textContent = document.querySelector('[data-axe-balance]')?.textContent || '0';
  };

  const profileButton = document.getElementById('profileBtn');
  profileButton?.addEventListener('click', openDrawer);
  drawer.addEventListener('click', event => {
    if (event.target.closest('[data-phase11-drawer-close]')) closeDrawer();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(); });

  const syncUser = () => {
    if (window.__dzMoneyPremiumUser) return;
    const name = document.querySelector('.welcome-row .eyebrow')?.textContent || '';
    window.__dzMoneyPremiumUser = { firstName: name.replace(/^WELCOME,\s*/i, '').trim() };
  };
  api('/api/me').then(data => { window.__dzMoneyPremiumUser = data.user || {}; }).catch(syncUser);

  addHomeOverview();
  decorateConversionNotice();
  loadHomeStatus();
  updateHomeGaming();
  setInterval(() => { updateHomeGaming(); updateDrawerGaming(); }, 800);

  const observer = new MutationObserver(() => {
    decorateConversionNotice();
    injectSquadExplanation();
    updateHomeGaming();
    document.querySelectorAll('.task-open-action').forEach(button => {
      if (button.textContent.trim() === 'Open') button.textContent = 'Execute';
    });
  });
  observer.observe(root, { childList: true, subtree: true });
  injectSquadExplanation();
})();