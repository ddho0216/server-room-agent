import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/activity.js';

const KEY = 'SECRET123';
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: KEY };

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.status = (code) => ((res.statusCode = code), res);
  res.setHeader = (name, value) => void (res.headers[name.toLowerCase()] = String(value));
  res.json = (data) => ((res.body = data), res);
  return res;
}

const PENDING = [{ id: 5, tool: 'restart_fan', input: { serverId: 'db-01' }, created_at: 'x' }];
const LOG = [{ id: 9, actor: 'user', tool: 'restart_fan', result: '완료', approved: true, created_at: 'y' }];

function makeDeps({ fail = false } = {}) {
  const seen = {};
  return {
    seen,
    env,
    restRequest: async () => ({ status: 200, data: [] }),
    store: {
      listPending: async () => {
        if (fail) throw Object.assign(new Error('upstream'), { status: 500 });
        return PENDING;
      },
      listLog: async (ctx, limit) => {
        seen.limit = limit;
        return LOG;
      },
    },
  };
}

const run = async (method, deps) => {
  const res = fakeRes();
  await handler({ method }, res, deps);
  return res;
};

test('GET이면 대기 중인 승인과 최근 기록을 돌려준다', async () => {
  const deps = makeDeps();
  const res = await run('GET', deps);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { pending: PENDING, log: LOG });
  assert.equal(deps.seen.limit, 8);
});

test('POST는 405와 Allow 헤더', async () => {
  const res = await run('POST', makeDeps());
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET');
});

test('환경변수가 없으면 500이고 응답에 변수 이름이 없다', async () => {
  const res = await run('GET', { ...makeDeps(), env: {} });
  assert.equal(res.statusCode, 500);
  assert.ok(!JSON.stringify(res.body).includes('SUPABASE'));
});

test('upstream 실패는 502이고 키와 주소가 없다', async () => {
  const res = await run('GET', makeDeps({ fail: true }));
  assert.equal(res.statusCode, 502);
  const all = JSON.stringify(res.body) + JSON.stringify(res.headers);
  assert.ok(!all.includes(KEY));
  assert.ok(!all.includes('supabase.co'));
});

test('모든 응답에 Cache-Control no-store', async () => {
  for (const [method, deps] of [
    ['GET', makeDeps()],
    ['POST', makeDeps()],
    ['GET', { ...makeDeps(), env: {} }],
    ['GET', makeDeps({ fail: true })],
  ]) {
    assert.equal((await run(method, deps)).headers['cache-control'], 'no-store');
  }
});
