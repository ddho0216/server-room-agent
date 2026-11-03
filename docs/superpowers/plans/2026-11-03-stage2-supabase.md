# 서버실 AI 부사수 — 2단계 (Supabase로 데이터 이동 + 잠금) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가상 서버 4대를 새 Supabase 테이블로 옮기고 잠근 뒤, 화면이 서버 함수 `/api/servers`로만 읽게 한다.

**Architecture:** `supabase/001_servers.sql`이 테이블, 가상 자료 4건, RLS 잠금을 만든다. Vercel 서버 함수 `api/servers.js`가 서버 전용 키로 Supabase REST(PostgREST)를 `fetch`로 읽고 화면용 JSON을 돌려준다. 화면은 `/api/servers`만 부른다. 의존성은 추가하지 않는다.

**Tech Stack:** Node ESM (의존성 없음), `node:test`, Supabase(Postgres + REST), Vercel Node 함수.

**Spec:** `docs/superpowers/specs/2026-11-03-server-room-agent-design.md` (3·5·6장, 7장 2단계 완료 기준)

## Global Constraints

- Supabase 프로젝트는 방어전과 분리한 새 프로젝트다.
- 테이블은 RLS를 켜고 `anon`·`authenticated`에 권한을 주지 않는다. `owner_id uuid` 칸은 두되 `auth.users` 외래키는 걸지 않는다.
- 서버 전용 키(`SUPABASE_SERVICE_ROLE_KEY`)는 Vercel 환경변수에만 둔다. 코드, 로그, Git, 응답, 답변에 넣지 않는다. 사용자가 Vercel 화면에 직접 넣는다.
- 공개 파일(`public/`)에 서버 상태 데이터(서버 이름, 온도 등)가 없어야 한다.
- 데이터는 전부 가상이다.
- 2단계 완료 기준: 서버 상태가 테이블에 있고, RLS가 켜져 있으며, 공개 파일에는 상태 데이터가 없다.
- 커밋 메시지는 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` 줄로 끝낸다.
- 화면 문구는 한국어.

## Rulings (설계와 다르게 한 것)

- **Ruling:** 설계 7장은 `/api` 서버 함수를 3단계에 두었지만, 2단계 완료 기준(공개 파일에 상태 데이터 없음)을 지키면 화면이 읽을 길이 필요하다. 그래서 **읽기 전용 `GET /api/servers`만 2단계로 앞당긴다.** 3단계는 사고 발생과 호출 제한 쪽으로 바뀐다. 틀렸을 때 비용: 3단계 범위 문서 수정.

## Review Focus

1. `/api/servers`가 실패하면(Supabase 오류, 네트워크 오류) 빈 화면이 아니라 "불러오지 못했어요" 안내가 보인다 (Task 4 테스트).
2. 환경변수가 없을 때 서버 함수가 500을 돌려주되 응답에 변수 이름이나 키가 나오지 않는다 (Task 3 테스트).
3. GET이 아닌 요청은 405로 거절한다 (Task 3 테스트).
4. Supabase가 예상과 다른 모양(배열이 아님, 칸 누락)을 돌려줘도 서버 함수가 죽지 않고 502를 돌려준다 (Task 2·3 테스트).
5. 응답 JSON과 헤더 어디에도 키 값이 없다 (Task 3 테스트).

---

## File Structure

```
supabase/001_servers.sql       테이블, 가상 자료 4건, 잠금
lib/servers-query.mjs          fetchServers: Supabase REST 읽기 + 모양 변환
api/servers.js                 GET /api/servers 서버 함수 (얇은 껍데기)
public/servers.mjs             statusLabel만 남김 (SERVERS 제거)
public/rack.mjs                renderError 추가
public/app.js                  /api/servers를 읽어 그린다
test/fixtures.mjs              테스트용 가상 서버 4대 (public에 두지 않음)
test/sql.test.mjs, servers-query.test.mjs, api-servers.test.mjs
```

---

### Task 1: 테이블·자료·잠금 SQL

**Files:**
- Create: `supabase/001_servers.sql`, `test/sql.test.mjs`

**Interfaces:**
- Produces: 테이블 `public.servers(id text primary key, name text not null, slot int not null, status text not null check (status in ('ok','warn','down')), temp_c numeric not null, fan_ok boolean not null, owner_id uuid, updated_at timestamptz not null default now())`, 가상 자료 4건 (1단계의 `SERVERS`와 같은 값)

- [ ] **Step 1: 실패하는 테스트를 쓴다.** `test/sql.test.mjs`: SQL 파일을 읽어 `test('RLS를 켠다')`: `alter table public.servers enable row level security`(대소문자 무시)가 있다. `test('anon과 authenticated의 권한을 회수한다')`: `revoke all on table public.servers from anon, authenticated`가 있고 `grant`라는 단어가 없다. `test('서버 4건을 넣는다')`: `insert into public.servers` 값 행이 4개(`web-01`, `app-02`, `db-01`, `cache-01` 포함). `test('owner_id에 외래키를 걸지 않는다')`: `references`가 없다.
- [ ] **Step 2: 실패 확인.** `node --test test/sql.test.mjs` → 파일 없음 FAIL.
- [ ] **Step 3: SQL 작성.** 위 Interfaces의 테이블, `insert`(값은 1단계 `public/servers.mjs`의 `SERVERS`와 동일), RLS 켜기, revoke. 다시 실행해도 안전하게 `create table if not exists`와 `on conflict (id) do nothing`을 쓴다.
- [ ] **Step 4: 통과 확인.** `node --test test/sql.test.mjs` → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat: servers 테이블 SQL과 잠금"`

---

### Task 2: Supabase 읽기 함수

**Files:**
- Create: `lib/servers-query.mjs`, `test/servers-query.test.mjs`, `test/fixtures.mjs`

**Interfaces:**
- Produces:
  - `test/fixtures.mjs`: `export const ROWS` (DB 모양 4행: `id,name,slot,status,temp_c,fan_ok`), `export const SERVERS` (화면 모양 4대: `id,name,slot,status,tempC,fanOk`)
  - `export async function fetchServers({ url, key, fetchImpl = fetch }): Promise<Array<{id,name,slot,status,tempC,fanOk}>>` — `GET {url}/rest/v1/servers?select=id,name,slot,status,temp_c,fan_ok&order=slot.asc`, 헤더 `apikey`와 `Authorization: Bearer <key>`. 응답이 ok가 아니거나 JSON이 배열이 아니거나 칸이 빠지면 `throw new Error('upstream')`(메시지에 키·URL 없음).

- [ ] **Step 1: 실패하는 테스트를 쓴다.** `fetchImpl`에 가짜 함수를 넣는다. `test('DB 행을 화면 모양으로 바꾼다')`: `ROWS` → `SERVERS`와 deepEqual. `test('요청에 슬롯 정렬과 두 헤더가 있다')`: 가짜 fetch가 받은 URL에 `order=slot.asc`, 헤더에 `apikey`와 `Authorization`. `test('ok가 아닌 응답은 upstream 오류')`: `{ok:false,status:500}` → rejects `/upstream/`. `test('배열이 아니면 upstream 오류')`: `{}`. `test('칸이 빠진 행은 upstream 오류')`: `temp_c` 없음. `test('오류 메시지에 키가 없다')`: 키 `SECRET123`을 넣고 실패시킨 뒤 `error.message`에 `SECRET123` 없음.
- [ ] **Step 2: 실패 확인.** `node --test test/servers-query.test.mjs` → import 실패 FAIL.
- [ ] **Step 3: 구현.** 변환 시 `status`가 허용값이 아니어도 그대로 둔다(화면이 `unknown`으로 처리).
- [ ] **Step 4: 통과 확인.** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat: Supabase 서버 목록 읽기"`

---

### Task 3: 서버 함수

**Files:**
- Create: `api/servers.js`, `test/api-servers.test.mjs`

**Interfaces:**
- Consumes: `fetchServers` (Task 2)
- Produces: `export default async function handler(req, res, deps = { env: process.env, fetchServers })` — 응답: `200 {"servers":[...]}`, 405(GET 아님, 헤더 `Allow: GET`), 500 `{"error":"설정 오류"}`(환경변수 `SUPABASE_URL` 또는 `SUPABASE_SERVICE_ROLE_KEY` 없음), 502 `{"error":"불러오지 못했어요"}`(`fetchServers` 실패). 모든 응답에 `Cache-Control: no-store`.

- [ ] **Step 1: 실패하는 테스트를 쓴다.** 가짜 `req`, `res`(상태·헤더·본문 기록)와 가짜 `deps`. `test('GET이면 200과 서버 목록')`, `test('POST는 405와 Allow 헤더')`, `test('환경변수가 없으면 500이고 응답에 변수 이름이나 키가 없다')`(본문 문자열에 `SUPABASE` 없음), `test('upstream 실패는 502')`, `test('응답과 헤더에 키 값이 없다')`(키 `SECRET123` 사용, 본문과 모든 헤더 값에 없음), `test('Cache-Control no-store')`.
- [ ] **Step 2: 실패 확인.** → FAIL.
- [ ] **Step 3: 구현.** 얇게: 메서드 검사, 환경변수 검사, `deps.fetchServers` 호출, 응답.
- [ ] **Step 4: 비밀 검사 패턴을 맞춘다.** 서버 함수가 환경변수 **이름** `SUPABASE_SERVICE_ROLE_KEY`를 쓰므로 `test/repo.test.mjs`의 `/SUPABASE_SERVICE/`를 `/SUPABASE_SERVICE_ROLE_KEY\s*[=:]\s*['"]?\w{8,}/`(이름이 아니라 값이 붙은 경우)로 바꾼다. 이름만 있는 `api/servers.js`는 통과해야 하고, `SUPABASE_SERVICE_ROLE_KEY=abcdefgh12345`가 든 파일은 잡혀야 한다(임시 파일로 확인 후 삭제).
- [ ] **Step 5: 통과 확인.** `npm test` → 모두 PASS.
- [ ] **Step 6: Commit.** `git commit -m "feat: GET /api/servers 서버 함수"`

---

### Task 4: 화면이 API만 읽게 바꾸고 공개 파일에서 데이터 제거

**Files:**
- Modify: `public/servers.mjs`(SERVERS 삭제, `statusLabel` 유지), `public/rack.mjs`(`renderError()` 추가), `public/app.js`, `test/servers.test.mjs`, `test/rack.test.mjs`(`SERVERS`를 `test/fixtures.mjs`에서 import)
- Create: `test/no-state-in-public.test.mjs`

**Interfaces:**
- Consumes: `SERVERS` (fixtures), `/api/servers` (Task 3)
- Produces: `export function renderError(): string` → `<p class="empty">불러오지 못했어요</p>`

- [ ] **Step 1: 실패하는 테스트를 쓴다.** `test/no-state-in-public.test.mjs`: `public/` 아래 모든 파일에 `web-01`, `app-02`, `db-01`, `cache-01`이 없다. `test/rack.test.mjs`에 `test('renderError는 불러오지 못했어요 안내를 돌려준다')`. 기존 두 테스트는 import만 fixtures로 바꾼다. `servers.test.mjs`는 `statusLabel` 테스트만 남기고 데이터 테스트는 `test/fixtures.mjs` 대상으로 옮긴다.
- [ ] **Step 2: 실패 확인.** `npm test` → 새 두 테스트 FAIL (데이터가 아직 public에 있고 `renderError` 없음).
- [ ] **Step 3: 구현.** `app.js`는 `fetch('/api/servers')`가 ok이고 `servers` 배열이 있으면 `renderRack`, 아니면 `renderError`. 로딩 중에는 "불러오는 중…"을 보여 준다.
- [ ] **Step 4: 통과 확인.** `npm test` → 모두 PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat: 화면이 /api/servers만 읽고 공개 파일에서 데이터 제거"`

---

### Task 5: Supabase 준비와 배포 (사용자 작업 + 확인)

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 사용자가 Supabase에서 새 프로젝트를 만든다.** 이름 예: `server-room-agent`. 방어전 프로젝트와 별개. 데이터베이스 비밀번호는 사용자만 안다. 리전은 가까운 곳(예: Seoul).
- [ ] **Step 2: 사용자가 SQL Editor에서 `supabase/001_servers.sql` 내용을 붙여 넣고 Run.** 왼쪽 메뉴 **SQL Editor → New query → 붙여넣기 → Run**. 성공 메시지 확인.
- [ ] **Step 3: 잠금 확인 쿼리를 실행한다.** `select relrowsecurity from pg_class where oid = 'public.servers'::regclass;` → `true`. `select count(*) from public.servers;` → `4`. 결과를 사용자가 알려 준다.
- [ ] **Step 4: 사용자가 Vercel 프로젝트 `server-room-agent`의 Settings → Environment Variables에 두 값을 넣는다.** `SUPABASE_URL`(Project Settings → API의 Project URL), `SUPABASE_SERVICE_ROLE_KEY`(같은 화면의 `service_role` 키, **Sensitive** 체크). 값은 사용자가 직접 입력하고 채팅에 붙여 넣지 않는다. 넣은 뒤 Redeploy.
- [ ] **Step 5: push 승인 후 `git push`.** Vercel 자동 배포.
- [ ] **Step 6: 확인.** `curl -s https://server-room-agent.vercel.app/api/servers` → JSON에 서버 4대, 본문에 `service_role`·`eyJ` 없음. 브라우저에서 서버 4대가 보임. `curl -s -o /dev/null -w "%{http_code}" -X POST https://server-room-agent.vercel.app/api/servers` → `405`. `https://server-room-agent.vercel.app/servers.mjs`에 `web-01` 없음. `/supabase/001_servers.sql` → `404`.
- [ ] **Step 7: README 단계 기록 2단계를 `완료`로, 완료 기준 3개를 체크하고 커밋·push(승인 후). Notion 진행 기록에 적는다.**
