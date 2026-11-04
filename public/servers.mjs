const LABELS = { ok: '정상', warn: '주의', down: '장애' };

export function statusLabel(status) {
  return LABELS[status] ?? '알 수 없음';
}

export const ISSUE_TYPES = ['temp', 'disk', 'network'];
const ISSUE_LABELS = { temp: '온도 상승', disk: '디스크 경고', network: '네트워크 끊김' };

export function issueLabel(issue) {
  return Object.hasOwn(ISSUE_LABELS, issue) ? ISSUE_LABELS[issue] : '';
}

const TOOL_LABELS = {
  get_server_status: '서버 상태',
  get_cooling_temp: '냉각기 온도',
  read_logs: '기록 읽기',
  restart_fan: '팬 재가동',
  open_ticket: '티켓 열기',
  save_report: '보고서 저장',
  agent_run: '부사수 호출',
  reject: '거절',
};

export function toolLabel(name) {
  if (name === undefined || name === null) return '';
  return Object.hasOwn(TOOL_LABELS, name) ? TOOL_LABELS[name] : String(name);
}

const BRAIN_LABELS = { rule: '규칙 기반 시뮬레이션', anthropic: 'AI 모델' };

export function brainLabel(brain) {
  return Object.hasOwn(BRAIN_LABELS, brain) ? BRAIN_LABELS[brain] : '';
}
