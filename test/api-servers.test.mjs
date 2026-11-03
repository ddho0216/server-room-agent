import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/servers.js';
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

const run = async (method, deps) => {
  const res = fakeRes();
  await handler({ method }, res, deps);
  return res;
};

test('GET이면 200과 서버 목록', async () => {
  const res = await run('GET', { env, fetchServers: async () => SERVERS });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { servers: SERVERS });
});

test('POST는 405와 Allow 헤더', async () => {
  const res = await run('POST', { env, fetchServers: async () => SERVERS });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET');
});

test('환경변수가 없으면 500이고 응답에 변수 이름이나 키가 없다', async () => {
  const res = await run('GET', { env: {}, fetchServers: async () => SERVERS });
  assert.equal(res.statusCode, 500);
  assert.ok(!JSON.stringify(res.body).includes('SUPABASE'));
});

test('upstream 실패는 502', async () => {
  const res = await run('GET', {
    env,
    fetchServers: async () => {
      throw new Error('upstream');
    },
  });
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, { error: '불러오지 못했어요' });
});

test('응답 본문과 헤더 어디에도 키 값이 없다', async () => {
  for (const method of ['GET', 'POST']) {
    const res = await run(method, { env, fetchServers: async () => SERVERS });
    const all = JSON.stringify(res.body) + JSON.stringify(res.headers);
    assert.ok(!all.includes(KEY));
  }
});

test('모든 응답에 Cache-Control no-store', async () => {
  for (const [method, deps] of [
    ['GET', { env, fetchServers: async () => SERVERS }],
    ['POST', { env, fetchServers: async () => SERVERS }],
    ['GET', { env: {}, fetchServers: async () => SERVERS }],
  ]) {
    const res = await run(method, deps);
    assert.equal(res.headers['cache-control'], 'no-store');
  }
});
