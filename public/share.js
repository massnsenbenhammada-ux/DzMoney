const shareTelegram = window.Telegram?.WebApp;
const SHARE_VERIFICATION_TIMEOUT_MS = 30000;
const SHARE_AD_PRELOAD_TIMEOUT_SECONDS = 12;

function shareToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}

async function shareApi(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (shareTelegram?.initData) headers['X-Telegram-Init-Data'] = shareTelegram.initData;
  const response = await fetch(path, { ...options, headers });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) throw Object.assign(new Error(data.error || `Request failed: ${response.status}`), { status: response.status, data });
  return data;
}

async function showShareVerificationAd(ymid) {
  if (!ymid) throw new Error('Verification advertisement id is missing');
  const adapter = window.DzMoneyMonetag;
  if (!adapter?.ready || typeof adapter.handler !== 'function') throw new Error('Verification advertisement provider is unavailable');
  await adapter.ready;
  await adapter.handler({ type: 'preload', ymid, requestVar: 'verification', timeout: SHARE_AD_PRELOAD_TIMEOUT_SECONDS });
  await adapter.handler({ ymid, requestVar: 'verification' });
}

async function loadReferralLink() {
  const data = await shareApi('/api/me');
  const referralLink = data.user?.referralLink;
  if (!referralLink) throw new Error('Referral link is unavailable.');
  return referralLink;
}

async function waitForShareVerification(attemptId) {
  const deadline = Date.now() + SHARE_VERIFICATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await shareApi(`/api/tasks/attempt/${encodeURIComponent(attemptId)}`);
    if (status.status === 'verified' || status.status === 'rejected') return status;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return shareApi(`/api/tasks/attempt/${encodeURIComponent(attemptId)}`);
}

function openTelegramShare(url) {
  if (typeof shareTelegram?.openTelegramLink === 'function') {
    shareTelegram.openTelegramLink(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function startShareWithFriends() {
  const button = document.getElementById('shareReferral');
  if (!button || button.disabled) return;
  button.disabled = true;
  button.textContent = 'Preparing…';
  try {
    const referralLink = await loadReferralLink();
    const result = await shareApi('/api/daily-tasks/execute', {
      method: 'POST',
      body: JSON.stringify({
        systemKey: 'share_with_friends',
        idempotencyKey: `share-with-friends:${crypto.randomUUID()}`
      })
    });
    await showShareVerificationAd(result.verificationAdId);
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}`;
    openTelegramShare(shareUrl);
    const click = await shareApi('/api/tasks/click', {
      method: 'POST',
      body: JSON.stringify({ attemptId: result.attemptId })
    });
    if (click.status === 'verified') {
      shareToast('Share action recorded and reward credited.');
      window.location.reload();
      return;
    }
    shareToast('Share action recorded. Waiting for server verification…');
    const status = await waitForShareVerification(result.attemptId);
    if (status.status === 'verified') {
      shareToast('Share action verified and reward credited.');
      window.location.reload();
    } else if (status.status === 'rejected') {
      shareToast('Share action verification was rejected.');
    } else {
      shareToast('Share verification is still pending.');
    }
  } catch (error) {
    if (error.status === 429 && error.data?.nextEligibleAt) {
      shareToast('Share with Friends is already completed for today.');
    } else {
      shareToast(error.message || 'Unable to start Share with Friends.');
    }
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = 'Share with Friends';
    }
  }
}

document.addEventListener('click', event => {
  if (!event.target.closest('#shareReferral')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  startShareWithFriends();
}, true);
