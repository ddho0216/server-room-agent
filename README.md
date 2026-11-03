# 서버실 AI 부사수

데이터센터 서버실 랙 하나를 맡은 관리자가 되어, AI 부사수와 함께 순회 점검과 장애 대응을 하는 작은 프로젝트입니다. 모든 서버 상태는 가상 데이터입니다.

## 현재 기능

- 서버 4대가 들어 있는 서버 랙 화면 (정상 3대, 주의 1대). 상태에 따라 LED 색이 바뀌고, 주의 서버는 깜빡입니다.
- 서버 이름에 HTML이 들어 있어도 글자로만 표시됩니다.
- 서버가 없거나 모르는 상태값이면 안내 문구와 회색 LED로 표시됩니다.
- 모션 줄이기 설정에서는 깜빡임이 꺼집니다.
- 서버 상태는 Supabase `servers` 테이블에 있고, 화면은 서버 함수 `GET /api/servers`로만 읽습니다. 공개 파일에는 서버 데이터가 없습니다.
- 서버 함수는 GET만 받고(그 외 405), 설정이 없으면 500, Supabase가 실패하면 502를 돌려줍니다. 응답에 키는 없습니다.
- 불러오지 못하면 "불러오지 못했어요" 안내를 보여 줍니다.

배포 주소: https://server-room-agent.vercel.app

## 실행 방법

```bash
npm test
python -m http.server 8080 -d public
```

두 번째 명령 후 브라우저에서 `http://localhost:8080`을 엽니다.

## 가상 자료 안내

화면의 서버 이름, 온도, 상태는 모두 가상입니다. 실제 회사나 센터의 자료는 없습니다.

## 단계 기록

| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | 서버실 화면 + 배포 | 완료 (2026-11-03) |
| 2 | Supabase로 데이터 이동 + 잠금 | 완료 (2026-11-03) |
| 3 | 사고 발생 + 호출 제한 (읽기 전용 서버 함수는 2단계에서 먼저 만듦) | 예정 |
| 4 | AI 부사수 | 예정 |
| 5 | 제한·보안 + 시나리오 추가 | 예정 |
| 6 | 정리 | 예정 |

### 1단계 완료 기준 확인 (2026-11-03)

- [x] 배포 주소에서 서버 4대가 보인다 (`data-server-id` 4개, 주의 LED 1개)
- [x] 저장소가 공개이다
- [x] README에 단계 기록이 있다
- [x] `/.env`, `/package.json`, `/AGENTS.md`, `/README.md`, `/vercel.json`, `/test/` 요청은 404

### 2단계 완료 기준 확인 (2026-11-03)

- [x] 서버 상태가 Supabase 테이블에 있다 (`select count(*)` → 4)
- [x] RLS가 켜져 있다 (`relrowsecurity` → true). `anon`·`authenticated`는 권한을 회수했고, 읽기 권한은 서버 전용 역할에만 준다 (`supabase/001_servers.sql`)
- [x] 공개 파일에 서버 상태 데이터가 없다 (`test/no-state-in-public.test.mjs`, 배포된 `/servers.mjs`·`/app.js`·`/rack.mjs`에 서버 이름 없음)
- [x] 배포 화면에서 서버 4대가 보인다 (정상 3대, `db-01` 주의)
- [x] `/supabase/001_servers.sql`, `/.env`, `/package.json`은 404, `POST /api/servers`는 405
- [ ] 배포된 `/api/servers` 응답에 키가 없다 (수정 후 배포에서 재확인 예정)

### 막혔던 점

- 서버 함수가 502를 돌려주었다. 로그에 `status: 403`이 남아 있어 원인이 테이블 읽기 권한임을 알았다. Data API 자동 공개를 끈 프로젝트라 서버 전용 역할에 `grant select`가 필요했다.

설계: `docs/superpowers/specs/2026-11-03-server-room-agent-design.md`
