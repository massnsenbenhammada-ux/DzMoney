const referralTelegram = window.Telegram?.WebApp;

async function copyCanonicalReferralLink() {
  const initData = referralTelegram?.initData;
  if (!initData) throw new Error('Open DzMoney inside Telegram to load your referral link.');
  const response = await fetch('/api/me', { headers: { 'X-Telegram-Init-Data': initData } });
  const data = await response.json();
  if (!response.ok || !data.user?.referralLink) throw new Error(data.error || 'Referral link is unavailable.');
  await navigator.clipboard.writeText(data.user.referralLink);
}

document.addEventListener('click', event => {
  if (!event.target.closest('#copyReferral')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  copyCanonicalReferralLink()
    .then(() => {
      const toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = 'Referral link copied.';
        toast.classList.add('show');
        clearTimeout(toast.timer);
        toast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
      }
    })
    .catch(error => {
      const toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = error.message;
        toast.classList.add('show');
        clearTimeout(toast.timer);
        toast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
      }
    });
}, true);
