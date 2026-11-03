import { renderRack, renderLoading, renderError } from './rack.mjs';

const rack = document.querySelector('#rack');
rack.innerHTML = renderLoading();

try {
  const response = await fetch('/api/servers');
  if (!response.ok) throw new Error('bad response');
  const { servers } = await response.json();
  if (!Array.isArray(servers)) throw new Error('bad shape');
  rack.innerHTML = renderRack(servers);
} catch {
  rack.innerHTML = renderError();
}
