# 외부 일정 가져오기 V2 — Production 전환 순서·중단·되돌림 (검토본)

작성 2026-09-30 · **개정 2026-10-02** · 기준 브랜치 `feature/external-trip-import-v2` · **이 문서는 실행 지시가 아니다.** 병합·배포·DB 적용·스위치 변경은 Owner 승인 뒤 별도 작업에서 한다.

## 0. 지금 상태 (2026-10-02 읽기 확인)

| 대상 | Staging / Preview | Production |
|---|---|---|
| DB 084~088 | 모두 적용됨(`ai_user_usage`·함수 3·`import_source`·`user_spot_photos`·함수 3) | **전부 없음** (읽기 확인) |
| Pages 코드 | 이 브랜치 Preview(별칭 `external-import-v2.korea-mate.pages.dev`) | master `ecc5bf01` (이 브랜치 미병합) |
| AI Worker | `gokoreamate-ai-writing-preview` 버전 `2a34d720` · `GEMINI_MODEL=gemini-3.5-flash-lite` (Preview 전용 변수) | `gokoreamate-ai-writing` (master 코드 · 모델 상수 `gemini-2.5-flash` · 호출 제한 **8초 고정**) |
| AI 스위치 | ai_master·import·personalize live · writing off · 일일 $5 · 월 $60 | **ai_master off · 모든 기능 off** · 일일 $5 · 월 $60 |
| Google OAuth | 허용 콜백에 Preview 별칭 `/auth/callback` 있음 · Google 공급자 켜짐 | 허용 콜백 `gokoreamate.com`·`www.` `/auth/callback` · Google 공급자 켜짐 |
| 지도(NCP) | **별칭** 주소 인증 200 · 배포 해시 주소(`xxxx.korea-mate.pages.dev`)는 401(등록 범위 밖 — 넓히지 않는다) | `gokoreamate.com` 인증 200 |

## 1. 바뀌는 것

- **DB**
  - 084: 사용자 무료 횟수 원장 `ai_user_usage`와 예약·정산·잔여 함수(service_role 전용).
  - 085: `user_spots.import_source` 선택 컬럼. 추가만 한다.
  - 086: 30일 공유 정책. 087이 대체하는 중간 단계다.
  - 087: 월 1회 + 신규 1회, 글쓰기 월 2회. 풀은 `writing` 과 `plan`(가져오기·AI 일정 개인화 공유) 둘이다.
  - 088: 내 장소 사진 2·3번째(`user_spot_photos`)와 순서·빼기 함수. 독립 — 084~087 과 의존 없음.
- **Pages Functions:**
  - 가져오기 분석(`/api/import/analyze`) — 10-02: 형식 오류는 실비 committed, Google 오류 본문 거절은 released(아래 §6)
  - 가져온 장소 보존(`/api/user-spots/from-import`)
  - 여행 전체 글쓰기(`/api/mytrip/writing-full`)와 개인화·글쓰기의 사용자 횟수 연결
  - 공유 Story 장소 결합, 개인화 회사 원장 열쇠 수정(6d796299), 관리자 canary 막힘 표시
  - 내 장소: 위치 미정 저장·사진 3장(`/api/user-spots/:id/photos`)·장소에서 My Trip 시작(`/api/trip-moments/from-user-spot`) — **AI 호출 없음**
- **AI Worker:** 아래 기능이 추가된다. 2.5 요청 본문은 그대로다.
  - 3.x 요청 설정 변환
  - 거절 응답에 `x-gkm-provider-called: 0` 표시
  - 실제로 부른 모델을 `x-gkm-model`로 알림
  - `x-provider-timeout-ms`(8~45초) · `x-provider-max-bytes`(12MB까지) 존중
  - `/models`(내부 인증 필요, 생성 호출 아님 · 비용 0)
  - `/probe`(`WORKER_ENV=preview`에서만)
  - `GEMINI_MODEL` 변수 — 지금은 Preview 전용. **Worker 하나의 모델이 그 Worker 를 거치는 모든 기능(가져오기·개인화·글쓰기)에 함께 적용된다.**
- **설정:** 루트 `wrangler.toml`의 `[env.preview]` 서비스 연결은 Preview 전용이다. Production 연결(`gokoreamate-ai-writing`)은 그대로다.

## 2. 기능 · 스위치 · 사용권 · Worker 공유 관계

| 기능(경로) | DB 기능 스위치(+ `ai_master`) | 사용자 사용권 풀 | 회사 원장 route | Provider 경로 | 모델 결정 |
|---|---|---|---|---|---|
| 외부 일정 가져오기 `/api/import/analyze` | `feature_import_analyze` | `plan`(신규 1 + 월 1) | `import_analyze` | Worker(서울) → 없으면 직접 | Worker 모델 |
| AI 일정 개인화 `/api/trip/personalize` | `feature_personalize` | `plan`(**가져오기와 공유**) | `personalize` | Worker → 없으면 직접 | Worker 모델 |
| legacy 일정 생성 `/api/generate-itinerary` | `feature_itinerary_legacy`(off 유지) | `plan` | `itinerary_legacy` | 직접 | 코드 상수 |
| My Trip 기록 문장 `/api/mytrip/writing` | `feature_writing` (+ env `MYTRIP_AI_WRITING_MODE` off 면 차단) | `writing`(월 2) | `writing` | Worker | Worker 모델 |
| 전체 여행 일괄 글쓰기 `/api/mytrip/writing-full` | `feature_writing`(**위와 공유**) | `writing`(**위와 공유**) | `writing` | Worker(긴 제한·큰 본문) | Worker 모델 |
| 트렌드 큐레이터(cron Worker) | `feature_curator`(off) | 없음 | `curator` | 별도 Worker | 별도 |
| 관리자 canary | `feature_canary`(off) | 없음 | `canary` | — | — |
| 내 장소 제목·메모 다듬기 `/api/user-spots/:id/enrich` | env `MY_PLACES_AI_MODE`(기본 off) | 없음 | 없음 | **연결된 provider 없음**(live 여도 외부 호출 0) | — |
| 내 장소·사진·My Trip 시작·Story | 없음 | 없음 | 없음 | **AI 호출 없음**(가드 테스트) | — |

예상 밖 AI 경로 점검(코드 검토 + Preview 실측):
- 모든 provider 호출은 `aiAllowed`(환경) → `ai_master` AND 기능 스위치 → 원자 비용 예약을 지난 뒤에만 나간다. 스위치를 하나만 켜도 다른 기능은 열리지 않는다.
- 가져오기의 `?diag=probe|models|route` 는 `APP_ENV=production` 에서 동작하지 않는다.
- **`feature_writing` 하나가 기록 문장과 전체 여행 글쓰기를 함께 연다.** 따로 켤 수 없다.
- **`plan` 풀을 가져오기와 개인화가 함께 쓴다.** 가져오기 1회 뒤에는 그 달 개인화가 막힌다(정책 그대로).
- 비로그인 가져오기 요청은 AI 이전에 `authentication_required`(10-02 Preview 재확인).

## 3. 적용 순서와 이유

1. **사전 기록.** Production 스위치 값을 기록해 둔다(현재 전부 off). 되돌릴 Pages 배포 id와 Worker 버전 id도 기록한다.
2. **DB 084 → 085 → 086 → 087 → 088**을 순서대로 각 1회만 적용한다.
   - master 코드는 이 테이블·함수를 부르지 않으므로 먼저 적용해도 현재 서비스에 영향이 없다.
   - 086·087은 084의 함수를 `CREATE OR REPLACE`로 교체하고 제약을 다시 만든다. 순서를 바꾸면 087 정책이 086으로 덮인다.
   - 088 이 없으면 새 Pages 의 내 장소 사진 추가(`/photos`)가 500 이 된다. 목록·한 장 경로는 088 없이도 동작하도록 만들었지만, 순서는 Pages 보다 먼저다.
   - 적용 뒤에는 함수 존재와 grant(service_role만 실행 가능)를 읽기로 확인한다.
3. **Production Worker 배포** — Pages 코드보다 먼저.
   - master Worker는 8초에 끊는다. 블로그 가져오기는 5~12초가 걸린다(09-30~10-02 Preview 실측).
   - 여행 전체 글쓰기(사진 포함)는 긴 제한과 큰 본문을 요청하는데, master Worker는 이 요청을 존중하지 않는다.
   - 새 Worker는 2.5 요청을 바꾸지 않으므로 master Pages와도 호환된다.
   - 배포 뒤 `/health`에서 `worker_env=production`을 확인한다(provider 호출 0).
   - **모델 결정(§5)이 먼저 필요하다.** 결정 전에는 `GEMINI_MODEL` 을 설정하지 않는다(= 지금과 같은 2.5).
   - 배포 직후 `/models`(비용 0)로 Production 키 프로젝트에서 쓸 모델이 목록에 있는지 확인한다. 이 키는 저장소·대화에 넣지 않는다.
4. **Pages 병합·배포.** 반드시 2·3 이후에 한다.
   - DB가 없으면 사용자 횟수를 셀 수 없다. 코드는 fail-closed라 AI 기능이 전부 "사용 불가"가 된다(안전하지만 장애다).
5. **스위치는 기능별로 따로 켠다.** `ai_master`를 켜기 전에 기능 스위치는 off로 둔다. 1차는 import만 live로 두고 스모크를 한 뒤, personalize·writing을 순서대로 켠다. 예산 값은 바꾸지 않는다.
6. **스모크(합성 계정).**
   - `scripts/qa/ai-user-path-check.mjs`의 기본 모드(AI 0)는 Staging·Preview 전용 도구다. Production에서 같은 확인을 하려면 별도 승인과 도구 조정이 필요하다.
   - 가져오기 1건(글) · 저장 · 재방문을 확인한다.

## 4. 중단 조건

- DB 적용 중 오류가 나면 다음 migration으로 넘어가지 않는다. 이미 적용된 084~085는 master가 쓰지 않으므로 그대로 두어도 무해하다.
- Worker 배포 뒤 `/health` 이상, 또는 기존 글쓰기(2.5)의 오류율이 오르면 Pages 병합 전에 멈추고 Worker를 되돌린다.
- 스위치를 켠 뒤 아래 중 하나가 보이면 해당 기능 스위치를 즉시 off로 돌린다. 배포 없이 적용된다.
  - 회사 원장 `unknown_billed` 가 반복된다(기준 예: 1시간 10건 중 3건 이상). `fail_class`(edge_52x·timeout 등)는 Pages 콘솔 로그에만 있고 **보관되지 않는다** — 실시간 tail 로만 볼 수 있다.
  - 사용자 차감 불일치: committed인데 결과가 없다.

## 5. 모델 — 권고와 남은 불확실성 (2026-10-02)

가격(공식 페이지 2026-10-01 갱신본을 10-02 확인, 유료 · 1M 토큰): 2.5 Flash $0.30/$2.50 · **3.5 Flash-Lite $0.30/$2.50** · 3.5 Flash $1.50/$9.00 · 3.8 Flash $0.75/$3.75(2027-01-01부터 $1.50/$7.50).

| 사실 | 근거 |
|---|---|
| Preview 키 프로젝트는 2.5 Flash 를 **부를 수 없다** | 10-02 생성 요청 6회 모두 Google 404 "gemini-2.5-flash is no longer available to new users"(목록에는 나타남) |
| 그래서 **최종 가져오기 프롬프트의 2.5 품질은 미실측** | Production 키·Worker 를 쓰지 않는 한 잴 방법이 없다 |
| 3.5 Flash-Lite 최종 프롬프트(10-01 09:09 이후) 분석 11/11 성공, 저장 4/4 | 아래 표 |
| 3.5 Flash-Lite 응답 1.8~7.2초, 건당 실비 $0.0011~0.0053 | 원장 committed |
| 3.5 Flash-Lite 로 **글쓰기 0건**, 개인화 11건 | Staging 원장(09-30 07:46 UTC 이후) |

**권고:** 가져오기는 3.5 Flash-Lite(같은 가격 · 실측 근거 있음 · 2.5 는 신규 프로젝트에서 이미 막힘). 다만 Worker 모델은 기능 공용이므로 둘 중 하나를 Owner 가 고른다.
- (가) Production Worker 전체를 3.5 Flash-Lite 로 — 글쓰기·개인화를 3.5 에서 작은 표본으로 먼저 확인한 뒤.
- (나) 요청별 모델(가져오기만 3.5, 나머지 2.5) — Worker·Pages 에 작은 코드 변경이 필요하다(미구현).

3.8 Flash 전환은 권고하지 않는다(2.5배 단가 · 2027년 두 배 · 이전 불안정). 확정할 수 없는 것: Production 키 프로젝트에서 3.5 Flash-Lite 가용 여부(배포 후 `/models` 로 확인), 2.5 에서의 최종 프롬프트 품질, 표본 크기(입력 4종 · 각 1~4회).

## 6. 실패·정산 규칙 (10-02 코드 기준)

| 실패 | 회사 원장 | 사용자 횟수 | 화면 |
|---|---|---|---|
| 모델에 보내기 전 차단(스위치·Worker 거절 `provider-called: 0`) | released | 되돌림 | 지금은 쓸 수 없어요 · 차감 없음 |
| Google 이 오류 본문으로 거절(400·404·500 등, 52x 제외) | **released**(공식: "400 or 500 error … won't be charged") | 되돌림 | 분석 실패 · 차감 없음 |
| 응답은 왔지만 형식 오류(MAX_TOKENS 등) | **committed(실제 토큰)** | 되돌림 | 분석 실패 · 차감 없음 |
| Cloudflare 52x · 모델 시간 초과(20초) · 연결 오류 | unknown_billed(예약액) | 되돌림 | 시간 초과 · 차감 없음 / 분석 실패 · 차감 없음 |
| 화면 쪽 연결 끊김·60초 초과(서버는 끝났을 수 있음) | 서버 결과대로 | 서버 결과대로 | 같은 내용 다시 누르면 두 번 차감 없음(재생) |
| 서버가 중간에 멈춤 | 예약 유지 | 5분 뒤 자동 해제 | — |

## 7. 되돌림

| 대상 | 방법 | 비고 |
|---|---|---|
| 스위치 | `ai_ops_switches`의 기능 값을 off로 | 즉시 · 가장 먼저 쓰는 수단 |
| Pages | 기록한 이전 배포로 rollback | DB는 그대로 두어도 된다 |
| Worker | `wrangler rollback`으로 기록한 버전 | 버전에 변수(`GEMINI_MODEL`)가 함께 들어 있다 — 10-02 Preview 에서 rollback 으로 모델 복원 실측 |
| DB | **되돌리지 않는 것을 기본으로** | 새 테이블·함수·선택 컬럼만 더한다. 제거가 꼭 필요하면 별도 승인된 SQL로(사용자 횟수 기록 보존 여부 먼저 결정) |

## 8. 아직 확정하지 않은 것

- **모델**(§5).
- **520·시간 초과.** 09-30 에 Cloudflare 520·시간 초과가 관찰됐고 원인은 확정하지 않았다. 09-30 19시 KST 이후 3.5 Flash-Lite 가져오기 표본(10-01·10-02)에서는 **발생하지 않았다** — 해결 선언이 아니다.
- **회사 원장의 `model` 열**은 예약 때 적는 고정값(`gemini-2.5-flash`)이다. 실제 단가 계산은 Worker 가 알려 준 모델로 하므로 금액은 맞지만, 모델별 집계에는 쓸 수 없다(정산 함수 변경 = DB 작업이라 이번에는 하지 않음).
- **관리자 AI canary.** provider 검증 도구로서는 퇴역했다.
- **Google 신규 로그인.** 시작 경로(동의 → Supabase → Google 로그인 화면, redirect 불일치 없음)까지 Preview 에서 확인. 실제 계정 입력 → 콜백 → 세션 저장 → 재방문은 미실측.
- **실측하지 않은 것.** 실제 휴대전화의 튜토리얼·공유 창, iPhone Safari HEIC.
