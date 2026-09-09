(() => {
  const initData = window.Telegram?.WebApp?.initData;
  if (!initData) return;

  const headers = { 'X-Telegram-Init-Data': initData };
  const checkAdminAccess = async () => {
    const response = await fetch('/api/admin/dashboard/access', { headers });
    if (!response.ok) return false;
    const data = await response.json().catch(() => null);
    return data?.ok === true && data?.admin === true;
  };

  const addAdminButton = () => {
    const actions = document.querySelector(
      '.phase11-drawer-panel .phase11-drawer-status:last-of-type',
    );
    const panel = document.querySelector('.phase11-drawer-panel');
    if (!panel || panel.querySelector('[data-admin-entry]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'profile-action';
    button.dataset.adminEntry = 'true';
    button.textContent = '⚙ Admin Panel';
    button.addEventListener('click', () => {
      window.location.href = '/admin.html';
    });
    (actions || panel).appendChild(button);
  };

  checkAdminAccess()
    .then((isAdmin) => {
      if (!isAdmin) return;
      addAdminButton();
      const observer = new MutationObserver(addAdminButton);
      const panel = document.querySelector('.app-shell');
      if (panel) observer.observe(panel, { childList: true, subtree: true });
    })
    .catch(() => {});
})();
