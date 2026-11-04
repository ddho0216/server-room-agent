import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BASELINE } from '../lib/baseline.mjs';

test('초기 서버는 4대이고 issue가 없다', () => {
  assert.equal(BASELINE.length, 4);
  for (const s of BASELINE) assert.equal(s.issue, null);
});

test('초기 값이 001 SQL의 가상 자료와 같다', () => {
  const sql = readFileSync(new URL('../supabase/001_servers.sql', import.meta.url), 'utf8');
  const re = /\('([^']+)', '([^']+)', (\d+), '(\w+)', (\d+), (true|false)\)/g;
  const fromSql = [...sql.matchAll(re)].map((m) => ({
    id: m[1],
    name: m[2],
    slot: Number(m[3]),
    status: m[4],
    tempC: Number(m[5]),
    fanOk: m[6] === 'true',
    issue: null,
  }));
  assert.equal(fromSql.length, 4);
  assert.deepEqual(BASELINE, fromSql);
});
