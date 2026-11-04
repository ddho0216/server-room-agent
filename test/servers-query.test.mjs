import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchServers } from '../lib/servers-query.mjs';
import { ROWS, SERVERS } from './fixtures.mjs';

const okFetch = (body, calls = []) => async (url, init) => {
  calls.push({ url, init });
  return { ok: true, status: 200, json: async () => body };
};
const base = { url: 'https://x.supabase.co', key: 'SECRET123' };

test('DB 행을 화면 모양으로 바꾼다', async () => {
  const result = await fetchServers({ ...base, fetchImpl: okFetch(ROWS) });
  assert.deepEqual(result, SERVERS);
});

// 테스트 파일에 JWT 모양 문자열이 그대로 남지 않게 실행 중에 만듭니다.
const JWT_KEY = ['ey', 'Jhbgci'].join('') + 'x'.repeat(30);

test('JWT 키(예전 방식 서버 키)는 apikey와 Authorization 두 헤더로 보낸다', async () => {
  const calls = [];
  await fetchServers({ url: base.url, key: JWT_KEY, fetchImpl: okFetch(ROWS, calls) });
  assert.ok(calls[0].url.startsWith('https://x.supabase.co/rest/v1/servers?'));
  assert.ok(calls[0].url.includes('order=slot.asc'));
  assert.equal(calls[0].init.headers.apikey, JWT_KEY);
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${JWT_KEY}`);
});

test('JWT가 아닌 키(새 sb_secret_)는 apikey 헤더만 보낸다', async () => {
  const calls = [];
  await fetchServers({ ...base, fetchImpl: okFetch(ROWS, calls) });
  assert.equal(calls[0].init.headers.apikey, 'SECRET123');
  assert.equal(calls[0].init.headers.Authorization, undefined);
});

test('거절당하면 오류에 상태 코드가 담기고 키는 담기지 않는다', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });
  await assert.rejects(fetchServers({ ...base, fetchImpl }), (err) => {
    assert.equal(err.status, 401);
    assert.ok(!err.message.includes('SECRET123'));
    return true;
  });
});

test('ok가 아닌 응답은 upstream 오류', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
  await assert.rejects(fetchServers({ ...base, fetchImpl }), /upstream/);
});

test('배열이 아니면 upstream 오류', async () => {
  await assert.rejects(fetchServers({ ...base, fetchImpl: okFetch({}) }), /upstream/);
});

test('칸이 빠진 행은 upstream 오류', async () => {
  const { temp_c, ...broken } = ROWS[0];
  await assert.rejects(fetchServers({ ...base, fetchImpl: okFetch([broken]) }), /upstream/);
});

test('네트워크 오류도 upstream 오류이고 메시지에 키가 없다', async () => {
  const fetchImpl = async () => {
    throw new Error('connect failed SECRET123 https://x.supabase.co');
  };
  await assert.rejects(fetchServers({ ...base, fetchImpl }), (err) => {
    assert.match(err.message, /upstream/);
    assert.ok(!err.message.includes('SECRET123'));
    assert.ok(!err.message.includes('supabase.co'));
    return true;
  });
});

test('issue가 있는 행은 문자열로, 없는 행은 null로 바꾼다', async () => {
  const rows = [{ ...ROWS[0], issue: 'temp' }, { ...ROWS[1], issue: null }];
  const result = await fetchServers({ ...base, fetchImpl: okFetch(rows) });
  assert.equal(result[0].issue, 'temp');
  assert.equal(result[1].issue, null);
});

test('issue 칸이 아예 없는 행도 null로 받는다', async () => {
  const { issue, ...noIssue } = ROWS[0];
  const result = await fetchServers({ ...base, fetchImpl: okFetch([noIssue]) });
  assert.equal(result[0].issue, null);
});

test('요청이 issue 칸을 고른다', async () => {
  const calls = [];
  await fetchServers({ ...base, fetchImpl: okFetch(ROWS, calls) });
  assert.ok(calls[0].url.includes('issue'));
});
