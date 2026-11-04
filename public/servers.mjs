const LABELS = { ok: '정상', warn: '주의', down: '장애' };

export function statusLabel(status) {
  return LABELS[status] ?? '알 수 없음';
}

export const ISSUE_TYPES = ['temp', 'disk', 'network'];
const ISSUE_LABELS = { temp: '온도 상승', disk: '디스크 경고', network: '네트워크 끊김' };

export function issueLabel(issue) {
  return Object.hasOwn(ISSUE_LABELS, issue) ? ISSUE_LABELS[issue] : '';
}
