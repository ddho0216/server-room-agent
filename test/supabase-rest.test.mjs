import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authHeaders, restRequest } from '../lib/supabase-rest.mjs';

const JWT_KEY = ['ey', 'Jhbgci'].join('') + 'x'.repeat(30);
const base = { url: 'https://x.supabase.co', key: 'SECRET123' };

const reply = (body, extra = {}) => async (url, init) => {
  reply.last = { url, init };
  return {
    ok: true,
    status: 200,
    json: async () => body,
    headers: { get: (name) => extra[name.toLowerCase()] ?? null },
  };
};

test('authHeaders: JWT는 두 헤더, 아닌 키는 apikey만', () => {
  assert.deepEqual(authHeaders(JWT_KEY), { apikey: JWT_KEY, Authorization: `Bearer ${JWT_KEY}` });
  assert.deepEqual(authHeaders('SECRET123'), { apikey: 'SECRET123' });
});

test('GET은 본문을 돌려주고 content-range에서 건수를 읽는다', async () => {
  const result = await restRequest({
    ...base,
    path: '/rest/v1/incidents?select=id',
    headers: { Prefer: 'count=exact' },
    fetchImpl: reply([], { 'content-range': '0-0/7' }),
  });
  assert.deepEqual(result.data, []);
  assert.equal(result.count, 7);
  assert.equal(reply.last.url, 'https://x.supabase.co/rest/v1/incidents?select=id');
  assert.equal(reply.last.init.headers.Prefer, 'count=exact');
});

test('POST는 JSON 본문과 content-type을 보낸다', async () => {
  await restRequest({
    ...base,
    method: 'POST',
    path: '/rest/v1/incidents',
    body: { type: 'temp' },
    fetchImpl: reply([]),
  });
  assert.equal(reply.last.init.method, 'POST');
  assert.equal(reply.last.init.headers['Content-Type'], 'application/json');
  assert.equal(reply.last.init.body, JSON.stringify({ type: 'temp' }));
});

test('본문이 비어 있는 성공 응답도 받는다', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 204,
    json: async () => {
      throw new Error('no body');
    },
    headers: { get: () => null },
  });
  const result = await restRequest({ ...base, method: 'PATCH', path: '/rest/v1/servers?id=eq.a', body: {}, fetchImpl });
  assert.equal(result.status, 204);
  assert.equal(result.data, null);
});

test('거절은 upstream 오류와 status를 담고 키는 담지 않는다', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({}), headers: { get: () => null } });
  await assert.rejects(restRequest({ ...base, path: '/rest/v1/x', fetchImpl }), (err) => {
    assert.equal(err.message, 'upstream');
    assert.equal(err.status, 403);
    assert.ok(!err.message.includes('SECRET123'));
    return true;
  });
});

test('네트워크 오류는 주소와 키 없이 upstream', async () => {
  const fetchImpl = async () => {
    throw new Error('boom SECRET123 x.supabase.co');
  };
  await assert.rejects(restRequest({ ...base, path: '/rest/v1/x', fetchImpl }), (err) => {
    assert.equal(err.message, 'upstream');
    return true;
  });
});
