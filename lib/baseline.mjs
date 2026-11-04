// 서버 4대의 초기 상태입니다. supabase/001_servers.sql의 가상 자료와 같아야 합니다(시험으로 비교).
export const BASELINE = [
  { id: 'web-01', name: 'web-01', slot: 1, status: 'ok', tempC: 38, fanOk: true, issue: null },
  { id: 'app-02', name: 'app-02', slot: 2, status: 'ok', tempC: 41, fanOk: true, issue: null },
  { id: 'db-01', name: 'db-01', slot: 3, status: 'warn', tempC: 78, fanOk: false, issue: null },
  { id: 'cache-01', name: 'cache-01', slot: 4, status: 'ok', tempC: 36, fanOk: true, issue: null },
];
