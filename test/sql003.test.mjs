import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = () => readFileSync(new URL('../supabase/003_agent.sql', import.meta.url), 'utf8');
const TABLES = ['action_log', 'pending_actions', 'tickets', 'reports'];

test('네 테이블을 만든다', () => {
  for (const table of TABLES) {
    assert.match(sql(), new RegExp(`create table if not exists public\\.${table}`, 'i'), table);
  }
});

test('각 테이블에 RLS를 켜고 공개 역할 권한을 회수한다', () => {
  for (const table of TABLES) {
    assert.match(sql(), new RegExp(`alter table public\\.${table} enable row level security`, 'i'), table);
    assert.match(sql(), new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, 'i'), table);
  }
});

test('서버 전용 역할에만 읽기·쓰기 권한을 준다', () => {
  for (const table of TABLES) {
    assert.match(sql(), new RegExp(`grant select, insert, update on table public\\.${table} to service_role`, 'i'), table);
  }
  assert.match(sql(), /grant usage, select on all sequences in schema public to service_role/i);
  assert.doesNotMatch(sql(), /grant[^;]*\b(anon|authenticated)\b/i);
});

test('종류 제한(check)이 설계와 같다', () => {
  assert.match(sql(), /check \(actor in \('user', 'agent', 'system'\)\)/i);
  assert.match(sql(), /check \(tool in \('restart_fan', 'open_ticket', 'save_report'\)\)/i);
  assert.match(sql(), /check \(status in \('pending', 'approved', 'rejected'\)\)/i);
  assert.match(sql(), /check \(priority in \('low', 'normal', 'high'\)\)/i);
  assert.match(sql(), /check \(kind in \('patrol', 'monthly'\)\)/i);
});

test('외래키를 걸지 않는다', () => {
  assert.doesNotMatch(sql(), /references/i);
});
