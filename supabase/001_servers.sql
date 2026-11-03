-- 서버실 AI 부사수 2단계: 서버 상태 테이블 (가상 자료)
-- Supabase SQL Editor에서 한 번 실행합니다. 다시 실행해도 안전합니다.

create table if not exists public.servers (
  id text primary key,
  name text not null,
  slot int not null,
  status text not null check (status in ('ok', 'warn', 'down')),
  temp_c numeric not null,
  fan_ok boolean not null,
  owner_id uuid,
  updated_at timestamptz not null default now()
);

insert into public.servers (id, name, slot, status, temp_c, fan_ok) values
  ('web-01', 'web-01', 1, 'ok', 38, true),
  ('app-02', 'app-02', 2, 'ok', 41, true),
  ('db-01', 'db-01', 3, 'warn', 78, false),
  ('cache-01', 'cache-01', 4, 'ok', 36, true)
on conflict (id) do nothing;

-- 잠금: 정책을 하나도 만들지 않으므로 서버 전용 키만 읽고 쓸 수 있습니다.
alter table public.servers enable row level security;
revoke all on table public.servers from anon, authenticated;

-- 서버 함수가 쓰는 서버 전용 역할에만 읽기를 허용합니다. 다시 실행해도 안전합니다.
grant select on table public.servers to service_role;
