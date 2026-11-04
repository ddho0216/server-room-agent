import { brainLabel } from './servers.mjs';
import {
  renderRack,
  renderLoading,
  renderError,
  renderIncidentPanel,
  renderChat,
  renderSteps,
  renderPending,
  renderLog,
} from './rack.mjs';

const rack = document.querySelector('#rack');
const panel = document.querySelector('#panel');
const message = document.querySelector('#message');
const agentBox = document.querySelector('#agent');
const pendingBox = document.querySelector('#pending');
const activityBox = document.querySelector('#activity');

function draw(servers) {
  rack.innerHTML = renderRack(servers);
  panel.innerHTML = renderIncidentPanel(servers);
}

async function post(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (response.status === 429) throw new Error('limit');
  if (response.status === 409) throw new Error('done');
  if (!response.ok) throw new Error('bad response');
  return response.json();
}

function say(error) {
  if (error.message === 'limit') return '잠시 후에 다시 해 주세요';
  if (error.message === 'done') return '이미 처리된 요청이에요';
  return '불러오지 못했어요';
}

async function refreshActivity() {
  try {
    const response = await fetch('/api/activity');
    if (!response.ok) throw new Error('bad response');
    const { pending, log } = await response.json();
    pendingBox.innerHTML = renderPending(pending);
    activityBox.innerHTML = renderLog(log);
  } catch {
    activityBox.innerHTML = '';
  }
}

async function act(path, body) {
  const buttons = panel.querySelectorAll('button');
  buttons.forEach((b) => (b.disabled = true));
  message.textContent = '';
  try {
    const { servers } = await post(path, body);
    if (!Array.isArray(servers)) throw new Error('bad shape');
    draw(servers);
    await refreshActivity();
  } catch (error) {
    message.textContent = say(error);
    buttons.forEach((b) => (b.disabled = false));
  }
}

panel.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.id === 'incident-go') {
    act('/api/incidents', {
      serverId: panel.querySelector('#incident-server').value,
      type: panel.querySelector('#incident-type').value,
    });
  } else if (button.id === 'reset-go') {
    act('/api/reset');
  }
});

// 부사수와 대화
agentBox.innerHTML = renderChat();
const input = agentBox.querySelector('#agent-input');
const replyBox = agentBox.querySelector('#agent-reply');

async function ask(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const buttons = agentBox.querySelectorAll('button');
  buttons.forEach((b) => (b.disabled = true));
  replyBox.textContent = '확인하는 중…';
  try {
    const { reply, steps, brain } = await post('/api/agent', { message: trimmed });
    replyBox.textContent = reply;
    replyBox.insertAdjacentHTML('beforeend', renderSteps(steps));
    const label = brainLabel(brain);
    if (label) {
      const tag = document.createElement('p');
      tag.className = 'brain';
      tag.textContent = label;
      replyBox.append(tag);
    }
    input.value = '';
    await refreshActivity();
  } catch (error) {
    replyBox.textContent = say(error);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

agentBox.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.id === 'agent-send') ask(input.value);
  else if (button.id === 'agent-patrol') ask('순회 점검 해줘');
});
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) ask(input.value);
});

// 승인 대기 카드의 승인·거절
pendingBox.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  const card = event.target.closest('[data-pending-id]');
  if (!button || !card) return;
  const decision = button.classList.contains('approve') ? 'approve' : button.classList.contains('reject') ? 'reject' : null;
  if (!decision) return;
  pendingBox.querySelectorAll('button').forEach((b) => (b.disabled = true));
  message.textContent = '';
  try {
    const { result, servers } = await post('/api/approve', { id: Number(card.dataset.pendingId), decision });
    if (Array.isArray(servers)) draw(servers);
    message.textContent = result ?? '';
  } catch (error) {
    message.textContent = say(error);
  }
  await refreshActivity();
});

rack.innerHTML = renderLoading();

try {
  const response = await fetch('/api/servers');
  if (!response.ok) throw new Error('bad response');
  const { servers } = await response.json();
  if (!Array.isArray(servers)) throw new Error('bad shape');
  draw(servers);
  refreshActivity();
} catch {
  rack.innerHTML = renderError();
}
