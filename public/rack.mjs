import { statusLabel, issueLabel, ISSUE_TYPES } from './servers.mjs';

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
  const issue = issueLabel(s.issue);
  return `<li class="server" data-server-id="${escapeHtml(s.id)}">
  <span class="led led-${led}" aria-hidden="true"></span>
  <span class="name">${escapeHtml(s.name)}</span>
  <span class="temp">${escapeHtml(s.tempC)}°C</span>
  <span class="state">${escapeHtml(statusLabel(s.status))}</span>${
    issue ? `\n  <span class="issue">${escapeHtml(issue)}</span>` : ''
  }
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

export function renderIncidentPanel(servers) {
  if (!servers || servers.length === 0) return '';
  const serverOptions = servers
    .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`)
    .join('');
  const typeOptions = ISSUE_TYPES.map(
    (type) => `<option value="${type}">${escapeHtml(issueLabel(type))}</option>`,
  ).join('');
  return `<div class="panel">
  <label>서버 <select id="incident-server">${serverOptions}</select></label>
  <label>사고 <select id="incident-type">${typeOptions}</select></label>
  <button id="incident-go" type="button">사고 만들기</button>
  <button id="reset-go" type="button">처음으로</button>
</div>`;
}
