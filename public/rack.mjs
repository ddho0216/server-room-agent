import { statusLabel, issueLabel, toolLabel, ISSUE_TYPES } from './servers.mjs';

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
  const status = KNOWN.has(s.status) ? s.status : 'unknown';
  const issue = issueLabel(s.issue);
  const bays = '<span class="bay"></span>'.repeat(4);
  return `<li class="server server--${status}" data-server-id="${escapeHtml(s.id)}">
  <div class="faceplate">
    <div class="bays">${bays}</div>
    <div class="vent"></div>
    <span class="fan ${s.fanOk ? 'fan-on' : 'fan-off'}" aria-hidden="true"></span>
    <div class="plate">
      <span class="led led-${status}" aria-hidden="true"></span>
      <span class="name">${escapeHtml(s.name)}</span>
      <span class="temp">${escapeHtml(s.tempC)}°C</span>
      <span class="state">${escapeHtml(statusLabel(s.status))}</span>${
        issue ? `
      <span class="issue">${escapeHtml(issue)}</span>` : ''
      }
    </div>
  </div>
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

export function renderChat() {
  return `<div class="chat">
  <label for="agent-input">부사수에게 말하기</label>
  <div class="chat-row">
    <input id="agent-input" type="text" maxlength="300" placeholder="예: 서버 상태 확인해 줘" autocomplete="off">
    <button id="agent-send" type="button">보내기</button>
  </div>
  <button id="agent-patrol" type="button" class="ghost">순회 점검 해줘</button>
  <div id="agent-reply" class="reply" role="status"></div>
</div>`;
}

const STEP_PREFIX = { done: '확인', pending: '제안', error: '실패' };

export function renderSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return '';
  const rows = steps
    .map((step) => {
      const status = Object.hasOwn(STEP_PREFIX, step?.status) ? step.status : 'done';
      return `<li class="step step--${status}">${STEP_PREFIX[status]}: ${escapeHtml(toolLabel(step?.tool))}</li>`;
    })
    .join('');
  return `<ul class="steps">${rows}</ul>`;
}

function pendingDetail(item) {
  const input = item.input && typeof item.input === 'object' ? item.input : {};
  if (item.tool === 'restart_fan') return String(input.serverId ?? '');
  if (item.tool === 'open_ticket') {
    return `${input.serverId ?? ''}: ${input.title ?? ''} (${input.priority ?? ''})`;
  }
  if (item.tool === 'save_report') return String(input.body ?? '').slice(0, 80);
  return '';
}

export function renderPending(items) {
  const valid = (Array.isArray(items) ? items : []).filter(
    (item) => item && Number.isInteger(item.id) && item.id >= 1,
  );
  if (valid.length === 0) return '';
  const cards = valid
    .map(
      (item) => `<div class="pending-card" data-pending-id="${item.id}">
  <p class="pending-title">${escapeHtml(toolLabel(item.tool))}</p>
  <p class="pending-detail">${escapeHtml(pendingDetail(item))}</p>
  <button class="approve" type="button">승인</button>
  <button class="reject" type="button">거절</button>
</div>`,
    )
    .join('');
  return `<h2 class="section-title">승인 대기</h2>${cards}`;
}

const ACTORS = { user: '선배', agent: '부사수', system: '시스템' };

export function renderLog(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return '<p class="empty">아직 기록이 없어요</p>';
  }
  const rows = entries
    .map(
      (e) => `<li class="log-row"><span class="who">${escapeHtml(ACTORS[e?.actor] ?? e?.actor)}</span> <span class="what">${escapeHtml(
        toolLabel(e?.tool),
      )}</span> <span class="res">${escapeHtml(e?.result ?? '')}</span></li>`,
    )
    .join('');
  return `<h2 class="section-title">최근 활동</h2><ul class="log">${rows}</ul>`;
}
