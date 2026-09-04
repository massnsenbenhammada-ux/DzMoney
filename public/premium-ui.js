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