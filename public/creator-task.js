const creatorTaskState = {
  contract: null,
  taskType: 'game',
  verification: 'click_proof',
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
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}
function creatorIdempotencyKey() {
  if (!creatorTaskState.idempotencyKey) creatorTaskState.idempotencyKey = `creator-task:${crypto.randomUUID()}`;
  return creatorTaskState.idempotencyKey;
}
const VERIFICATION_DESCRIPTIONS = Object.freeze({
  click_proof: 'User clicks the campaign link and DzMoney records the click.',
  url_format_match: 'The external Mini App referral URL must match the campaign URL format.',
  bot_api: 'The Telegram target is verified server-side through the Bot API contract.'
});
function verificationOptions() {
  const methods = creatorTaskState.contract?.verificationMethods || [];
  return methods.map(method => [method, method === 'click_proof' ? 'Click Proof' : method === 'url_format_match' ? 'URL Format Match' : method === 'bot_api' ? 'Bot API' : method, VERIFICATION_DESCRIPTIONS[method] || 'Server-defined verification method.']);
}
function providerForSocial() {
  return (creatorTaskState.contract?.providerContracts || []).find(item => item.method === creatorTaskState.verification) || null;
}
function formatDZX(value) { return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 4 }); }
function categoryButtons(active) {
  return `<div class="creator-category-grid">${[['game','Game'],['social','Social'],['web','Web'],['special','Special']].map(([key,label]) => `<button type="button" class="creator-category ${active === key ? 'active' : ''}" data-creator-category="${key}">${label}</button>`).join('')}</div>`;
}
function renderCreatorForm() {
  const form = creatorEl('creatorTaskForm');
  if (!form) return;
  if (creatorTaskState.taskType === 'special') {
    form.innerHTML = `<div class="creator-form-shell"><section class="creator-section"><h2 class="creator-section-title">Task Category</h2>${categoryButtons('special')}<div class="creator-admin-note"><strong>Special / Partner</strong><span>Creator setup is handled by Admin.</span><span>Contact: @DzMoneyCustomer</span></div></section></div>`;
    bindCreatorCategories();
    return;
  }
  const pricing = creatorTaskState.contract?.campaignPricing || {};
  const price = Number(pricing.priceDZXPerExecution || 0);
  const minTarget = Number(pricing.minTarget || 1000);
  const target = Math.max(minTarget, Number(creatorEl('creatorTarget')?.value || minTarget));
  const options = verificationOptions();
  if (!options.length) {
    form.innerHTML = '<article class="info-card"><strong>No verification methods are configured for this task type.</strong></article>';
    return;
  }
  if (!options.some(([key]) => key === creatorTaskState.verification)) creatorTaskState.verification = options[0][0];
  const provider = creatorTaskState.verification === 'bot_api' ? providerForSocial() : null;
  const total = price > 0 ? target * price : 0;
  form.innerHTML = `<div class="creator-form-shell"><section class="creator-section"><h2 class="creator-section-title">Task Category</h2>${categoryButtons(creatorTaskState.taskType)}<label class="creator-field"><span>Title *</span><input id="creatorTitle" required maxlength="120" placeholder="Task title"></label><label class="creator-field"><span>Description (optional)</span><textarea id="creatorDescription" maxlength="500" placeholder="What should the user do?"></textarea></label><label class="creator-field"><span>Campaign URL *</span><input id="creatorCampaignUrl" type="url" required placeholder="https://example.com"><small>This is the target URL used by the selected verification method.</small></label><div class="creator-field"><span>Verification Method *</span><div class="creator-verification-grid">${options.map(([key,label,description]) => `<button type="button" class="creator-verification ${creatorTaskState.verification === key ? 'active' : ''}" data-creator-verification="${key}"><strong>${label}</strong><span>${description}</span></button>`).join('')}</div></div>${provider ? `<label class="creator-field"><span>${provider.fields[0]?.label || 'Telegram target'} *</span><input id="creatorProviderField_channel" required placeholder="@channel_username"><small>The channel or bot in the campaign URL is the verification target.</small></label>` : ''}<label class="creator-field"><span>Target (Executions) *</span><input id="creatorTarget" type="number" min="${minTarget}" step="${pricing.targetStep || 1}" value="${target}" required><small>Number of valid completions you want to receive.</small></label><label class="creator-field"><span>Target Company / Entity (optional)</span><input id="creatorTargetCompany" type="text" maxlength="120" placeholder="Search or select a company / entity"></label></section><section class="creator-section"><h2 class="creator-section-title">Pricing</h2><div class="creator-pricing"><div class="creator-price-cell"><span class="creator-price-label">Reference Price</span><strong class="creator-price-value">${price ? `${formatDZX(price)} DZX` : '—'}</strong><span class="creator-price-sub">/ per valid execution</span></div><div class="creator-price-cell"><span class="creator-price-label">Reference Campaign</span><strong class="creator-price-value">1,000 executions</strong><span class="creator-price-sub">= ${price ? `${formatDZX(price * 1000)} DZX` : '—'}</span></div><div class="creator-price-cell creator-price-total"><span class="creator-price-label">Total Campaign Price</span><strong class="creator-price-value">${total ? `${formatDZX(total)} DZX` : '—'}</strong><span class="creator-price-sub">(You will pay)</span></div></div><div class="creator-admin-note"><strong>Pricing is Admin-controlled.</strong>The displayed total is a preview; the backend remains authoritative.</div></section><div class="creator-actions"><button class="primary-btn" id="creatorSubmit" type="submit">Publish Task</button><button class="secondary-btn" id="creatorReviewSubmit" type="button" disabled>Review before publishing</button></div></div>`;
  bindCreatorCategories();
  creatorEl('creatorTarget')?.addEventListener('input', updateCreatorCampaignCost);
  document.querySelectorAll('[data-creator-verification]').forEach(button => button.addEventListener('click', () => { creatorTaskState.verification = button.dataset.creatorVerification; renderCreatorForm(); }));
}
function bindCreatorCategories() {
  document.querySelectorAll('[data-creator-category]').forEach(button => button.addEventListener('click', () => setCreatorTaskType(button.dataset.creatorCategory)));
}
function updateCreatorCampaignCost() {
  const pricing = creatorTaskState.contract?.campaignPricing || {};
  const target = Number(creatorEl('creatorTarget')?.value || 0);
  const price = Number(pricing.priceDZXPerExecution || 0);
  const value = document.querySelector('.creator-price-total .creator-price-value');
  if (value) value.textContent = target > 0 && price > 0 ? `${formatDZX(target * price)} DZX` : '—';
}
async function setCreatorTaskType(taskType) {
  creatorTaskState.taskType = taskType;
  creatorTaskState.verification = 'click_proof';
  creatorTaskState.createdTaskId = null;
  creatorTaskState.idempotencyKey = null;
  if (taskType === 'special') { creatorTaskState.contract = null; renderCreatorForm(); return; }
  await loadCreatorContract();
}
function creatorConfig() {
  const campaignUrl = creatorEl('creatorCampaignUrl')?.value?.trim() || '';
  if (!campaignUrl) throw new Error('Campaign URL is required.');
  const verification = { method: creatorTaskState.verification };
  if (creatorTaskState.verification === 'bot_api') {
    const channel = creatorEl('creatorProviderField_channel')?.value?.trim() || '';
    if (!channel) throw new Error('Telegram target is required.');
    Object.assign(verification, { provider: 'telegram_channel', event: 'channel_membership', requirements: { channel } });
  }
  const config = { campaignUrl, verification };
  const targetCompany = creatorEl('creatorTargetCompany')?.value?.trim() || '';
  if (targetCompany) config.campaign = { targetCompany };
  return config;
}
async function loadCreatorContract() {
  if (creatorTaskState.taskType === 'special') return renderCreatorForm();
  const form = creatorEl('creatorTaskForm');
  if (!form) return;
  form.innerHTML = '<article class="info-card"><strong>Loading campaign contract…</strong></article>';
  try { creatorTaskState.contract = await creatorApi(`/api/creator/tasks/contracts/${encodeURIComponent(creatorTaskState.taskType)}`); renderCreatorForm(); }
  catch (error) { form.innerHTML = `<article class="info-card"><strong>Unable to load contract</strong><p>${String(error.message || 'Please try again.')}</p></article>`; }
}
async function createCreatorTask(event) {
  event.preventDefault();
  if (creatorTaskState.taskType === 'special' || creatorTaskState.createdTaskId) return;
  const button = creatorEl('creatorSubmit'); button.disabled = true;
  try {
    const result = await creatorApi('/api/creator/tasks', { method: 'POST', body: JSON.stringify({ taskType: creatorTaskState.taskType, title: creatorEl('creatorTitle').value.trim(), description: creatorEl('creatorDescription').value.trim() || null, target: Number(creatorEl('creatorTarget').value), config: creatorConfig(), idempotencyKey: creatorIdempotencyKey() }) });
    creatorTaskState.createdTaskId = result.task?.id || null;
    creatorToast(`Task created. Reserved ${formatDZX(result.campaign?.campaignCostDZX)} DZX.`);
    button.textContent = 'Task created';
    const review = creatorEl('creatorReviewSubmit'); if (review) review.disabled = !creatorTaskState.createdTaskId;
  } catch (error) { creatorToast(error.message || 'Unable to create task.'); button.disabled = false; }
}
async function submitCreatorTaskForReview(event) {
  event.preventDefault();
  if (!creatorTaskState.createdTaskId) return;
  const button = creatorEl('creatorReviewSubmit'); button.disabled = true;
  try { const result = await creatorApi(`/api/creator/tasks/${encodeURIComponent(creatorTaskState.createdTaskId)}/submit`, { method: 'POST', body: '{}' }); creatorToast(result.task?.status === 'pending_review' ? 'Task submitted for review.' : 'Task submitted.'); }
  catch (error) { creatorToast(error.message || 'Unable to submit task for review.'); button.disabled = false; }
}
function setCreatorPanelVisible(visible) {
  const list = creatorEl('tasksList');
  const panel = creatorEl('creatorTaskPanel');
  if (!list || !panel) return;
  list.hidden = visible;
  panel.hidden = !visible;
  document.querySelectorAll('[data-task-mode]').forEach(tab => tab.classList.toggle('active', tab.dataset.taskMode === (visible ? 'creator' : 'tasks')));
  if (visible && !creatorTaskState.contract) loadCreatorContract();
}
document.addEventListener('submit', event => { if (event.target.id === 'creatorTaskForm') createCreatorTask(event); });
document.addEventListener('click', event => {
  const tab = event.target.closest('[data-task-mode]');
  if (tab) { setCreatorPanelVisible(tab.dataset.taskMode === 'creator'); return; }
  const category = event.target.closest('[data-task-category]');
  if (category) { setCreatorPanelVisible(false); return; }
  const back = event.target.closest('[data-task-back]');
  if (back) { setCreatorPanelVisible(false); return; }
  if (event.target.closest('#creatorReviewSubmit')) submitCreatorTaskForReview(event);
});
window.addEventListener('load', () => { if (creatorEl('creatorTaskForm')) loadCreatorContract(); });
window.setCreatorPanelVisible = setCreatorPanelVisible;