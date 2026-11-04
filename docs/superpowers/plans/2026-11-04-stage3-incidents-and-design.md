# 서버실 AI 부사수 — 3단계 (사고 발생 + 호출 제한 + 서버실 디자인) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 화면에서 서버 사고(온도 상승, 디스크 경고, 네트워크 끊김)를 일으키고 초기 상태로 되돌릴 수 있게 하며, 호출 제한을 걸고, 화면을 서버실처럼 보이게 만든다.

**Architecture:** 2단계의 Supabase REST 읽기를 공용 함수(`lib/supabase-rest.mjs`)로 빼고, 사고 효과를 계산하는 순수 함수(`lib/incident-effects.mjs`)와 두 서버 함수(`api/incidents.js`, `api/reset.js`)를 더한다. 호출 제한은 `incidents` 테이블의 최근 건수로 센다(서버리스라 메모리에 둘 수 없다). 화면은 버튼으로 이 함수만 부르고, 디자인은 CSS로 서버 앞판을 그린다.

**Tech Stack:** Node ESM (의존성 없음), `node:test`, Supabase REST, Vercel Node 함수, 순수 HTML/CSS/JS.

**Spec:** `docs/superpowers/specs/2026-11-03-server-room-agent-design.md` (4·5·6장), `docs/superpowers/plans/2026-11-03-stage2-supabase.md`

## Global Constraints

- 2단계의 제약을 모두 이어간다: 서버 전용 키는 Vercel 환경변수에만, 공개 파일에 서버 상태 데이터 없음, 데이터는 가상, 화면 문구는 한국어, 커밋 메시지는 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` 줄로 끝낸다.
- `anon`·`authenticated`에는 새 테이블·칸에 권한을 주지 않는다. 읽기·쓰기는 서버 전용 역할(`service_role`)에만 필요한 만큼 준다.
- 사고 종류는 `temp`, `disk`, `network` 세 가지뿐이다. 서버 id는 DB에 있는 4대만 허용한다.
- 호출 제한: 같은 10분 안에 사고 발생 요청은 최대 10건. 초과하면 429.
- 외부 이미지, 폰트, 라이브러리를 쓰지 않는다 (CSS만).
- 3단계 완료 기준: 화면 버튼으로 사고를 만들고 되돌릴 수 있고, 잘못된 입력과 한도 초과가 거절되며, 화면이 서버실처럼 보인다.

## Rulings

- **Ruling:** 서버리스 함수는 메모리를 공유하지 않으므로 호출 제한은 DB의 `incidents` 테이블 건수로 센다. 정확한 사용자별 제한이 아니라 **전체 공통 한도**다(공개 데모 남용 방지용). 틀렸을 때 비용: 방문자가 많으면 한도에 자주 걸림 → 숫자 조정.
- **Ruling:** 초기 상태 복구(`reset`)는 한도 없이 허용한다. 항상 같은 4행으로 덮어쓰는 멱등 동작이라 남용해도 해가 없다.
- **Ruling:** 서버 상태 초기값은 `lib/baseline.mjs`(서버 전용)와 `supabase/001_servers.sql`에 둘 다 있다. 둘이 어긋나지 않게 테스트로 비교한다.

## Review Focus

1. `type`이 허용 목록에 없으면 400, 서버 id가 DB에 없으면 404 (Task 3).
2. JSON이 아니거나 객체가 아닌 요청 본문은 400 (Task 3).
3. GET 등 허용하지 않는 메서드는 405 (Task 3, 4).
4. 한도를 넘으면 429이고 DB를 바꾸지 않는다 (Task 3).
5. 어떤 응답에도 키가 없고 오류 메시지에 DB 주소·키가 없다 (Task 3, 4).
6. 사고를 두 번 연속 일으켜도 상태가 깨지지 않고, 복구는 몇 번이든 같은 결과다 (Task 2, 4).
7. 서버가 하나도 없거나 `issue`가 모르는 값이어도 화면이 깨지지 않는다 (Task 5, 6).

---

## File Structure

```
supabase/002_incidents.sql        incidents 테이블, servers.issue 칸, 잠금과 권한
lib/supabase-rest.mjs             restRequest, authHeaders (공용)
lib/servers-query.mjs             공용 함수를 쓰도록 정리, issue 칸 추가
lib/incident-effects.mjs          INCIDENT_TYPES, incidentPatch (순수)
lib/baseline.mjs                  초기 서버 4대 (서버 전용)
api/incidents.js                  POST /api/incidents
api/reset.js                      POST /api/reset
public/rack.mjs                   서버 앞판 마크업, issue 표시
public/app.js                     버튼 연결
public/index.html, style.css      서버실 디자인과 사고 패널
test/…                            각 파일의 시험
```

---

### Task 1: 테이블·칸·권한 SQL

**Files:**
- Create: `supabase/002_incidents.sql`, `test/sql002.test.mjs`

**Interfaces:**
- Produces: `public.incidents(id bigint generated always as identity primary key, server_id text not null, type text not null check (type in ('temp','disk','network')), started_at timestamptz not null default now(), resolved_at timestamptz)`, `public.servers.issue text` (null 또는 사고 종류)

- [ ] **Step 1: 실패하는 테스트를 쓴다.** `test/sql002.test.mjs`: SQL 파일에 `alter table public.servers add column if not exists issue text`, `create table if not exists public.incidents`, `enable row level security`(incidents), `revoke all on table public.incidents from anon, authenticated`, `grant select, insert, update on table public.incidents to service_role`, `grant update on table public.servers to service_role`가 있고, `grant`가 `anon`·`authenticated`를 대상으로 하지 않으며, `references`가 없다.
- [ ] **Step 2: 실패 확인.** `node --test test/sql002.test.mjs` → 파일 없음 FAIL.
- [ ] **Step 3: SQL 작성.** 다시 실행해도 안전하게(`if not exists`). `incidents`에 `generated always as identity`를 쓰므로 서버 전용 역할이 시퀀스를 쓸 수 있게 `grant usage, select on all sequences in schema public to service_role`도 둔다(테스트에 포함).
- [ ] **Step 4: 통과 확인.** `npm test` → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat: incidents 테이블과 servers.issue 칸 SQL"`

---

### Task 2: 공용 REST 함수와 사고 효과

**Files:**
- Create: `lib/supabase-rest.mjs`, `lib/incident-effects.mjs`, `lib/baseline.mjs`, `test/incident-effects.test.mjs`, `test/baseline.test.mjs`
- Modify: `lib/servers-query.mjs`, `test/fixtures.mjs`, `test/servers-query.test.mjs`

**Interfaces:**
- Produces:
  - `export function authHeaders(key: string): Record<string,string>` (2단계 규칙 그대로: `eyJ`로 시작하면 두 헤더, 아니면 `apikey`만)
  - `export async function restRequest({ url, key, path, method = 'GET', body, headers = {}, fetchImpl = fetch }): Promise<{ status: number, data: any, count?: number }>` — 네트워크 오류·`ok`가 아닌 응답은 `Error('upstream')`에 `status`를 담아 던진다(키·주소 없음). `Prefer: count=exact`를 줄 때 `content-range`에서 `count`를 읽는다.
  - `export const INCIDENT_TYPES = ['temp','disk','network']`
  - `export function incidentPatch(type: string): { status: string, tempC?: number, fanOk?: boolean, issue: string }` — `temp` → `{status:'warn', tempC:86, fanOk:false, issue:'temp'}`, `disk` → `{status:'warn', issue:'disk'}`, `network` → `{status:'down', issue:'network'}`. 모르는 종류는 `throw new Error('unknown incident type')`.
  - `export const BASELINE: Array<{id,name,slot,status,tempC,fanOk,issue:null}>` (1단계 값 4대)
  - `fetchServers` 반환 항목에 `issue: string|null`이 추가된다.

- [ ] **Step 1: 실패하는 테스트를 쓴다.** `incident-effects.test.mjs`: 세 종류의 패치 값(위 값 그대로), 모르는 종류는 throws, `INCIDENT_TYPES` 길이 3. `baseline.test.mjs`: `BASELINE`이 4대이고 id·상태·온도가 `supabase/001_servers.sql`의 insert 값과 같다(SQL에서 정규식으로 `('web-01', ..., 'ok', 38, true)` 형태를 뽑아 비교). `servers-query.test.mjs`에 `issue`가 있는 행과 `null`인 행 모두 변환되는 테스트를 더한다. `fixtures.mjs`의 `ROWS`에 `issue: null`, `SERVERS`에 `issue: null`을 더한다.
- [ ] **Step 2: 실패 확인.** `npm test` → 새 시험 FAIL.
- [ ] **Step 3: 구현.** `restRequest`가 2단계 `fetchServers`의 오류 규칙(키·주소 비노출)을 그대로 따르게 하고, `servers-query.mjs`는 `restRequest`를 쓰도록 정리한다. 기존 2단계 시험은 모두 그대로 통과해야 한다. `servers-query`의 선택 칸에 `issue`를 더한다(`select=id,name,slot,status,temp_c,fan_ok,issue`).
- [ ] **Step 4: 통과 확인.** `npm test` → 모두 PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat: 공용 REST 함수와 사고 효과"`

---

### Task 3: 사고 발생 서버 함수

**Files:**
- Create: `api/incidents.js`, `lib/rate-limit.mjs`, `test/api-incidents.test.mjs`

**Interfaces:**
- Consumes: `restRequest`, `incidentPatch`, `INCIDENT_TYPES`, `fetchServers`
- Produces:
  - `export const WINDOW_MINUTES = 10`, `export const MAX_INCIDENTS = 10` (`lib/rate-limit.mjs`)
  - `export async function isOverLimit({ url, key, now = new Date(), restRequest }): Promise<boolean>` — `incidents?select=id&started_at=gte.<now-10분 ISO>` 를 `Prefer: count=exact`로 부르고 `count >= MAX_INCIDENTS`이면 `true`
  - `export default async function handler(req, res, deps)` — `POST` 본문 `{ type, serverId }`. 응답: 405 / 500(설정 없음) / 400(본문이 객체가 아님, `type`이 목록 밖) / 404(서버 id 없음) / 429(`{"error":"잠시 후에 다시 해 주세요"}`) / 502 / 200 `{"servers":[...]}`. 모든 응답에 `Cache-Control: no-store`. 순서: 메서드 → 설정 → 본문 검증 → 서버 존재 확인 → 한도 → 사고 기록 → 서버 갱신 → 목록 반환.

- [ ] **Step 1: 실패하는 테스트를 쓴다.** 가짜 `req`(`method`, `body`), 가짜 `res`, 가짜 `deps`(`env`, `fetchServers`, `restRequest`가 호출을 기록)로:
  - 정상: `{type:'temp', serverId:'db-01'}` → 200, 기록된 요청에 `incidents` POST와 `servers?id=eq.db-01` PATCH(본문 `incidentPatch('temp')`)가 있다
  - `GET` → 405 + `Allow: POST`
  - 환경변수 없음 → 500, 본문에 `SUPABASE` 없음
  - 본문이 문자열·`null`·배열 → 400
  - `type: 'fire'` → 400, DB 요청 없음
  - `serverId`가 목록에 없음 → 404, 사고 기록 없음
  - 한도 초과(`isOverLimit`이 true가 되도록 `count` 10) → 429, 사고 기록·서버 갱신 없음
  - upstream 실패 → 502, 본문에 키(`SECRET123`)·주소 없음
  - 모든 응답의 `Cache-Control`이 `no-store`
  - 같은 사고를 두 번 연속 요청해도 두 번 다 200
  - `rate-limit` 단독: 건수 9 → false, 10 → true, 요청 URL에 `started_at=gte.`와 계산한 시각 포함
- [ ] **Step 2: 실패 확인.** → FAIL.
- [ ] **Step 3: 구현.** `res.json` 본문은 `servers` 배열 또는 `error`만.
- [ ] **Step 4: 통과 확인.** `npm test` → 모두 PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat: POST /api/incidents와 호출 제한"`

---

### Task 4: 초기 상태 복구 서버 함수

**Files:**
- Create: `api/reset.js`, `test/api-reset.test.mjs`

**Interfaces:**
- Consumes: `restRequest`, `BASELINE`, `fetchServers`
- Produces: `export default async function handler(req, res, deps)` — `POST`만. 4대를 `BASELINE`으로 PATCH(`status, temp_c, fan_ok, issue:null`)하고 열린 사고(`resolved_at is null`)를 `resolved_at=now()`로 닫은 뒤 `200 {"servers":[...]}`. 405 / 500 / 502 / `no-store`는 Task 3과 같다.

- [ ] **Step 1: 실패하는 테스트를 쓴다.** 정상 200과 요청 5건(서버 4대 PATCH + 사고 닫기 1건), GET은 405, 환경변수 없음 500, upstream 502, 두 번 연속 호출해도 같은 결과, 응답에 키 없음.
- [ ] **Step 2: 실패 확인.** → FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인.** `npm test` → 모두 PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat: POST /api/reset 초기 상태 복구"`

---

### Task 5: 화면 버튼 연결과 사고 표시

**Files:**
- Modify: `public/rack.mjs`, `public/app.js`, `public/index.html`, `test/rack.test.mjs`
- Create: `test/app-incident-ui.test.mjs`

**Interfaces:**
- Consumes: `/api/servers`, `/api/incidents`, `/api/reset`
- Produces:
  - `export function issueLabel(issue: string|null|undefined): string` (`public/servers.mjs`) — `temp`→`온도 상승`, `disk`→`디스크 경고`, `network`→`네트워크 끊김`, `null`/모름→빈 문자열
  - `renderRack`는 서버에 `issue`가 있으면 `<span class="issue">{label}</span>`를 더한다(이스케이프).
  - `export function renderIncidentPanel(servers): string` (`public/rack.mjs`) — 서버 `<select id="incident-server">`, 종류 `<select id="incident-type">`(3개), 버튼 `#incident-go`와 `#reset-go`. 서버가 없으면 패널을 비운다.

- [ ] **Step 1: 실패하는 테스트를 쓴다.** `issueLabel` 세 값과 모르는 값·`null`, `renderRack`가 `issue:'temp'`인 서버에 `온도 상승`을 넣고 `issue`의 HTML은 이스케이프, `renderIncidentPanel`이 서버 4개 옵션과 종류 3개 옵션, 빈 목록이면 빈 문자열, 모르는 `issue`('boom')에도 깨지지 않음(`app-incident-ui.test.mjs`는 `app.js`가 `/api/incidents`와 `/api/reset`을 `POST`로 부르는 코드 문자열을 포함하는지 확인).
- [ ] **Step 2: 실패 확인.** → FAIL.
- [ ] **Step 3: 구현.** `app.js`: 로드 시 목록과 패널을 그린다. 버튼을 누르면 `POST`하고 성공하면 응답의 `servers`로 다시 그린다. `429`면 "잠시 후에 다시 해 주세요", 그 밖의 실패는 "불러오지 못했어요"를 패널 아래에 보여 준다. 요청 중에는 버튼을 비활성화한다.
- [ ] **Step 4: 통과 확인.** `npm test` → 모두 PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat: 화면에서 사고 발생과 복구"`

---

### Task 6: 서버실 디자인 리뉴얼

**Files:**
- Modify: `public/rack.mjs`, `public/style.css`, `public/index.html`, `test/rack.test.mjs`

**Interfaces:**
- Consumes: Task 5의 `renderRack`, `renderIncidentPanel`
- Produces: 서버 한 대는 `<li class="server">` 안에 앞판(`.faceplate`)으로 그려진다. `data-server-id`와 `led led-{status}` 클래스, 이름, `{tempC}°C`, 상태 라벨은 그대로 유지한다. 앞판 안에 드라이브 칸 `.bay`(4개), 통풍구 `.vent`, 라벨 `.plate`가 들어간다.

- [ ] **Step 1: 실패하는 테스트를 쓴다.** 기존 시험이 그대로 통과하는 위에, `renderRack(SERVERS)`가 서버마다 `.faceplate` 하나, `.bay` 4개, `.vent` 하나를 낸다. `style.css`에 `.led-warn`과 `.led-down` 외에 `.faceplate`, `.bay`, `.vent` 규칙이 있다. `prefers-reduced-motion` 블록이 새 애니메이션(LED 깜빡임, 필요하면 통풍 흐름)도 모두 `animation: none`으로 끈다(CSS 안의 `animation:` 선언이 있는 모든 규칙이 그 블록에서 꺼지는지 정규식으로 확인).
- [ ] **Step 2: 실패 확인.** → FAIL.
- [ ] **Step 3: 구현.** 방향: 어두운 서버실 바닥(타일 격자), 랙 양옆 레일, 장비 앞판(금속 느낌 그라데이션, 드라이브 칸, 통풍구 줄무늬), 상태 LED 줄, 주의/장애 장비는 테두리 빛, 위쪽에 서버실 이름판. 핑크·노랑 포인트의 귀여운 톤을 유지한다. 반응형(폭 375px에서 가로 스크롤 없음). 외부 자원 없음.
- [ ] **Step 4: 통과 확인.** `npm test` → 모두 PASS.
- [ ] **Step 5: 화면 확인.** `python -m http.server 8080 -d public`으로 켜고 브라우저로 폭 375와 데스크톱을 본다. API가 없으니 개발자 도구에서 가짜 응답을 끼우거나 `renderRack` 결과를 직접 넣어 본다. 가로 스크롤이 없는지(`scrollWidth <= innerWidth`) 확인한다.
- [ ] **Step 6: Commit.** `git commit -m "feat: 서버실 디자인 리뉴얼"`

---

### Task 7: Supabase 반영, 배포, 확인, 기록 (사용자 작업 포함)

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 사용자가 Supabase SQL Editor에서 `supabase/002_incidents.sql` 전체를 실행한다.** `Success`를 확인한다.
- [ ] **Step 2: 확인 쿼리.** `select relrowsecurity from pg_class where oid = 'public.incidents'::regclass;` → `true`. `select column_name from information_schema.columns where table_name='servers' and column_name='issue';` → 1행. 결과를 사용자가 알려 준다.
- [ ] **Step 3: push 승인 후 `git push`.** Vercel 자동 배포(환경변수는 이미 있음, 재배포 불필요).
- [ ] **Step 4: 확인.** `GET /api/servers`에 `issue` 칸이 나온다. `POST /api/incidents`에 `{"type":"fire","serverId":"db-01"}`는 400, `{"type":"temp","serverId":"zzz"}`는 404, `GET`은 405. 정상 사고 한 번 뒤 `db-01`의 `issue`가 `temp`. `POST /api/reset` 뒤 4대가 초기값으로 돌아온다. 한도 시험은 사고 11건을 연달아 보내 11번째가 429인지 확인한 뒤 `reset`으로 되돌린다. 응답·화면 코드에 키 흔적이 없다.
- [ ] **Step 5: 화면 확인.** 브라우저에서 서버실 디자인, 사고 버튼, 복구 버튼, 폭 375px에서의 모양을 본다.
- [ ] **Step 6: README 단계 기록 3단계를 `완료`로, 완료 기준 체크, Notion 진행 기록 갱신. 커밋하고 push(승인 후).**
