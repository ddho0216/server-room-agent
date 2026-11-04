import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = () => readFileSync(new URL('../supabase/002_incidents.sql', import.meta.url), 'utf8');

test('servers에 issue 칸을 더한다', () => {
  assert.match(sql(), /alter table public\.servers add column if not exists issue text/i);
});

test('incidents 테이블을 만들고 종류를 제한한다', () => {
  assert.match(sql(), /create table if not exists public\.incidents/i);
  assert.match(sql(), /check \(type in \('temp', 'disk', 'network'\)\)/i);
});

test('incidents에 RLS를 켜고 공개 역할 권한을 회수한다', () => {
  assert.match(sql(), /alter table public\.incidents enable row level security/i);
  assert.match(sql(), /revoke all on table public\.incidents from anon, authenticated/i);
});

test('서버 전용 역할에만 필요한 권한을 준다', () => {
  assert.match(sql(), /grant select, insert, update on table public\.incidents to service_role/i);
  assert.match(sql(), /grant update on table public\.servers to service_role/i);
  assert.match(sql(), /grant usage, select on all sequences in schema public to service_role/i);
  assert.doesNotMatch(sql(), /grant[^;]*\b(anon|authenticated)\b/i);
});

test('외래키를 걸지 않는다', () => {
  assert.doesNotMatch(sql(), /references/i);
});
