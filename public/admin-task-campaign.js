'use strict';

const taskAdminTelegram = window.Telegram?.WebApp;
const taskAdminList = document.getElementById('adminTaskCampaignList');
const taskAdminState = document.getElementById('adminTaskCampaignState');

function taskAdminHeaders(json = false) {
  return { ...(json ? { 'Content-Type': 'application/json' } : {}), 'X-Telegram-Init-Data': taskAdminTelegram?.initData || '' };
}

function setTaskAdminState(message, error = false) {
  taskAdminState.textContent = message;
  taskAdminState.dataset.state = error ? 'error' : 'ok';
}

function renderAdminTasks(tasks) {
  taskAdminList.replaceChildren();
  tasks.forEach(task => {
    const item = document.createElement('li');
    item.className = 'admin-task-row';
    item.innerHTML = `<div><strong>#${task.id} · ${task.title}</strong><small>${task.task_type} · creator #${task.creator_id} · target ${task.target} · ${task.status}</small></div>`;
    if (task.status === 'pending_review') {
      const actions = document.createElement('div');
      actions.className = 'users-toolbar';
      actions.innerHTML = `<button type="button" data-task-action="approve">Approve</button><button type="button" data-task-action="reject">Reject</button>`;
      actions.querySelector('[data-task-action="approve"]').addEventListener('click', () => reviewTask(task.id, 'approve'));
      actions.querySelector('[data-task-action="reject"]').addEventListener('click', () => reviewTask(task.id, 'reject'));
      item.appendChild(actions);
    }
    taskAdminList.appendChild(item);
  });
}

async function loadAdminTasks() {
  try {
    setTaskAdminState('Loading…');
    const response = await fetch('/api/admin/tasks?status=pending_review', { headers: taskAdminHeaders(), cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load campaigns');
    renderAdminTasks(data.tasks || []);
    setTaskAdminState(`${(data.tasks || []).length} campaign(s) awaiting review.`);
  } catch (error) { setTaskAdminState(error.message || 'Unable to load campaigns.', true); }
}

async function reviewTask(taskId, action) {
  const reason = window.prompt(`Reason for ${action} campaign #${taskId}:`);
  if (!reason?.trim()) return;
  try {
    setTaskAdminState(`${action === 'approve' ? 'Approving' : 'Rejecting'}…`);
    const response = await fetch(`/api/admin/tasks/${taskId}/review`, {
      method: 'POST',
      headers: taskAdminHeaders(true),
      body: JSON.stringify({ action, reason: reason.trim(), idempotencyKey: crypto.randomUUID() }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Review failed');
    setTaskAdminState(data.duplicate ? 'Existing review returned (idempotent).' : 'Review applied and audited.');
    await loadAdminTasks();
  } catch (error) { setTaskAdminState(error.message || 'Review failed.', true); }
}

document.getElementById('adminTaskCampaignRefresh').addEventListener('click', loadAdminTasks);
loadAdminTasks();
