import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = () => readFileSync(new URL('../supabase/001_servers.sql', import.meta.url), 'utf8');

test('RLS를 켠다', () => {
  assert.match(sql(), /alter table public\.servers enable row level security/i);
});

test('anon과 authenticated의 권한을 회수하고 grant는 쓰지 않는다', () => {
  assert.match(sql(), /revoke all on table public\.servers from anon, authenticated/i);
  assert.doesNotMatch(sql(), /\bgrant\b/i);
});

test('서버 4건을 넣는다', () => {
  for (const id of ['web-01', 'app-02', 'db-01', 'cache-01']) {
    assert.ok(sql().includes(`'${id}'`), `${id} 행이 없다`);
  }
  assert.match(sql(), /insert into public\.servers/i);
});

test('owner_id 칸은 있고 외래키는 없다', () => {
  assert.match(sql(), /owner_id uuid/i);
  assert.doesNotMatch(sql(), /references/i);
});
