// 테스트용 가상 서버입니다. public 폴더에는 서버 상태 데이터를 두지 않습니다.
export const ROWS = [
  { id: 'web-01', name: 'web-01', slot: 1, status: 'ok', temp_c: 38, fan_ok: true, issue: null },
  { id: 'app-02', name: 'app-02', slot: 2, status: 'ok', temp_c: 41, fan_ok: true, issue: null },
  { id: 'db-01', name: 'db-01', slot: 3, status: 'warn', temp_c: 78, fan_ok: false, issue: null },
  { id: 'cache-01', name: 'cache-01', slot: 4, status: 'ok', temp_c: 36, fan_ok: true, issue: null },
];

export const SERVERS = [
  { id: 'web-01', name: 'web-01', slot: 1, status: 'ok', tempC: 38, fanOk: true, issue: null },
  { id: 'app-02', name: 'app-02', slot: 2, status: 'ok', tempC: 41, fanOk: true, issue: null },
  { id: 'db-01', name: 'db-01', slot: 3, status: 'warn', tempC: 78, fanOk: false, issue: null },
  { id: 'cache-01', name: 'cache-01', slot: 4, status: 'ok', tempC: 36, fanOk: true, issue: null },
];
