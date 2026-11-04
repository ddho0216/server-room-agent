// 배포된 사이트를 비로그인 요청으로 두들겨 보는 점검 목록입니다.
// 데이터를 바꾸는 요청은 보내지 않습니다(허용된 메서드의 본문은 전부 잘못된 입력).

const SECRET_PATTERNS = [
  /sb_secret_/i,
  /eyJ[A-Za-z0-9_-]{20,}/,
  /service_role/i,
  /SUPABASE_[A-Z_]+/,
  /ANTHROPIC_[A-Z_]+/,
  /sk-ant\-/,
];

export function scanForSecrets(text) {
  return SECRET_PATTERNS.some((re) => re.test(text));
}

export function evaluate(check, result) {
  if (result.status >= 500) return { pass: false, reason: `서버 오류 ${result.status}` };
  if (!check.expect.includes(result.status)) {
    return { pass: false, reason: `상태 ${result.status} (기대 ${check.expect.join('/')})` };
  }
  if (scanForSecrets(result.text)) return { pass: false, reason: '응답에 키 흔적이 있다' };
  if (check.forbid && check.forbid.test(result.text)) return { pass: false, reason: '응답에 금지된 내용이 있다' };
  return { pass: true };
}

const API_ALLOWED = {
  '/api/servers': 'GET',
  '/api/incidents': 'POST',
  '/api/reset': 'POST',
  '/api/agent': 'POST',
  '/api/approve': 'POST',
  '/api/activity': 'GET',
};

const checks = [];
const add = (id, name, method, path, expect, extra = {}) => checks.push({ id, name, method, path, expect, ...extra });

// 1) 허용하지 않는 메서드
for (const [path, allowed] of Object.entries(API_ALLOWED)) {
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    if (method === allowed) continue;
    add(`method-${method.toLowerCase()}-${path.slice(5)}`, `${method} ${path}는 허용하지 않는다`, method, path, [405], {
      body: method === 'GET' ? undefined : '{}',
    });
  }
}

// 2) 부사수 입력 공격 (모두 400)
const SAMPLE_BAD_MESSAGES = [
  ['empty-object', '빈 객체', '{}'],
  ['empty-string', '빈 문자열 메시지', '{"message":""}'],
  ['spaces', '공백만 있는 메시지', '{"message":"   "}'],
  ['number', '숫자 메시지', '{"message":5}'],
  ['array-body', '배열 본문', '[]'],
  ['nosql', '$ne 객체 메시지', '{"message":{"$ne":""}}'],
  ['array-message', '배열 메시지', '{"message":["점검"]}'],
  ['too-long', '301자 메시지', JSON.stringify({ message: '가'.repeat(301) })],
  ['broken-json', '깨진 JSON {bad', '{bad'],
  ['proto', '__proto__ 오염 시도', '{"__proto__":{"x":1}}'],
  ['empty-body', '빈 본문', ''],
  ['json-string', 'JSON 문자열 본문', '"점검"'],
];
for (const [id, name, body] of SAMPLE_BAD_MESSAGES) {
  add(`agent-${id}`, `부사수: ${name}`, 'POST', '/api/agent', [400], { body });
}
add('agent-huge', '부사수: 아주 큰 본문(약 300KB)', 'POST', '/api/agent', [400, 413], {
  body: JSON.stringify({ message: '가'.repeat(100000) }),
});

// 3) 사고 만들기 입력 공격 (400 또는 404)
const BAD_INCIDENTS = [
  ['bad-type', '목록 밖 종류', '{"type":"fire","serverId":"db-01"}'],
  ['proto-type', '__proto__ 종류', '{"type":"__proto__","serverId":"db-01"}'],
  ['sql', "SQL 조각 서버 id (' or '1'='1)", '{"type":"temp","serverId":"db-01\' or \'1\'=\'1"}'],
  ['traversal', '경로 조작 서버 id (../)', '{"type":"temp","serverId":"../../etc/passwd"}'],
  ['object-id', '$ne 객체 서버 id', '{"type":"temp","serverId":{"$ne":""}}'],
  ['number-id', '숫자 서버 id', '{"type":"temp","serverId":7}'],
  ['unknown-server', '없는 서버', '{"type":"temp","serverId":"zzz-9"}'],
  ['missing', '칸이 없음', '{}'],
  ['broken', '깨진 JSON', '{bad'],
  ['array', '배열 본문', '[1,2]'],
];
for (const [id, name, body] of BAD_INCIDENTS) {
  add(`incident-${id}`, `사고: ${name}`, 'POST', '/api/incidents', [400, 404], { body });
}

// 4) 승인 입력 공격 (400, 실제처럼 보이는 id는 없는 번호라 409)
const BAD_APPROVE = [
  ['string-id', '문자열 id', '{"id":"5","decision":"approve"}', [400]],
  ['negative', '음수 id', '{"id":-1,"decision":"approve"}', [400]],
  ['zero', '0 id', '{"id":0,"decision":"approve"}', [400]],
  ['float', '소수 id', '{"id":1.5,"decision":"approve"}', [400]],
  ['null-id', 'null id', '{"id":null,"decision":"approve"}', [400]],
  ['upper', '대문자 decision', '{"id":5,"decision":"APPROVE"}', [400]],
  ['sql-decision', 'SQL 조각 decision', '{"id":5,"decision":"approve\' or \'1\'=\'1"}', [400]],
  ['empty', '빈 객체', '{}', [400]],
  ['broken', '깨진 JSON', '{bad', [400]],
  ['missing-approve', '없는 번호 승인', '{"id":999999999999,"decision":"approve"}', [409]],
  ['missing-reject', '없는 번호 거절', '{"id":999999999999,"decision":"reject"}', [409]],
];
for (const [id, name, body, expect] of BAD_APPROVE) {
  add(`approve-${id}`, `승인: ${name}`, 'POST', '/api/approve', expect, { body });
}

// 5) 파일 읽기 (공개 폴더 밖의 것은 열리면 안 된다)
const PRIVATE_FILES = [
  '/.env',
  '/.git/config',
  '/package.json',
  '/package-lock.json',
  '/AGENTS.md',
  '/README.md',
  '/vercel.json',
  '/lib/rule-brain.mjs',
  '/lib/tools.mjs',
  '/supabase/003_agent.sql',
  '/test/repo.test.mjs',
  '/docs/superpowers/specs/2026-11-03-server-room-agent-design.md',
  '/node_modules/@anthropic-ai/sdk/package.json',
];
for (const path of PRIVATE_FILES) add(`file-${path.slice(1).replace(/[^a-z0-9]+/gi, '-')}`, `${path}는 열리지 않는다`, 'GET', path, [404]);
add('file-traversal', '경로 조작(..%2f)은 열리지 않는다', 'GET', '/..%2f..%2fetc%2fpasswd', [400, 404]);
add('file-api-source', '/api/agent.js는 소스를 내주지 않는다', 'GET', '/api/agent.js', [404, 405]);

// 6) 공개 파일과 읽기 API: 200이고 키나 서버 이름이 없어야 한다
const FORBID_NAMES = /web-01|app-02|db-01|cache-01/;
for (const path of ['/', '/app.js', '/rack.mjs', '/servers.mjs', '/style.css']) {
  add(`static-${path === '/' ? 'index' : path.slice(1).replace(/\./g, '-')}`, `${path}에는 키나 서버 이름이 없다`, 'GET', path, [200], {
    forbid: FORBID_NAMES,
  });
}
add('read-servers', '/api/servers 응답에 키가 없다', 'GET', '/api/servers', [200]);
add('read-activity', '/api/activity 응답에 키가 없다', 'GET', '/api/activity', [200]);

export const CHECKS = checks;

export const NOT_RUN = [
  {
    id: 'rate-limit',
    name: '호출 한도(429)',
    reason: '한도만큼 기록을 쌓아 부사수를 한동안 막으므로 점검에서 보내지 않는다. 단위 시험(test/api-agent.test.mjs, test/api-incidents.test.mjs)으로 확인한다.',
  },
];

// 데이터베이스를 공개 주소로 직접 읽으면 막혀야 한다(anon 권한 회수 증거). 키 없음과 가짜 키로만 시도한다.
const TABLES = ['servers', 'incidents', 'action_log', 'pending_actions', 'tickets', 'reports'];
export function buildSupabaseChecks(baseUrl) {
  const list = [];
  for (const table of TABLES) {
    const url = `${baseUrl}/rest/v1/${table}?select=*&limit=1`;
    list.push({ id: `db-nokey-${table}`, name: `DB 직접 읽기(키 없음): ${table}`, method: 'GET', url, expect: [401, 403] });
    list.push({
      id: `db-badkey-${table}`,
      name: `DB 직접 읽기(가짜 키): ${table}`,
      method: 'GET',
      url,
      headers: { apikey: 'invalid' },
      expect: [401, 403],
    });
  }
  return list;
}
