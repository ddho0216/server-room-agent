import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHECKS, NOT_RUN, buildSupabaseChecks, evaluate, scanForSecrets } from '../lib/attack-checks.mjs';

// 테스트 파일에 키 모양 문자열이 그대로 남지 않게 실행 중에 만든다.
const JWT_LIKE = ['ey', 'Jhbgci'].join('') + 'x'.repeat(30);
const OPENAI_LIKE = ['sk', 'ant', 'abc123'].join('-');

const VALID_TYPES = ['temp', 'disk', 'network'];
const VALID_SERVERS = ['web-01', 'app-02', 'db-01', 'cache-01'];
const parse = (body) => {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
};
const forPath = (path, method) => CHECKS.filter((c) => c.path === path && (!method || c.method === method));

test('evaluate: 기대한 상태면 통과', () => {
  assert.deepEqual(evaluate({ expect: [400] }, { status: 400, text: '{"error":"x"}' }), { pass: true });
  assert.deepEqual(evaluate({ expect: [400, 404] }, { status: 404, text: '' }), { pass: true });
});

test('evaluate: 기대 밖 상태는 이유와 함께 실패', () => {
  const r = evaluate({ expect: [400] }, { status: 200, text: '{}' });
  assert.equal(r.pass, false);
  assert.match(r.reason, /200/);
  assert.match(r.reason, /400/);
});

test('evaluate: 5xx는 기대 목록에 있어도 실패', () => {
  const r = evaluate({ expect: [500] }, { status: 500, text: '' });
  assert.equal(r.pass, false);
  assert.match(r.reason, /서버 오류/);
});

test('evaluate: 응답에 키 흔적이 있으면 실패', () => {
  for (const text of [JWT_LIKE, 'sb_secret_abc123', 'SUPABASE_URL=x', 'ANTHROPIC_API_KEY', OPENAI_LIKE, 'service_role']) {
    const r = evaluate({ expect: [200] }, { status: 200, text });
    assert.equal(r.pass, false, text.slice(0, 12));
    assert.match(r.reason, /키/);
  }
});

test('evaluate: 금지 패턴(forbid)이 응답에 있으면 실패', () => {
  const check = { expect: [200], forbid: /web-01|db-01/ };
  assert.equal(evaluate(check, { status: 200, text: 'hello web-01' }).pass, false);
  assert.equal(evaluate(check, { status: 200, text: 'hello' }).pass, true);
});

test('scanForSecrets: 평범한 글과 한국어는 통과', () => {
  assert.equal(scanForSecrets('서버실 부사수 {"error":"잘못된 요청이에요"}'), false);
  assert.equal(scanForSecrets('<html><title>서버실</title></html>'), false);
});

test('CHECKS: 항목마다 id(중복 없음), 메서드, 경로, 기대 상태가 있다', () => {
  assert.ok(CHECKS.length >= 40, `점검 항목이 ${CHECKS.length}개뿐이다`);
  const ids = CHECKS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of CHECKS) {
    assert.ok(/^[A-Z]+$/.test(c.method), c.id);
    assert.ok(c.path.startsWith('/'), c.id);
    assert.ok(Array.isArray(c.expect) && c.expect.length > 0, c.id);
    assert.equal(typeof c.name, 'string');
  }
});

test('CHECKS: 모든 API에 허용하지 않는 메서드 점검이 있다', () => {
  const allowed = {
    '/api/servers': 'GET',
    '/api/incidents': 'POST',
    '/api/reset': 'POST',
    '/api/agent': 'POST',
    '/api/approve': 'POST',
    '/api/activity': 'GET',
  };
  for (const [path, ok] of Object.entries(allowed)) {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE'].filter((m) => m !== ok)) {
      const found = forPath(path, method);
      assert.ok(found.length > 0, `${method} ${path}`);
      for (const c of found) assert.deepEqual(c.expect, [405]);
    }
  }
});

test('CHECKS: 데이터를 바꾸는 요청이 없다(허용된 메서드의 본문은 전부 잘못된 입력)', () => {
  assert.ok(!CHECKS.some((c) => c.path === '/api/reset' && c.method === 'POST'));

  for (const c of forPath('/api/agent', 'POST')) {
    const body = parse(c.body);
    const message = body && typeof body === 'object' ? body.message : undefined;
    const valid = typeof message === 'string' && message.trim().length >= 1 && message.trim().length <= 300;
    assert.ok(!valid, `${c.id}는 정상 메시지다`);
  }
  for (const c of forPath('/api/incidents', 'POST')) {
    const body = parse(c.body);
    const valid = body && VALID_TYPES.includes(body.type) && VALID_SERVERS.includes(body.serverId);
    assert.ok(!valid, `${c.id}는 정상 사고 요청이다`);
  }
  for (const c of forPath('/api/approve', 'POST')) {
    const body = parse(c.body);
    const looksReal =
      body && Number.isInteger(body.id) && body.id >= 1 && body.id < 100000000 && ['approve', 'reject'].includes(body.decision);
    assert.ok(!looksReal, `${c.id}는 실제 대기 건을 처리할 수 있다`);
  }
});

test('CHECKS: 입력 공격 종류가 골고루 들어 있다', () => {
  const text = CHECKS.map((c) => `${c.name} ${c.body ?? ''} ${c.path}`).join('\n');
  for (const needle of ["' or '1'='1", '../', '__proto__', '$ne', '{bad']) {
    assert.ok(text.includes(needle), `${needle} 점검이 없다`);
  }
  assert.ok(CHECKS.some((c) => (c.body ?? '').length > 100000), '아주 큰 본문 점검이 없다');
});

test('CHECKS: 파일 읽기 점검은 404를 기대하고 정적 파일은 서버 이름이 없는지 본다', () => {
  for (const path of ['/.env', '/package.json', '/AGENTS.md', '/lib/rule-brain.mjs', '/supabase/003_agent.sql', '/.git/config']) {
    const c = CHECKS.find((x) => x.path === path && x.method === 'GET');
    assert.ok(c, path);
    assert.deepEqual(c.expect, [404], path);
  }
  for (const path of ['/', '/app.js', '/rack.mjs', '/servers.mjs', '/style.css']) {
    const c = CHECKS.find((x) => x.path === path && x.method === 'GET');
    assert.ok(c?.forbid instanceof RegExp, `${path}에 forbid가 없다`);
    assert.deepEqual(c.expect, [200]);
  }
});

test('CHECKS: 키 값이나 Supabase 주소가 들어 있지 않다', () => {
  const text = JSON.stringify(CHECKS.map((c) => ({ ...c, forbid: undefined })));
  assert.ok(!scanForSecrets(text.replace(/SUPABASE_|ANTHROPIC_/g, '')));
  assert.ok(!text.includes('.supabase.co'));
});

test('NOT_RUN: 호출 한도 점검은 이유와 함께 하지 않았다고 적혀 있다', () => {
  const rate = NOT_RUN.find((n) => n.id === 'rate-limit');
  assert.ok(rate);
  assert.ok(rate.reason.length > 10);
  assert.ok(!CHECKS.some((c) => c.id === 'rate-limit'));
});

test('buildSupabaseChecks: 키 없음과 가짜 키로 테이블 6개를 읽어 보고 401/403을 기대한다', () => {
  const list = buildSupabaseChecks('https://example.supabase.co');
  assert.equal(list.length, 12);
  for (const c of list) {
    assert.ok(c.url.startsWith('https://example.supabase.co/rest/v1/'));
    assert.deepEqual(c.expect, [401, 403]);
    assert.equal(c.method, 'GET');
  }
  const tables = new Set(list.map((c) => c.url.match(/rest\/v1\/([a-z_]+)/)[1]));
  assert.deepEqual([...tables].sort(), ['action_log', 'incidents', 'pending_actions', 'reports', 'servers', 'tickets']);
  assert.ok(list.some((c) => c.headers?.apikey === 'invalid'));
  assert.ok(list.some((c) => !c.headers?.apikey));
});

test('scripts/attack-check.mjs는 서버를 바꾸는 reset·정상 요청을 직접 보내지 않는다', () => {
  const source = readFileSync(new URL('../scripts/attack-check.mjs', import.meta.url), 'utf8');
  assert.ok(!source.includes('/api/reset'));
  assert.ok(source.includes('CHECKS'));
  assert.ok(source.includes('process.exit'));
});
