import { renderRack, renderLoading, renderError, renderIncidentPanel } from './rack.mjs';

const rack = document.querySelector('#rack');
const panel = document.querySelector('#panel');
const message = document.querySelector('#message');

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
  if (!response.ok) throw new Error('bad response');
  const { servers } = await response.json();
  if (!Array.isArray(servers)) throw new Error('bad shape');
  return servers;
}

async function act(button, path, body) {
  const buttons = panel.querySelectorAll('button');
  buttons.forEach((b) => (b.disabled = true));
  message.textContent = '';
  try {
    draw(await post(path, body));
  } catch (error) {
    message.textContent =
      error.message === 'limit' ? '잠시 후에 다시 해 주세요' : '불러오지 못했어요';
    buttons.forEach((b) => (b.disabled = false));
  }
}

panel.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.id === 'incident-go') {
    act(button, '/api/incidents', {
      serverId: panel.querySelector('#incident-server').value,
      type: panel.querySelector('#incident-type').value,
    });
  } else if (button.id === 'reset-go') {
    act(button, '/api/reset');
  }
});

rack.innerHTML = renderLoading();

try {
  const response = await fetch('/api/servers');
  if (!response.ok) throw new Error('bad response');
  const { servers } = await response.json();
  if (!Array.isArray(servers)) throw new Error('bad shape');
  draw(servers);
} catch {
  rack.innerHTML = renderError();
}
