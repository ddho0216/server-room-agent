import { statusLabel } from './servers.mjs';

const KNOWN = new Set(['ok', 'warn', 'down']);

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderServer(s) {
  const led = KNOWN.has(s.status) ? s.status : 'unknown';
  return `<li class="server" data-server-id="${escapeHtml(s.id)}">
  <span class="led led-${led}" aria-hidden="true"></span>
  <span class="name">${escapeHtml(s.name)}</span>
  <span class="temp">${escapeHtml(s.tempC)}°C</span>
  <span class="state">${escapeHtml(statusLabel(s.status))}</span>
</li>`;
}

export function renderLoading() {
  return '<p class="empty">불러오는 중…</p>';
}

export function renderError() {
  return '<p class="empty">불러오지 못했어요</p>';
}

export function renderRack(servers) {
  if (!servers || servers.length === 0) {
    return '<p class="empty">서버가 없어요</p>';
  }
  return servers.map(renderServer).join('\n');
}
