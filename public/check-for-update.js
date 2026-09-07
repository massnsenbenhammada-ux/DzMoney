(() => {
  const CHANNEL_URL = 'https://t.me/DzMoneyChecking';
  const CHANNEL_TASK_KEY = 'check_for_update';
  let busy = false;
  let pendingAttemptId = null;

  function apiHeaders() {
    return { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': window.Telegram?.WebApp?.initData || '' };
  }

  async function request(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { ...apiHeaders(), ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body;
  }

  function openChannel() {
    if (typeof window.Telegram?.WebApp?.openTelegramLink === 'function') window.Telegram.WebApp.openTelegramLink(CHANNEL_URL);
    else window.open(CHANNEL_URL, '_blank', 'noopener,noreferrer');
  }

  function buttonForTask() {
    return document.querySelector('[data-system-key="check_for_update"]');
  }

  function setButton(button, text, disabled = false) {
    if (!button) return;
    button.textContent = text;
    button.disabled = disabled;
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
    const result = await request('/api/daily-tasks/verify', { method: 'POST', body: JSON.stringify({ attemptId, idempotencyKey: `daily-system:${attemptId}` }) });
    if (result.status === 'verified') {
      pendingAttemptId = null;
      setButton(button, 'Done', true);
      notify('Check for Update verified. Reward added.');
      setTimeout(() => window.location.reload(), 700);
      return true;
    }
    if (result.status === 'rejected') {
      pendingAttemptId = null;
      setButton(button, 'Check for Update', false);
      notify('Membership could not be verified. Join the channel and try again.');
      return false;
    }
    return false;
  }

  async function start(button) {
    if (busy) return;
    busy = true;
    setButton(button, 'Opening…', true);
    try {
      if (!pendingAttemptId) {
        const result = await request('/api/daily-tasks/execute', { method: 'POST', body: JSON.stringify({ systemKey: CHANNEL_TASK_KEY, idempotencyKey: `daily:${CHANNEL_TASK_KEY}:${crypto.randomUUID()}`, metadata: { source: 'tasks_ui' } }) });
        pendingAttemptId = result.attemptId;
        if (result.actionUrl !== CHANNEL_URL || result.verificationAdId !== null) throw new Error('Check for Update channel contract is invalid');
      }
      openChannel();
      setButton(button, 'Verify', false);
      notify('Join @DzMoneyChecking, return here, then tap Verify.');
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
    if (pendingAttemptId) verify(pendingAttemptId, button).catch(error => notify(error.message || 'Unable to verify membership.'));
    else start(button);
  }

  document.addEventListener('click', intercept, true);
})();
