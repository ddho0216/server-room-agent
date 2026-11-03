const LABELS = { ok: '정상', warn: '주의', down: '장애' };

export function statusLabel(status) {
  return LABELS[status] ?? '알 수 없음';
}
