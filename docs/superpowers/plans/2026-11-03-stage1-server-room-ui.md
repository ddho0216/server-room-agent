# 서버실 AI 부사수 — 1단계 (서버실 화면 + 배포) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서버 랙 1개와 서버 4대가 보이는 정적 서버실 화면을 새 저장소에 만들고 Vercel에 배포한다.

**Architecture:** 빌드 단계 없는 정적 사이트다. 가상 서버 데이터(`public/servers.mjs`)를 순수 함수 `renderRack`(`public/rack.mjs`)이 HTML로 바꾸고, `public/app.js`가 페이지에 꽂는다. 2단계에서 데이터 출처만 Supabase로 바뀐다. 방어전 저장소처럼 Node ESM + `node --test`, `AGENTS.md`, README 단계 기록 구조를 따른다.

**Tech Stack:** Node ESM (v24, 의존성 없음), `node:test`, 순수 HTML/CSS/JS, GitHub, Vercel 정적 배포.

**Spec:** `docs/superpowers/specs/2026-11-03-server-room-agent-design.md` (3장 구조, 7장 1단계 완료 기준)

## Global Constraints

- 새 저장소, 새 폴더 `C:\Users\User\Documents\server-room-agent`. 방어전 저장소·Supabase·Vercel과 분리한다. 강사 자료는 복사하지 않는다.
- 서버 데이터는 전부 가상이다. 실제 회사·고객사·센터 이름을 넣지 않는다.
- 비밀 키·토큰은 코드, 로그, Git, 답변에 넣지 않는다. 1단계에는 비밀이 필요 없다.
- 화면에 키 없음, DB 직접 접근 없음.
- 서버는 4대, 랙은 1개.
- 1단계 완료 기준: Vercel 주소에서 서버 4대가 보이고, 저장소가 공개이며, README에 단계 기록이 있다.
- 커밋 메시지는 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` 줄로 끝낸다.
- 모든 사용자 화면 문구는 한국어.

## Review Focus

1. 서버 이름에 `<script>` 같은 HTML이 들어와도 실행되지 않고 글자로 보인다 (Task 3 테스트).
2. 서버 목록이 비어 있으면 빈 화면이 아니라 "서버가 없어요" 안내가 보인다 (Task 3 테스트).
3. 알 수 없는 상태값이 와도 깨지지 않고 "알 수 없음"과 `led-unknown` 클래스로 보인다 (Task 2·3 테스트).
4. 모션을 줄이는 설정(`prefers-reduced-motion`)에서 깜빡임이 꺼진다 (Task 3 테스트).
5. 폭 375px에서 가로 스크롤이 생기지 않는다 (Task 3 수동 확인).

---

## File Structure

```
server-room-agent/
  AGENTS.md              작업 규칙 (한 번에 하나, 비밀 금지, 실행 안 한 것은 완료라 말하지 않기)
  README.md              현재 기능, 실행 방법, 단계 기록
  package.json           type: module, scripts.test
  vercel.json            정적 배포 설정
  .gitignore
  docs/superpowers/specs/…, plans/…   설계 문서와 이 계획
  public/
    index.html           페이지 뼈대
    style.css            랙, LED, 반응형
    servers.mjs          가상 서버 4대, statusLabel
    rack.mjs             escapeHtml, renderRack (순수 함수)
    app.js               렌더링 연결
  test/
    repo.test.mjs        .gitignore, 비밀 패턴 검사
    servers.test.mjs
    rack.test.mjs
```

---

### Task 1: 저장소 뼈대

**Files:**
- Create: `package.json`, `.gitignore`, `AGENTS.md`, `README.md`, `vercel.json`, `test/repo.test.mjs`
- Copy: 설계 문서와 이 계획을 `docs/superpowers/` 아래로

**Interfaces:**
- Produces: `npm test` = `node --test test/` (이후 모든 태스크가 사용)

- [ ] **Step 1: 세션 폴더를 `C:\Users\User\Documents\server-room-agent`로 옮긴다.** 폴더를 만든 뒤 `change_directory`로 이동하고 `git init -b main`. 사용자 승인 필요.
- [ ] **Step 2: 실패하는 테스트를 쓴다.** `test/repo.test.mjs`의 `test('.gitignore는 .env와 node_modules와 .vercel을 막는다')`: `.gitignore`를 읽어 세 항목이 각각 한 줄로 있는지 단언한다. `test('추적 파일에 비밀 패턴이 없다')`: `git ls-files`의 모든 텍스트 파일에서 `sk-ant-`, `SUPABASE_SERVICE`, `service_role`, `eyJ` 로 시작하는 JWT 모양(`/eyJ[A-Za-z0-9_-]{20,}/`)이 없음을 단언한다 (`AGENTS.md`와 `test/repo.test.mjs` 자신은 제외).
- [ ] **Step 3: 실패 확인.** `npm test` → `.gitignore` 없음으로 FAIL.
- [ ] **Step 4: 파일을 만든다.** `package.json`(`"type":"module"`, `"scripts":{"test":"node --test test/"}`, `private: true`), `.gitignore`, `vercel.json`(`{"outputDirectory":"public"}`), `AGENTS.md`(방어전 `AGENTS.md`의 공통 규칙 중 "한 번에 하나", "비밀 금지", "실행 안 한 것은 완료라 하지 않기", "되돌리기 시 `git reset --hard` 금지", "저장점 시 README 갱신"만 서버실 용어로 새로 쓴다. 문장을 복사하지 않는다), `README.md`(제목, 한 줄 설명, "현재 기능", "실행 방법", "단계 기록" 표 — 1단계 행은 `진행 중`).
- [ ] **Step 5: 통과 확인.** `npm test` → PASS.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "chore: 저장소 뼈대와 작업 규칙"`

---

### Task 2: 가상 서버 데이터

**Files:**
- Create: `public/servers.mjs`, `test/servers.test.mjs`

**Interfaces:**
- Produces:
  - `export const SERVERS: Array<{ id: string, name: string, slot: number, status: 'ok'|'warn'|'down', tempC: number, fanOk: boolean }>`
  - `export function statusLabel(status: string): string` — `ok`→`정상`, `warn`→`주의`, `down`→`장애`, 그 외→`알 수 없음`

- [ ] **Step 1: 실패하는 테스트를 쓴다.** `test/servers.test.mjs`:
  - `test('서버는 4대이고 id가 모두 다르다')`: `SERVERS.length === 4`, `new Set(ids).size === 4`
  - `test('각 서버에 필요한 칸이 있다')`: `typeof tempC === 'number'`, `typeof fanOk === 'boolean'`, `status`는 `['ok','warn','down']` 중 하나, `slot`은 1~4 정수
  - `test('주의 상태 서버가 1대 있다')`: `SERVERS.filter(s => s.status==='warn').length === 1` (화면에 변화를 주기 위해)
  - `test('statusLabel')`: `'ok'→'정상'`, `'warn'→'주의'`, `'down'→'장애'`, `'zzz'→'알 수 없음'`, `undefined→'알 수 없음'`
- [ ] **Step 2: 실패 확인.** `node --test test/servers.test.mjs` → import 실패 FAIL.
- [ ] **Step 3: `public/servers.mjs` 구현.** 이름은 `web-01`, `db-01`, `app-02`, `cache-01` 같은 가상 이름. `warn` 서버는 `tempC` 78, `fanOk: false`. 나머지는 `ok`, 온도 35~45.
- [ ] **Step 4: 통과 확인.** `node --test test/servers.test.mjs` → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat: 가상 서버 4대와 상태 이름"`

---

### Task 3: 랙 화면

**Files:**
- Create: `public/rack.mjs`, `public/index.html`, `public/style.css`, `public/app.js`, `test/rack.test.mjs`

**Interfaces:**
- Consumes: `SERVERS`, `statusLabel` (Task 2)
- Produces:
  - `export function escapeHtml(value: unknown): string` — `& < > " '` 이스케이프
  - `export function renderRack(servers: Array): string` — 서버마다 `<li class="server" data-server-id="{id}">` 안에 LED `<span class="led led-{status}">`, 이름, `{tempC}°C`, 상태 라벨을 담는다. 알 수 없는 상태는 `led-unknown`. 목록이 비면 `<p class="empty">서버가 없어요</p>`.

- [ ] **Step 1: 실패하는 테스트를 쓴다.** `test/rack.test.mjs`:
  - `test('서버 4대가 data-server-id로 나온다')`: `renderRack(SERVERS)`에서 `data-server-id="`가 4번
  - `test('주의 서버에 led-warn이 붙는다')`: 결과에 `led-warn` 1번, `led-ok` 3번
  - `test('이름의 HTML은 글자로 나온다')`: `renderRack([{...SERVERS[0], name:'<script>alert(1)</script>'}])`에 `<script>`가 없고 `&lt;script&gt;`가 있다
  - `test('빈 목록 안내')`: `renderRack([])`에 `서버가 없어요`
  - `test('알 수 없는 상태')`: `status:'boom'`이면 `led-unknown`과 `알 수 없음`
  - `test('모션 줄이기 설정에서 깜빡임을 끈다')`: `public/style.css`에 `prefers-reduced-motion`이 있고 그 블록 안에 `animation: none`이 있다
- [ ] **Step 2: 실패 확인.** `node --test test/rack.test.mjs` → FAIL.
- [ ] **Step 3: `public/rack.mjs` 구현.** 문자열 템플릿, 모든 데이터 값은 `escapeHtml`을 거친다.
- [ ] **Step 4: `index.html`, `style.css`, `app.js` 작성.** `index.html`은 `<ul id="rack">`과 `<script type="module" src="app.js">`, 한국어 제목 "서버실". `app.js`는 `rack` 요소에 `renderRack(SERVERS)`를 넣는다. 스타일: 어두운 서버실 배경, 랙 틀, LED 색(ok 초록, warn 주황 깜빡임, down 빨강, unknown 회색), 귀여운 톤(둥근 모서리, 핑크·노랑 포인트). `@media (prefers-reduced-motion: reduce)`에서 `animation: none`. `meta viewport` 포함.
- [ ] **Step 5: 통과 확인.** `npm test` → 모두 PASS.
- [ ] **Step 6: 화면 확인.** `python -m http.server 8080 -d public`을 백그라운드로 켜고 `http://localhost:8080`을 연다. 서버 4대가 보이고 주황 LED가 깜빡이는지, 폭 375px(`resize_window` mobile)에서 가로 스크롤이 없는지(`document.documentElement.scrollWidth <= window.innerWidth`) 확인한다. 스크린샷을 `docs/screenshots/stage1.png`로 저장한다.
- [ ] **Step 7: Commit.** `git commit -m "feat: 서버 랙 화면"`

---

### Task 4: 저장 지점과 공개

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README 갱신.** "현재 기능"(서버 4대 화면), "실행 방법"(`npm test`, `python -m http.server 8080 -d public`), "가상 자료 안내", "단계 기록" 1단계 행에 완료 기준 3개 체크 칸.
- [ ] **Step 2: `npm test` 전체 PASS 확인.**
- [ ] **Step 3: 사용자가 GitHub에서 공개 저장소 `server-room-agent`를 빈 상태로 만든다** (README 추가 체크 해제). 사용자가 주소를 알려 준다. `gh`가 없으므로 사용자가 웹에서 만든다.
- [ ] **Step 4: Commit.** `git commit -am "docs: 1단계 README"`
- [ ] **Step 5: 사용자 승인 후 `git remote add origin <주소>`와 `git push -u origin main`.** 인증 오류가 나면 첫 오류만 알려 준다.

---

### Task 5: Vercel 배포와 확인

**Files:**
- Modify: `README.md` (배포 주소, 단계 기록)

- [ ] **Step 1: 사용자가 Vercel에서 새 프로젝트로 `server-room-agent` 저장소를 가져온다.** Framework Preset은 `Other`, 환경변수는 없음. 방어전 프로젝트에는 연결하지 않는다.
- [ ] **Step 2: 배포 확인.** 사용자가 알려 준 주소에 대해 `curl -s -o /dev/null -w "%{http_code}" <주소>/` → `200`. `curl -s <주소>/ | grep -c server`로 페이지가 오는지, 이어서 브라우저에서 `document.querySelectorAll('[data-server-id]').length === 4` 확인.
- [ ] **Step 3: 비밀 파일이 열리지 않는지 확인.** `<주소>/.env`, `<주소>/package.json`, `<주소>/AGENTS.md` 요청이 `404`.
- [ ] **Step 4: README에 배포 주소를 적고 1단계 행을 `완료`로, 완료 기준 3개를 체크한다.** 커밋하고 push.
- [ ] **Step 5: Notion 진행 기록(9장)에 날짜, 배포 주소, 결과를 적는다.**
- [ ] **Step 6: 이 계획의 체크 박스를 모두 체크하고, 2단계 계획을 별도 문서로 쓰자고 알린다.**
