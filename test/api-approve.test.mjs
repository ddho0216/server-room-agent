import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/approve.js';
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

const ROW = { id: 5, tool: 'restart_fan', input: { serverId: 'db-01' } };

function makeDeps({ claim = [ROW], rejectOk = true, applyFails = false } = {}) {
  const log = { applied: [], logged: [], released: [], rejected: [] };
  const claims = [...claim];
  return {
    log,
    env,
    fetchServers: async () => SERVERS,
    store: {
      claimPending: async () => claims.shift() ?? null,
      rejectPending: async (ctx, id) => {
        log.rejected.push(id);
        return rejectOk;
      },
      releasePending: async (ctx, id) => void log.released.push(id),
      logActions: async (ctx, rows) => void log.logged.push(...rows),
    },
    applyChange: async (ctx, row) => {
      if (applyFails) throw Object.assign(new Error('upstream'), { status: 500 });
      log.applied.push(row);
      return '팬을 다시 돌렸어요';
    },
    restRequest: async () => ({ status: 200, data: [] }),
  };
}

const run = async (method, body, deps) => {
  const res = fakeRes();
  await handler({ method, body }, res, deps);
  return res;
};
const approve = { id: 5, decision: 'approve' };

test('승인: 실행하고 사용자 기록을 남기고 서버 목록을 돌려준다', async () => {
  const deps = makeDeps();
  const res = await run('POST', approve, deps);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { result: '팬을 다시 돌렸어요', servers: SERVERS });
  assert.equal(deps.log.applied.length, 1);
  assert.deepEqual(deps.log.applied[0], ROW);
  assert.equal(deps.log.logged.length, 1);
  assert.equal(deps.log.logged[0].actor, 'user');
  assert.equal(deps.log.logged[0].tool, 'restart_fan');
  assert.equal(deps.log.logged[0].approved, true);
});

test('거절: 실행하지 않고 거절 기록을 남긴다', async () => {
  const deps = makeDeps();
  const res = await run('POST', { id: 5, decision: 'reject' }, deps);
  assert.equal(res.statusCode, 200);
  assert.equal(deps.log.applied.length, 0);
  assert.deepEqual(deps.log.rejected, [5]);
  assert.equal(deps.log.logged[0].approved, false);
});

test('같은 승인을 두 번 눌러도 실행은 한 번, 두 번째는 409', async () => {
  const deps = makeDeps({ claim: [ROW] });
  const first = await run('POST', approve, deps);
  const second = await run('POST', approve, deps);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 409);
  assert.equal(deps.log.applied.length, 1);
});

test('이미 처리됐거나 없는 거절은 409', async () => {
  const deps = makeDeps({ rejectOk: false });
  const res = await run('POST', { id: 99, decision: 'reject' }, deps);
  assert.equal(res.statusCode, 409);
  assert.equal(deps.log.logged.length, 0);
});

test('GET은 405와 Allow 헤더', async () => {
  const res = await run('GET', undefined, makeDeps());
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'POST');
});

test('환경변수가 없으면 500이고 응답에 변수 이름이 없다', async () => {
  const res = await run('POST', approve, { ...makeDeps(), env: {} });
  assert.equal(res.statusCode, 500);
  assert.ok(!JSON.stringify(res.body).includes('SUPABASE'));
});

test('잘못된 본문은 400이고 아무것도 하지 않는다', async () => {
  for (const body of [
    undefined,
    null,
    'approve',
    [],
    {},
    { id: '5', decision: 'approve' },
    { id: 0, decision: 'approve' },
    { id: 1.5, decision: 'approve' },
    { id: -3, decision: 'approve' },
    { id: 5 },
    { id: 5, decision: 'yes' },
    { id: 5, decision: 'APPROVE' },
  ]) {
    const deps = makeDeps();
    const res = await run('POST', body, deps);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.equal(deps.log.applied.length, 0);
    assert.equal(deps.log.logged.length, 0);
  }
});

test('실행이 실패하면 대기 상태로 되돌리고 502, 키는 없다', async () => {
  const deps = makeDeps({ applyFails: true });
  const res = await run('POST', approve, deps);
  assert.equal(res.statusCode, 502);
  assert.deepEqual(deps.log.released, [5]);
  assert.equal(deps.log.logged.length, 0);
  const all = JSON.stringify(res.body) + JSON.stringify(res.headers);
  assert.ok(!all.includes(KEY));
  assert.ok(!all.includes('supabase.co'));
});

test('모든 응답에 Cache-Control no-store', async () => {
  for (const [method, body, deps] of [
    ['POST', approve, makeDeps()],
    ['GET', undefined, makeDeps()],
    ['POST', null, makeDeps()],
    ['POST', approve, { ...makeDeps(), env: {} }],
    ['POST', approve, makeDeps({ applyFails: true })],
    ['POST', approve, makeDeps({ claim: [] })],
  ]) {
    assert.equal((await run(method, body, deps)).headers['cache-control'], 'no-store');
  }
});

test('실행 시점에 서버가 사라졌으면 422이고 대기 상태로 되돌린다', async () => {
  const { ToolInputError } = await import('../lib/tools.mjs');
  const deps = makeDeps();
  deps.applyChange = async () => {
    throw new ToolInputError('없는 서버예요: db-01');
  };
  const res = await run('POST', approve, deps);
  assert.equal(res.statusCode, 422);
  assert.deepEqual(deps.log.released, [5]);
  assert.equal(deps.log.logged.length, 0);
});
