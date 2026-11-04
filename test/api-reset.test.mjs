import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/reset.js';
import { BASELINE } from '../lib/baseline.mjs';
import { SERVERS } from './fixtures.mjs';

const KEY = 'SECRET123';
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: KEY };

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.status = (code) => ((res.statusCode = code), res);
  res.setHeader = (name, value) => void (res.headers[name.toLowerCase()] = String(value));
  res.json = (data) => ((res.body = data), res);
  return res;
}

function makeDeps({ fail = false } = {}) {
  const calls = [];
  return {
    calls,
    env,
    now: () => new Date('2026-11-04T03:00:00.000Z'),
    fetchServers: async () => SERVERS,
    restRequest: async (args) => {
      calls.push(args);
      if (fail) throw Object.assign(new Error('upstream'), { status: 500 });
      return { status: 204, data: null };
    },
  };
}

const run = async (method, deps) => {
  const res = fakeRes();
  await handler({ method }, res, deps);
  return res;
};

test('정상: 200과 서버 4대 복구, 열린 사고 닫기', async () => {
  const deps = makeDeps();
  const res = await run('POST', deps);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { servers: SERVERS });
  assert.equal(deps.calls.length, 5);

  const serverPatches = deps.calls.filter((c) => c.path.startsWith('/rest/v1/servers?id=eq.'));
  assert.equal(serverPatches.length, 4);
  const db = serverPatches.find((c) => c.path.endsWith('db-01'));
  assert.deepEqual(db.body, { status: 'warn', temp_c: 78, fan_ok: false, issue: null });
  assert.ok(serverPatches.every((c) => c.method === 'PATCH'));

  const close = deps.calls.find((c) => c.path.startsWith('/rest/v1/incidents'));
  assert.equal(close.method, 'PATCH');
  assert.ok(close.path.includes('resolved_at=is.null'));
  assert.deepEqual(close.body, { resolved_at: '2026-11-04T03:00:00.000Z' });
});

test('GET은 405와 Allow 헤더', async () => {
  const res = await run('GET', makeDeps());
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'POST');
});

test('환경변수가 없으면 500이고 응답에 변수 이름이 없다', async () => {
  const res = await run('POST', { ...makeDeps(), env: {} });
  assert.equal(res.statusCode, 500);
  assert.ok(!JSON.stringify(res.body).includes('SUPABASE'));
});

test('upstream 실패는 502이고 응답에 키와 주소가 없다', async () => {
  const res = await run('POST', makeDeps({ fail: true }));
  assert.equal(res.statusCode, 502);
  const all = JSON.stringify(res.body) + JSON.stringify(res.headers);
  assert.ok(!all.includes(KEY));
  assert.ok(!all.includes('supabase.co'));
});

test('몇 번을 불러도 같은 요청과 같은 결과', async () => {
  const a = makeDeps();
  const b = makeDeps();
  await run('POST', a);
  await run('POST', b);
  await run('POST', b);
  assert.deepEqual(
    a.calls.map((c) => [c.method, c.path, c.body]),
    b.calls.slice(5).map((c) => [c.method, c.path, c.body]),
  );
});

test('모든 응답에 Cache-Control no-store', async () => {
  for (const [method, deps] of [
    ['POST', makeDeps()],
    ['GET', makeDeps()],
    ['POST', { ...makeDeps(), env: {} }],
    ['POST', makeDeps({ fail: true })],
  ]) {
    assert.equal((await run(method, deps)).headers['cache-control'], 'no-store');
  }
});

test('초기 상태 4대 모두 BASELINE에서 온다', () => {
  assert.equal(BASELINE.length, 4);
});
