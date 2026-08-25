const creatorTaskState = {
  contract: null,
  mode: 'server_verified',
  idempotencyKey: null,
  createdTaskId: null
};

function creatorEl(id) { return document.getElementById(id); }

function creatorToast(message) {
  const toast = creatorEl('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(creatorToast.timer);
  creatorToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}

async function creatorApi(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const tg = window.Telegram?.WebApp;
  if (tg?.initData) headers['X-Telegram-Init-Data'] = tg.initData;
  const response = await fetch(path, { ...options, headers });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text || 'Request failed' }; }
  if (!response.ok) throw Object.assign(new Error(data.error || `Request failed: ${response.status}`), { status: response.status, data });
  return data;
}

function creatorGetIdempotencyKey() {
  if (!creatorTaskState.idempotencyKey) creatorTaskState.idempotencyKey = `creator-task:${crypto.randomUUID()}`;
  return creatorTaskState.idempotencyKey;
}

function renderCreatorContract(contract) {
  creatorTaskState.contract = contract;
  const container = creatorEl('creatorContract');
  const modes = contract.availableCompletionModes || [];
  const descriptions = new Map((contract.completionServices || []).map(item => [item.mode, item.description]));
  const selected = modes.includes(creatorTaskState.mode) ? creatorTaskState.mode : modes[0];
  creatorTaskState.mode = selected;
  container.innerHTML = `
    <div class="creator-mode-grid">
      ${modes.map(mode => `<button type="button" class="creator-mode ${mode === selected ? 'active' : ''}" data-creator-mode="${mode}"><strong>${mode === 'open_link' ? 'Open Link' : 'Server Verified'}</strong><span>${descriptions.get(mode) || ''}</span></button>`).join('')}
    </div>
    <div class="creator-contract-detail">
      <span class="eyebrow">VERIFICATION CONTRACT</span>
      <p>${creatorContractDescription(contract, selected)}</p>
    </div>`;
  renderCreatorModeFields();
}

function creatorContractDescription(contract, mode) {
  if (mode === 'open_link') return 'The configured link opening is the completion outcome. This is Click Proof and does not claim a deeper external action.';
  const verified = contract.serverVerified || {};
  const input = verified.requiredUserInput || {};
  if (input.status === 'provider_contract_required') return `Source: ${verified.source || 'provider'}. Evidence: ${verified.evidence || 'trusted evidence'}. Method: ${verified.method || 'provider validation'}. Required creator input: no provider-specific fields are currently defined; a real provider contract is required before additional fields can be shown.`;
  return `Source: ${verified.source || 'provider'}. Evidence: ${verified.evidence || 'trusted evidence'}. Method: ${verified.method || 'provider validation'}.`;
}

function renderCreatorModeFields() {
  const container = creatorEl('creatorModeFields');
  if (creatorTaskState.mode === 'open_link') {
    container.innerHTML = '<label class="form-label">Destination URL<input id="creatorCompletionUrl" type="url" required placeholder="https://example.com"></label><div class="creator-note">Open Link uses Click Proof. Do not describe this as proof of a deeper external action.</div>';
    return;
  }
  container.innerHTML = '<div class="creator-note"><strong>Server Verified</strong><span>The required provider-specific input is intentionally not invented. This contract currently declares that a provider contract is required and defines no fields yet.</span></div>';
}

async function loadCreatorContract() {
  const taskType = creatorEl('creatorTaskType').value;
  creatorEl('creatorContract').innerHTML = '<article class="info-card"><strong>Loading verification contract…</strong></article>';
  try {
    const contract = await creatorApi(`/api/creator/tasks/contracts/${encodeURIComponent(taskType)}`);
    renderCreatorContract(contract);
  } catch (error) {
    creatorEl('creatorContract').innerHTML = `<article class="info-card"><strong>Unable to load contract</strong><p>${String(error.message || 'Please try again.')}</p></article>`;
  }
}

function creatorConfig() {
  const config = { completion: { mode: creatorTaskState.mode } };
  if (creatorTaskState.mode === 'open_link') config.completion.url = creatorEl('creatorCompletionUrl')?.value?.trim() || '';
  return config;
}

async function createCreatorTask(event) {
  event.preventDefault();
  if (creatorTaskState.createdTaskId) return;
  const button = creatorEl('creatorSubmit');
  button.disabled = true;
  try {
    const verificationAdSecondsValue = creatorEl('creatorVerificationAdSeconds')?.value?.trim() || '';
    const result = await creatorApi('/api/creator/tasks', {
      method: 'POST',
      body: JSON.stringify({
        taskType: creatorEl('creatorTaskType').value,
        title: creatorEl('creatorTitle').value.trim(),
        description: creatorEl('creatorDescription').value.trim() || null,
        target: Number(creatorEl('creatorTarget').value),
        rewardCoin: Number(creatorEl('creatorRewardCoin').value),
        rewardDzx: Number(creatorEl('creatorRewardDzx').value),
        rewardDzp: Number(creatorEl('creatorRewardDzp').value),
        verificationAdSeconds: verificationAdSecondsValue ? Number(verificationAdSecondsValue) : null,
        config: creatorConfig(),
        idempotencyKey: creatorGetIdempotencyKey()
      })
    });
    creatorTaskState.createdTaskId = result.task?.id || null;
    creatorToast('Task created successfully.');
    const reviewButton = creatorEl('creatorReviewSubmit');
    if (reviewButton) reviewButton.disabled = !creatorTaskState.createdTaskId;
    button.textContent = 'Task created';
  } catch (error) {
    creatorToast(error.message || 'Unable to create task.');
    button.disabled = false;
  }
}

async function submitCreatorTaskForReview(event) {
  event.preventDefault();
  const taskId = creatorTaskState.createdTaskId;
  if (!taskId) return;
  const button = creatorEl('creatorReviewSubmit');
  button.disabled = true;
  try {
    const result = await creatorApi(`/api/creator/tasks/${encodeURIComponent(taskId)}/submit`, { method: 'POST', body: '{}' });
    creatorToast(result.task?.status === 'pending_review' ? 'Task submitted for review.' : 'Task submitted.');
  } catch (error) {
    creatorToast(error.message || 'Unable to submit task for review.');
    button.disabled = false;
  }
}

document.addEventListener('click', event => {
  const mode = event.target.closest('[data-creator-mode]');
  if (!mode) return;
  creatorTaskState.mode = mode.dataset.creatorMode;
  document.querySelectorAll('[data-creator-mode]').forEach(item => item.classList.toggle('active', item === mode));
  renderCreatorModeFields();
});

document.addEventListener('change', event => {
  if (event.target.id === 'creatorTaskType') loadCreatorContract();
});

document.addEventListener('submit', event => {
  if (event.target.id === 'creatorTaskForm') createCreatorTask(event);
});

document.addEventListener('click', event => {
  if (event.target.closest('#creatorReviewSubmit')) submitCreatorTaskForReview(event);
  const nav = event.target.closest('[data-go="creator"]');
  if (nav) setTimeout(loadCreatorContract, 0);
});

window.addEventListener('load', () => {
  if (creatorEl('creatorTaskForm')) loadCreatorContract();
});
