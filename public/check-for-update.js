(() => {
  const CHANNEL_TASK_KEY = 'check_for_update';
  const RETURN_VERIFY_COOLDOWN_MS = 10000;
  let busy = false;
  let pendingAttemptId = null;
  let pendingActionUrl = null;
  let lastReturnVerifyAt = 0;

  function apiHeaders() {
    return { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': window.Telegram?.WebApp?.initData || '' };
  }

  async function request(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { ...apiHeaders(), ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body;
  }

  function openChannel(url) {
    if (typeof window.Telegram?.WebApp?.openTelegramLink === 'function') window.Telegram.WebApp.openTelegramLink(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  }

  function setButton(button, text, disabled = false) {
    if (!button) return;
    button.textContent = text;
    button.disabled = disabled;
  }

  function currentButton() {
    return document.querySelector('[data-system-key="check_for_update"]');
  }

  function notify(message) {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
  }

  async function verify(attemptId, button) {
    if (busy) return false;
    busy = true;
    try {
      const result = await request('/api/daily-tasks/verify', { method: 'POST', body: JSON.stringify({ attemptId, idempotencyKey: `daily-system:${attemptId}` }) });
      if (result.status === 'verified') {
        pendingAttemptId = null;
        pendingActionUrl = null;
        setButton(button, 'Done', true);
        notify('Check for Update verified. Reward added.');
        setTimeout(() => window.location.reload(), 700);
        return true;
      }
      if (result.status === 'rejected') {
        pendingAttemptId = null;
        pendingActionUrl = null;
        setButton(button, 'Check for Update', false);
        notify('Membership could not be verified. Join the channel and try again.');
      }
      return false;
    } catch (error) {
      setButton(button, 'Verify', false);
      notify(error.message || 'Unable to verify membership.');
      return false;
    } finally {
      busy = false;
    }
  }

  async function verifyOnReturn() {
    if (!pendingAttemptId || document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - lastReturnVerifyAt < RETURN_VERIFY_COOLDOWN_MS) return;
    lastReturnVerifyAt = now;
    await verify(pendingAttemptId, currentButton());
  }

  async function start(button) {
    if (busy) return;
    busy = true;
    setButton(button, 'Opening…', true);
    try {
      const result = await request('/api/daily-tasks/execute', { method: 'POST', body: JSON.stringify({ systemKey: CHANNEL_TASK_KEY, idempotencyKey: `daily:${CHANNEL_TASK_KEY}:${crypto.randomUUID()}`, metadata: { source: 'tasks_ui' } }) });
      if (typeof result.actionUrl !== 'string' || result.actionUrl === '' || result.verificationAdId !== null) throw new Error('Check for Update channel contract is invalid');
      pendingAttemptId = result.attemptId;
      pendingActionUrl = result.actionUrl;
      openChannel(pendingActionUrl);
      setButton(button, 'Verifying…', false);
      notify('Return to DzMoney after joining; membership will be verified automatically.');
    } catch (error) {
      notify(error.message || 'Unable to start Check for Update.');
      setButton(button, 'Check for Update', false);
    } finally {
      busy = false;
    }
  }

  function intercept(event) {
    const button = event.target.closest?.('[data-system-key="check_for_update"]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (pendingAttemptId) verify(pendingAttemptId, button);
    else start(button);
  }

  document.addEventListener('click', intercept, true);
  document.addEventListener('visibilitychange', verifyOnReturn);
  window.addEventListener('focus', verifyOnReturn);
})();
