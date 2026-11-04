import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/incidents.js';
import { isOverLimit, MAX_INCIDENTS, WINDOW_MINUTES } from '../lib/rate-limit.mjs';
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

function makeDeps({ count = 0, fail = false, servers = SERVERS } = {}) {
  const calls = [];
  return {
    calls,
    env,
    fetchServers: async () => {
      if (fail) throw Object.assign(new Error('upstream'), { status: 500 });
      return servers;
    },
    restRequest: async (args) => {
      calls.push(args);
      if (fail) throw Object.assign(new Error('upstream'), { status: 500 });
      if (args.path.startsWith('/rest/v1/incidents?select')) return { status: 200, data: [], count };
      return { status: 201, data: null };
    },
  };
}

const run = async (req, deps) => {
  const res = fakeRes();
  await handler(req, res, deps);
  return res;
};
const post = (body) => ({ method: 'POST', body });
const writes = (deps) => deps.calls.filter((c) => c.method === 'POST' || c.method === 'PATCH');

test('정상 요청은 200이고 사고를 기록하고 서버를 바꾼다', async () => {
  const deps = makeDeps();
  const res = await run(post({ type: 'temp', serverId: 'db-01' }), deps);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { servers: SERVERS });
  const [insert, patch] = writes(deps);
  assert.equal(insert.path, '/rest/v1/incidents');
  assert.deepEqual(insert.body, { server_id: 'db-01', type: 'temp' });
  assert.equal(patch.method, 'PATCH');
  assert.equal(patch.path, '/rest/v1/servers?id=eq.db-01');
  assert.deepEqual(patch.body, { status: 'warn', temp_c: 86, fan_ok: false, issue: 'temp' });
});

test('GET은 405와 Allow 헤더', async () => {
  const res = await run({ method: 'GET' }, makeDeps());
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'POST');
});

test('환경변수가 없으면 500이고 응답에 변수 이름이 없다', async () => {
  const deps = { ...makeDeps(), env: {} };
  const res = await run(post({ type: 'temp', serverId: 'db-01' }), deps);
  assert.equal(res.statusCode, 500);
  assert.ok(!JSON.stringify(res.body).includes('SUPABASE'));
});

test('본문이 객체가 아니면 400', async () => {
  for (const body of ['temp', null, undefined, [], 42]) {
    const deps = makeDeps();
    const res = await run(post(body), deps);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.equal(writes(deps).length, 0);
  }
});

test('type이 목록에 없거나 serverId가 문자열이 아니면 400이고 DB를 바꾸지 않는다', async () => {
  for (const body of [
    { type: 'fire', serverId: 'db-01' },
    { serverId: 'db-01' },
    { type: 'temp' },
    { type: 'temp', serverId: 7 },
  ]) {
    const deps = makeDeps();
    const res = await run(post(body), deps);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.equal(writes(deps).length, 0);
  }
});

test('없는 서버 id는 404이고 사고를 기록하지 않는다', async () => {
  const deps = makeDeps();
  const res = await run(post({ type: 'temp', serverId: 'zzz' }), deps);
  assert.equal(res.statusCode, 404);
  assert.equal(writes(deps).length, 0);
});

test('한도를 넘으면 429이고 DB를 바꾸지 않는다', async () => {
  const deps = makeDeps({ count: MAX_INCIDENTS });
  const res = await run(post({ type: 'temp', serverId: 'db-01' }), deps);
  assert.equal(res.statusCode, 429);
  assert.equal(writes(deps).length, 0);
});

test('upstream 실패는 502이고 응답에 키와 주소가 없다', async () => {
  const res = await run(post({ type: 'temp', serverId: 'db-01' }), makeDeps({ fail: true }));
  assert.equal(res.statusCode, 502);
  const all = JSON.stringify(res.body) + JSON.stringify(res.headers);
  assert.ok(!all.includes(KEY));
  assert.ok(!all.includes('supabase.co'));
});

test('모든 응답에 Cache-Control no-store', async () => {
  for (const [req, deps] of [
    [post({ type: 'temp', serverId: 'db-01' }), makeDeps()],
    [{ method: 'GET' }, makeDeps()],
    [post(null), makeDeps()],
    [post({ type: 'temp', serverId: 'zzz' }), makeDeps()],
    [post({ type: 'temp', serverId: 'db-01' }), makeDeps({ count: 99 })],
    [post({ type: 'temp', serverId: 'db-01' }), makeDeps({ fail: true })],
  ]) {
    assert.equal((await run(req, deps)).headers['cache-control'], 'no-store');
  }
});

test('같은 사고를 두 번 연속 요청해도 두 번 다 200', async () => {
  const deps = makeDeps();
  const first = await run(post({ type: 'disk', serverId: 'web-01' }), deps);
  const second = await run(post({ type: 'disk', serverId: 'web-01' }), deps);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
});

test('isOverLimit: 9건은 아니고 10건은 맞다, 요청에 시각 조건이 있다', async () => {
  const now = new Date('2026-11-04T03:00:00.000Z');
  const seen = [];
  const make = (count) => async (args) => {
    seen.push(args);
    return { status: 200, data: [], count };
  };
  assert.equal(await isOverLimit({ url: 'u', key: 'k', now, restRequest: make(MAX_INCIDENTS - 1) }), false);
  assert.equal(await isOverLimit({ url: 'u', key: 'k', now, restRequest: make(MAX_INCIDENTS) }), true);
  const since = new Date(now.getTime() - WINDOW_MINUTES * 60 * 1000).toISOString();
  assert.ok(seen[0].path.includes(`started_at=gte.${encodeURIComponent(since)}`));
  assert.equal(seen[0].headers.Prefer, 'count=exact');
});
