-- 서버실 AI 부사수 4단계: 에이전트 기록·승인 대기·티켓·보고서 테이블
-- Supabase SQL Editor에서 한 번 실행합니다. 다시 실행해도 안전합니다.

create table if not exists public.action_log (
  id bigint generated always as identity primary key,
  actor text not null check (actor in ('user', 'agent', 'system')),
  tool text not null,
  input jsonb,
  result text,
  approved boolean,
  created_at timestamptz not null default now()
);

create table if not exists public.pending_actions (
  id bigint generated always as identity primary key,
  tool text not null check (tool in ('restart_fan', 'open_ticket', 'save_report')),
  input jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table if not exists public.tickets (
  id bigint generated always as identity primary key,
  source text not null,
  category text,
  priority text not null check (priority in ('low', 'normal', 'high')),
  body text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('patrol', 'monthly')),
  period text,
  body text not null,
  created_at timestamptz not null default now()
);

-- 잠금: 정책을 하나도 만들지 않으므로 서버 전용 역할만 접근합니다.
alter table public.action_log enable row level security;
alter table public.pending_actions enable row level security;
alter table public.tickets enable row level security;
alter table public.reports enable row level security;

revoke all on table public.action_log from anon, authenticated;
revoke all on table public.pending_actions from anon, authenticated;
revoke all on table public.tickets from anon, authenticated;
revoke all on table public.reports from anon, authenticated;

-- 서버 함수가 쓰는 서버 전용 역할에 필요한 만큼만 허용합니다.
grant select, insert, update on table public.action_log to service_role;
grant select, insert, update on table public.pending_actions to service_role;
grant select, insert, update on table public.tickets to service_role;
grant select, insert, update on table public.reports to service_role;
grant usage, select on all sequences in schema public to service_role;
