const creatorTaskState = {
  contract: null,
  mode: 'server_verified',
  providerId: null,
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
  const pricing = contract.campaignPricing || {};
  container.innerHTML = `
    <div class="creator-mode-grid">
      ${modes.map(mode => `<button type="button" class="creator-mode ${mode === selected ? 'active' : ''}" data-creator-mode="${mode}"><strong>${mode === 'open_link' ? 'Open Link' : 'Server Verified'}</strong><span>${descriptions.get(mode) || ''}</span></button>`).join('')}
    </div>
    <div class="creator-contract-detail">
      <span class="eyebrow">CAMPAIGN PRICING</span>
      <p>${Number.isFinite(pricing.cpmDZX) ? `CPM: ${pricing.cpmDZX.toLocaleString()} DZX. Minimum target: ${pricing.minTarget}. Maximum target: ∞.` : 'Campaign pricing is controlled by Admin.'}</p>
      <div id="creatorCampaignCost" class="creator-cost"></div>
    </div>
    <div class="creator-contract-detail">
      <span class="eyebrow">VERIFICATION CONTRACT</span>
      <p>${creatorContractDescription(contract, selected)}</p>
    </div>`;
  renderCreatorModeFields();
  updateCreatorCampaignCost();
}

function creatorContractDescription(contract, mode) {
  if (mode === 'open_link') return 'The configured link opening is the completion outcome. This is Click Proof and does not claim a deeper external action.';
  const providers = contract.providerContracts || [];
  if (!providers.length) return `No operational Server Verified provider is enabled for ${contract.taskType || 'this task type'} yet.`;
  return 'Choose an enabled verification provider. The required fields are supplied by that provider contract and are used by the server verifier.';
}

function renderProviderFields() {
  const providers = creatorTaskState.contract?.providerContracts || [];
  const provider = providers.find(item => item.id === creatorTaskState.providerId) || providers[0];
  creatorTaskState.providerId = provider?.id || null;
  if (!provider) return '<div class="creator-note"><strong>Server Verified unavailable</strong><span>No provider contract is enabled for this task type yet.</span></div>';
  const fields = provider.fields || [];
  const fieldHtml = fields.map(field => {
    if (field.type === 'telegram_channel') return `<label class="form-label">${field.label}<input id="creatorProviderField_${field.key}" type="text" required placeholder="@channel_username"></label>`;
    return `<label class="form-label">${field.label}<input id="creatorProviderField_${field.key}" type="text" ${field.required ? 'required' : ''}></label>`;
  }).join('');
  return `<label class="form-label">Server Verified type<select id="creatorProviderSelect">${providers.map(item => `<option value="${item.id}" ${item.id === provider.id ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label>${fieldHtml}<div class="creator-note"><strong>${provider.label}</strong><span>DzMoney will use these requirements directly during server-side verification. Provider credentials remain server-side.</span></div>`;
}

function renderCreatorModeFields() {
  const container = creatorEl('creatorModeFields');
  const url = '<label class="form-label">Destination URL<input id="creatorCompletionUrl" type="url" required placeholder="https://example.com"></label>';
  if (creatorTaskState.mode === 'open_link') {
    container.innerHTML = `${url}<div class="creator-note">Open Link uses Click Proof. Do not describe this as proof of a deeper external action.</div>`;
    return;
  }
  container.innerHTML = `${url}${renderProviderFields()}`;
  creatorEl('creatorProviderSelect')?.addEventListener('change', () => {
    creatorTaskState.providerId = creatorEl('creatorProviderSelect').value;
    renderCreatorModeFields();
  });
}

function updateCreatorCampaignCost() {
  const target = Number(creatorEl('creatorTarget')?.value || 0);
  const pricing = creatorTaskState.contract?.campaignPricing || {};
  const cost = creatorEl('creatorCampaignCost');
  if (!cost) return;
  if (!Number.isFinite(target) || target < (pricing.minTarget || 1000) || !Number.isFinite(pricing.priceDZXPerExecution)) {
    cost.textContent = `Minimum target: ${pricing.minTarget || 1000}`;
    return;
  }
  cost.textContent = `Campaign cost: ${(target * pricing.priceDZXPerExecution).toLocaleString()} DZX`;
}

async function loadCreatorContract() {
  const taskType = creatorEl('creatorTaskType').value;
  creatorEl('creatorContract').innerHTML = '<article class="info-card"><strong>Loading verification contract…</strong></article>';
  try {
    const contract = await creatorApi(`/api/creator/tasks/contracts/${encodeURIComponent(taskType)}`);
    creatorTaskState.providerId = null;
    renderCreatorContract(contract);
  } catch (error) {
    creatorEl('creatorContract').innerHTML = `<article class="info-card"><strong>Unable to load contract</strong><p>${String(error.message || 'Please try again.')}</p></article>`;
  }
}

function creatorConfig() {
  const config = {
    completion: {
      mode: creatorTaskState.mode,
      url: creatorEl('creatorCompletionUrl')?.value?.trim() || ''
    }
  };
  if (creatorTaskState.mode !== 'server_verified') return config;
  const provider = (creatorTaskState.contract?.providerContracts || []).find(item => item.id === creatorTaskState.providerId);
  if (!provider) throw new Error('No Server Verified provider is enabled for this task type.');
  const requirements = {};
  for (const field of provider.fields || []) {
    const value = creatorEl(`creatorProviderField_${field.key}`)?.value?.trim() || '';
    if (field.required && !value) throw new Error(`${field.label} is required.`);
    requirements[field.key] = value;
  }
  config.verification = {
    mode: 'automatic',
    provider: provider.id,
    method: provider.method,
    event: provider.event,
    requirements
  };
  return config;
}

async function createCreatorTask(event) {
  event.preventDefault();
  if (creatorTaskState.createdTaskId) return;
  const button = creatorEl('creatorSubmit');
  button.disabled = true;
  try {
    const result = await creatorApi('/api/creator/tasks', {
      method: 'POST',
      body: JSON.stringify({
        taskType: creatorEl('creatorTaskType').value,
        title: creatorEl('creatorTitle').value.trim(),
        description: creatorEl('creatorDescription').value.trim() || null,
        target: Number(creatorEl('creatorTarget').value),
        config: creatorConfig(),
        idempotencyKey: creatorGetIdempotencyKey()
      })
    });
    creatorTaskState.createdTaskId = result.task?.id || null;
    creatorToast(`Task created. Reserved ${Number(result.campaign?.campaignCostDZX || 0).toLocaleString()} DZX.`);
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

document.addEventListener('input', event => {
  if (event.target.id === 'creatorTarget') updateCreatorCampaignCost();
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
