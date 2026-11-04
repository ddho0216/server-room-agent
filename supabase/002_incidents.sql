-- 서버실 AI 부사수 3단계: 사고 기록 테이블과 servers.issue 칸
-- Supabase SQL Editor에서 한 번 실행합니다. 다시 실행해도 안전합니다.

alter table public.servers add column if not exists issue text;

create table if not exists public.incidents (
  id bigint generated always as identity primary key,
  server_id text not null,
  type text not null check (type in ('temp', 'disk', 'network')),
  started_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- 잠금: 정책을 하나도 만들지 않으므로 서버 전용 역할만 접근합니다.
alter table public.incidents enable row level security;
revoke all on table public.incidents from anon, authenticated;

-- 서버 함수가 쓰는 서버 전용 역할에 필요한 만큼만 허용합니다.
grant select, insert, update on table public.incidents to service_role;
grant update on table public.servers to service_role;
grant usage, select on all sequences in schema public to service_role;
