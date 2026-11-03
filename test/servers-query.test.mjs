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

test('요청에 슬롯 정렬과 두 헤더가 있다', async () => {
  const calls = [];
  await fetchServers({ ...base, fetchImpl: okFetch(ROWS, calls) });
  assert.ok(calls[0].url.startsWith('https://x.supabase.co/rest/v1/servers?'));
  assert.ok(calls[0].url.includes('order=slot.asc'));
  assert.equal(calls[0].init.headers.apikey, 'SECRET123');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer SECRET123');
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
