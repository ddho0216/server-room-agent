# 보안 점검 기록

배포된 사이트(https://server-room-agent.vercel.app)를 **로그인 없이** 두들겨 본 결과입니다. 점검은 `scripts/attack-check.mjs`가 보냅니다.

```bash
node scripts/attack-check.mjs https://server-room-agent.vercel.app
# 데이터베이스를 공개 주소로 직접 읽는 점검까지 하려면:
SUPABASE_URL=<프로젝트 주소> node scripts/attack-check.mjs https://server-room-agent.vercel.app
```

## 무엇을 점검하나

- 모든 API에 허용하지 않는 메서드(GET, POST, PUT, DELETE)를 보내면 405인가
- 부사수·사고·승인 요청에 이상한 입력(빈 값, 숫자, 배열, `$ne` 객체, `__proto__`, SQL 조각, `../` 경로, 깨진 JSON, 약 300KB 본문)을 보내면 400/404인가. 서버 오류(5xx)는 방어가 아니므로 실패로 본다
- 비밀 파일(`.env`, `package.json`, `lib/…`, `supabase/…`, `.git/config`, `node_modules/…`)이 열리지 않는가
- 공개 파일과 읽기 API 응답에 키나 서버 이름이 없는가
- 데이터베이스를 키 없이·가짜 키로 직접 읽으면 막히는가(`anon` 권한 회수의 증거)

데이터를 바꾸는 요청은 보내지 않습니다(허용된 메서드에 보내는 본문은 전부 잘못된 입력이고, 이는 `test/attack-checks.test.mjs`가 보장합니다).

## 결과 (2026-11-04)

결과: 86/86 통과

| 번호 | 점검 | 요청 | 기대 | 결과 |
|---|---|---|---|---|
| method-post-servers | POST /api/servers는 허용하지 않는다 | POST /api/servers | 405 | 통과 (405) |
| method-put-servers | PUT /api/servers는 허용하지 않는다 | PUT /api/servers | 405 | 통과 (405) |
| method-delete-servers | DELETE /api/servers는 허용하지 않는다 | DELETE /api/servers | 405 | 통과 (405) |
| method-get-incidents | GET /api/incidents는 허용하지 않는다 | GET /api/incidents | 405 | 통과 (405) |
| method-put-incidents | PUT /api/incidents는 허용하지 않는다 | PUT /api/incidents | 405 | 통과 (405) |
| method-delete-incidents | DELETE /api/incidents는 허용하지 않는다 | DELETE /api/incidents | 405 | 통과 (405) |
| method-get-reset | GET /api/reset는 허용하지 않는다 | GET /api/reset | 405 | 통과 (405) |
| method-put-reset | PUT /api/reset는 허용하지 않는다 | PUT /api/reset | 405 | 통과 (405) |
| method-delete-reset | DELETE /api/reset는 허용하지 않는다 | DELETE /api/reset | 405 | 통과 (405) |
| method-get-agent | GET /api/agent는 허용하지 않는다 | GET /api/agent | 405 | 통과 (405) |
| method-put-agent | PUT /api/agent는 허용하지 않는다 | PUT /api/agent | 405 | 통과 (405) |
| method-delete-agent | DELETE /api/agent는 허용하지 않는다 | DELETE /api/agent | 405 | 통과 (405) |
| method-get-approve | GET /api/approve는 허용하지 않는다 | GET /api/approve | 405 | 통과 (405) |
| method-put-approve | PUT /api/approve는 허용하지 않는다 | PUT /api/approve | 405 | 통과 (405) |
| method-delete-approve | DELETE /api/approve는 허용하지 않는다 | DELETE /api/approve | 405 | 통과 (405) |
| method-post-activity | POST /api/activity는 허용하지 않는다 | POST /api/activity | 405 | 통과 (405) |
| method-put-activity | PUT /api/activity는 허용하지 않는다 | PUT /api/activity | 405 | 통과 (405) |
| method-delete-activity | DELETE /api/activity는 허용하지 않는다 | DELETE /api/activity | 405 | 통과 (405) |
| agent-empty-object | 부사수: 빈 객체 | POST /api/agent | 400 | 통과 (400) |
| agent-empty-string | 부사수: 빈 문자열 메시지 | POST /api/agent | 400 | 통과 (400) |
| agent-spaces | 부사수: 공백만 있는 메시지 | POST /api/agent | 400 | 통과 (400) |
| agent-number | 부사수: 숫자 메시지 | POST /api/agent | 400 | 통과 (400) |
| agent-array-body | 부사수: 배열 본문 | POST /api/agent | 400 | 통과 (400) |
| agent-nosql | 부사수: $ne 객체 메시지 | POST /api/agent | 400 | 통과 (400) |
| agent-array-message | 부사수: 배열 메시지 | POST /api/agent | 400 | 통과 (400) |
| agent-too-long | 부사수: 301자 메시지 | POST /api/agent | 400 | 통과 (400) |
| agent-broken-json | 부사수: 깨진 JSON {bad | POST /api/agent | 400 | 통과 (400) |
| agent-proto | 부사수: __proto__ 오염 시도 | POST /api/agent | 400 | 통과 (400) |
| agent-empty-body | 부사수: 빈 본문 | POST /api/agent | 400 | 통과 (400) |
| agent-json-string | 부사수: JSON 문자열 본문 | POST /api/agent | 400 | 통과 (400) |
| agent-huge | 부사수: 아주 큰 본문(약 300KB) | POST /api/agent | 400/413 | 통과 (400) |
| incident-bad-type | 사고: 목록 밖 종류 | POST /api/incidents | 400/404 | 통과 (400) |
| incident-proto-type | 사고: __proto__ 종류 | POST /api/incidents | 400/404 | 통과 (400) |
| incident-sql | 사고: SQL 조각 서버 id (' or '1'='1) | POST /api/incidents | 400/404 | 통과 (404) |
| incident-traversal | 사고: 경로 조작 서버 id (../) | POST /api/incidents | 400/404 | 통과 (404) |
| incident-object-id | 사고: $ne 객체 서버 id | POST /api/incidents | 400/404 | 통과 (400) |
| incident-number-id | 사고: 숫자 서버 id | POST /api/incidents | 400/404 | 통과 (400) |
| incident-unknown-server | 사고: 없는 서버 | POST /api/incidents | 400/404 | 통과 (404) |
| incident-missing | 사고: 칸이 없음 | POST /api/incidents | 400/404 | 통과 (400) |
| incident-broken | 사고: 깨진 JSON | POST /api/incidents | 400/404 | 통과 (400) |
| incident-array | 사고: 배열 본문 | POST /api/incidents | 400/404 | 통과 (400) |
| approve-string-id | 승인: 문자열 id | POST /api/approve | 400 | 통과 (400) |
| approve-negative | 승인: 음수 id | POST /api/approve | 400 | 통과 (400) |
| approve-zero | 승인: 0 id | POST /api/approve | 400 | 통과 (400) |
| approve-float | 승인: 소수 id | POST /api/approve | 400 | 통과 (400) |
| approve-null-id | 승인: null id | POST /api/approve | 400 | 통과 (400) |
| approve-upper | 승인: 대문자 decision | POST /api/approve | 400 | 통과 (400) |
| approve-sql-decision | 승인: SQL 조각 decision | POST /api/approve | 400 | 통과 (400) |
| approve-empty | 승인: 빈 객체 | POST /api/approve | 400 | 통과 (400) |
| approve-broken | 승인: 깨진 JSON | POST /api/approve | 400 | 통과 (400) |
| approve-missing-approve | 승인: 없는 번호 승인 | POST /api/approve | 409 | 통과 (409) |
| approve-missing-reject | 승인: 없는 번호 거절 | POST /api/approve | 409 | 통과 (409) |
| file--env | /.env는 열리지 않는다 | GET /.env | 404 | 통과 (404) |
| file--git-config | /.git/config는 열리지 않는다 | GET /.git/config | 404 | 통과 (404) |
| file-package-json | /package.json는 열리지 않는다 | GET /package.json | 404 | 통과 (404) |
| file-package-lock-json | /package-lock.json는 열리지 않는다 | GET /package-lock.json | 404 | 통과 (404) |
| file-AGENTS-md | /AGENTS.md는 열리지 않는다 | GET /AGENTS.md | 404 | 통과 (404) |
| file-README-md | /README.md는 열리지 않는다 | GET /README.md | 404 | 통과 (404) |
| file-vercel-json | /vercel.json는 열리지 않는다 | GET /vercel.json | 404 | 통과 (404) |
| file-lib-rule-brain-mjs | /lib/rule-brain.mjs는 열리지 않는다 | GET /lib/rule-brain.mjs | 404 | 통과 (404) |
| file-lib-tools-mjs | /lib/tools.mjs는 열리지 않는다 | GET /lib/tools.mjs | 404 | 통과 (404) |
| file-supabase-003-agent-sql | /supabase/003_agent.sql는 열리지 않는다 | GET /supabase/003_agent.sql | 404 | 통과 (404) |
| file-test-repo-test-mjs | /test/repo.test.mjs는 열리지 않는다 | GET /test/repo.test.mjs | 404 | 통과 (404) |
| file-docs-superpowers-specs-2026-11-03-server-room-agent-design-md | /docs/superpowers/specs/2026-11-03-server-room-agent-design.md는 열리지 않는다 | GET /docs/superpowers/specs/2026-11-03-serve… | 404 | 통과 (404) |
| file-node-modules-anthropic-ai-sdk-package-json | /node_modules/@anthropic-ai/sdk/package.json는 열리지 않는다 | GET /node_modules/@anthropic-ai/sdk/package.… | 404 | 통과 (404) |
| file-traversal | 경로 조작(..%2f)은 열리지 않는다 | GET /..%2f..%2fetc%2fpasswd | 400/404 | 통과 (400) |
| file-api-source | /api/agent.js는 소스를 내주지 않는다 | GET /api/agent.js | 404/405 | 통과 (405) |
| static-index | /에는 키나 서버 이름이 없다 | GET / | 200 | 통과 (200) |
| static-app-js | /app.js에는 키나 서버 이름이 없다 | GET /app.js | 200 | 통과 (200) |
| static-rack-mjs | /rack.mjs에는 키나 서버 이름이 없다 | GET /rack.mjs | 200 | 통과 (200) |
| static-servers-mjs | /servers.mjs에는 키나 서버 이름이 없다 | GET /servers.mjs | 200 | 통과 (200) |
| static-style-css | /style.css에는 키나 서버 이름이 없다 | GET /style.css | 200 | 통과 (200) |
| read-servers | /api/servers 응답에 키가 없다 | GET /api/servers | 200 | 통과 (200) |
| read-activity | /api/activity 응답에 키가 없다 | GET /api/activity | 200 | 통과 (200) |
| db-nokey-servers | DB 직접 읽기(키 없음): servers | GET /rest/v1/servers?select=*&limit=1 | 401/403 | 통과 (401) |
| db-badkey-servers | DB 직접 읽기(가짜 키): servers | GET /rest/v1/servers?select=*&limit=1 | 401/403 | 통과 (401) |
| db-nokey-incidents | DB 직접 읽기(키 없음): incidents | GET /rest/v1/incidents?select=*&limit=1 | 401/403 | 통과 (401) |
| db-badkey-incidents | DB 직접 읽기(가짜 키): incidents | GET /rest/v1/incidents?select=*&limit=1 | 401/403 | 통과 (401) |
| db-nokey-action_log | DB 직접 읽기(키 없음): action_log | GET /rest/v1/action_log?select=*&limit=1 | 401/403 | 통과 (401) |
| db-badkey-action_log | DB 직접 읽기(가짜 키): action_log | GET /rest/v1/action_log?select=*&limit=1 | 401/403 | 통과 (401) |
| db-nokey-pending_actions | DB 직접 읽기(키 없음): pending_actions | GET /rest/v1/pending_actions?select=*&limit=… | 401/403 | 통과 (401) |
| db-badkey-pending_actions | DB 직접 읽기(가짜 키): pending_actions | GET /rest/v1/pending_actions?select=*&limit=… | 401/403 | 통과 (401) |
| db-nokey-tickets | DB 직접 읽기(키 없음): tickets | GET /rest/v1/tickets?select=*&limit=1 | 401/403 | 통과 (401) |
| db-badkey-tickets | DB 직접 읽기(가짜 키): tickets | GET /rest/v1/tickets?select=*&limit=1 | 401/403 | 통과 (401) |
| db-nokey-reports | DB 직접 읽기(키 없음): reports | GET /rest/v1/reports?select=*&limit=1 | 401/403 | 통과 (401) |
| db-badkey-reports | DB 직접 읽기(가짜 키): reports | GET /rest/v1/reports?select=*&limit=1 | 401/403 | 통과 (401) |

하지 않은 점검:
- 호출 한도(429): 한도만큼 기록을 쌓아 부사수를 한동안 막으므로 점검에서 보내지 않는다. 단위 시험(test/api-agent.test.mjs, test/api-incidents.test.mjs)으로 확인한다.

## 점검하면서 발견한 것

- 첫 실행은 86개 중 80개가 통과했다. 실패 6개는 모두 점검 도구의 오탐이었다. Supabase가 가짜 키 요청에 돌려주는 오류 안내문에 `service_role`이라는 **역할 이름**이 들어 있었는데, 점검이 이를 키 노출로 판단했다. 실제 키는 노출되지 않았다. 제3자 응답은 실제 키 모양(토큰)만 보도록 고치고 테스트로 막았다. 고친 뒤 86/86이 통과했다.
- 배포가 지역별로 퍼지는 몇 초 동안 새 함수가 404로 보이는 일시적인 현상이 있었다.

## 알려진 한계

- **공개 데모입니다.** 로그인이 없어서 누구나 서버실을 읽고 사고를 만들고 승인할 수 있습니다. 데이터는 전부 가상이고 `POST /api/reset`으로 처음 상태로 돌아갑니다.
- **호출 한도는 전체 공통입니다.** 사용자별이 아니라 모두가 같은 한도를 나눠 씁니다(사고 10분에 10건, 부사수 1시간에 20번).
- 부사수는 **규칙 기반 시뮬레이션**입니다. 입력 검증은 도구 쪽에서 하고, 변경은 사람의 승인이 있어야 실행됩니다.
- 한도 초과(429)는 배포에서 점검하지 않았습니다(기록을 쌓아 부사수를 막기 때문). 단위 시험으로 확인합니다.
