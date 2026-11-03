// 가상 서버 데이터입니다. 2단계에서 Supabase 테이블로 옮겨집니다.
export const SERVERS = [
  { id: 'web-01', name: 'web-01', slot: 1, status: 'ok', tempC: 38, fanOk: true },
  { id: 'app-02', name: 'app-02', slot: 2, status: 'ok', tempC: 41, fanOk: true },
  { id: 'db-01', name: 'db-01', slot: 3, status: 'warn', tempC: 78, fanOk: false },
  { id: 'cache-01', name: 'cache-01', slot: 4, status: 'ok', tempC: 36, fanOk: true },
];

const LABELS = { ok: '정상', warn: '주의', down: '장애' };

export function statusLabel(status) {
  return LABELS[status] ?? '알 수 없음';
}
