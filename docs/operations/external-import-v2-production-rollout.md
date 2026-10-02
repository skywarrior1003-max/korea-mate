# 외부 일정 가져오기 V2 — Production 전환 순서·중단·되돌림 (검토본)

작성 2026-09-30 · **개정 2026-10-02(2차: 모델 3.5 Flash-Lite 결정 반영)** · 기준 브랜치 `feature/external-trip-import-v2` · **이 문서는 실행 지시가 아니다.** 병합·배포·DB 적용·스위치 변경은 Owner 승인 뒤 별도 작업에서 한다.

## 0. 지금 상태 (2026-10-02 읽기 확인)

| 대상 | Staging / Preview | Production |
|---|---|---|
| DB 084~088 | 모두 적용됨(`ai_user_usage`·함수 3·`import_source`·`user_spot_photos`·함수 3) | **전부 없음** (읽기 확인) |
| Pages 코드 | 이 브랜치 Preview(별칭 `external-import-v2.korea-mate.pages.dev`) | master `ecc5bf01` (이 브랜치 미병합) |
| AI Worker | `gokoreamate-ai-writing-preview` 버전 `bae0df67`(이 브랜치 코드 · /model-check 포함) · `GEMINI_MODEL=gemini-3.5-flash-lite` | `gokoreamate-ai-writing` (master 코드 · 모델 상수 `gemini-2.5-flash` · 호출 제한 **8초 고정**) |
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
  - `GEMINI_MODEL` 변수 — Production 은 §3-6 에서만 넣는다(그 전까지 2.5). **Worker 하나의 모델이 그 Worker 를 거치는 모든 기능(가져오기·개인화·글쓰기)에 함께 적용된다.** Worker 연결이 없을 때의 직접 호출 경로는 Pages 코드 상수(2.5)를 쓴다 — Production 은 연결이 있으므로 쓰이지 않는다.
  - `/model-check`(내부 인증 · 수 토큰 실제 생성 1회 · 상태만) — 관리자 `POST /api/admin/ai-model-check` 가 부른다(§3-5).
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

## 3. 적용 순서와 중단 지점 (10-02 개정 · Pages/Worker 순서 무관 · 5d5ad183)

**왜 순서가 바뀌었나.** 예전 판은 "Worker 먼저"(옛 Worker 는 8초·64,000자 고정이라 V2 요청을 못 받는다), 직전 보고는 "Pages 먼저"(새 Worker 는 예약 머리글 없는 옛 Pages 요청을 거절)였다. 이제 **섞인 조합은 모두 요청 전에 닫힌다** — 사용권 순차감 0·회사 원장 확정 0·모델 호출 0 — 그래서 Pages·Worker 순서는 결과를 바꾸지 않는다. AI 는 새 Pages + 새 Worker 에서만 열린다. Production 은 지금 AI 가 전부 꺼져 있어(ai_master off·Worker MODE off) 전환 중 사용자가 잃는 기능도 없다.

Preview 실측(10-02, Staging 원장 대조):

| Pages \ Worker | 기존(master, e940970d 와 같은 코드 · Preview d47a04ae) | 새(V2, Preview e21dce36) |
|---|---|---|
| **기존(master AI 코드)** | 개인화 → 모델 호출(Preview 키는 2.5 생성 불가라 오류) · 원장 과금 불확실 2,500 | 개인화 → **Worker 가 보내기 전 거절**(머리글 없으면 옛 고정 예약 2,500 으로 보고, 개인화 본문 상한은 빈 프롬프트도 2,384·실제 2,935 > 2,500) · 옛 Pages 계약상 원장엔 과금 불확실 2,500(실제 모델 호출 0) |
| **새(V2)** | 가져오기·개인화·전체 여행 글쓰기 → Worker 표시 없음 → **예약·모델 0**(사용권은 잡았다 바로 되돌림, 글쓰기는 사용권 전 단계) | 세 기능 정상 · 예약 → 확정 11,658→1,721 / 2,935→564 / 22,033→1,785 |

- 옛 Worker 의 8초 상한·크기 머리글 무시는 이제 영향이 없다 — V2 Pages 가 옛 Worker 에는 보내지 않는다.
- 옛 Pages 의 기록 문장 자동 제안(`/generate`)도 새 Worker 에서 옛 고정 예약 9,500 안의 본문만 보낸다.

### 전환 당일 순서 (각 단계 뒤 확인 → 아니면 멈춤·되돌림)

| # | 할 일 | 확인할 응답 | 멈춤·되돌림 |
|---|---|---|---|
| 0 | 기록: Production 스위치 전부 off · Pages 배포 id · Worker 버전 id(현재 e940970d) · `AI_WRITING_WORKER_MODE`=off | 값 기록 | — |
| 1 | DB **084 → 085 → 086 → 087 → 088** 각 1회(순서 고정: 086·087 이 084 함수를 교체, 088 없으면 내 장소 사진 500) | 함수 존재·grant(service_role 만) 읽기 확인 | master 는 이 테이블을 안 쓴다 — 되돌리지 않고 다음 단계로 가지 않는다 |
| 2 | Worker 배포(V2 코드, **`GEMINI_MODEL` 넣지 않음 = 2.5**, MODE 는 off 유지) | Worker `/health` 200·`x-gkm-worker-caps: provider-bound-v1`·`mode: off` | 이전 버전으로 `wrangler rollback` |
| 3 | Pages 병합·배포(V2) | 홈·내 여행·공유 Story 정상 · AI 기능은 "지금 쓸 수 없어요"(스위치 off) | Pages 이전 배포로 rollback(사진 공개 필터 포함 판으로 — 사진 단독 수정 문서 §5) |
| 4 | Worker `AI_WRITING_WORKER_MODE=live`(DB 스위치는 여전히 전부 off → 사용자 요청은 Pages 에서 막힌다) | `/health` `mode: live` | MODE off |
| 5 | **■ 모델 확인** `POST /api/admin/ai-model-check` `{"confirm":"CHECK-MODEL","model":"gemini-3.5-flash-lite"}` | `status: "available"`(원장 route `model_check` 1행·100µ$) | `not_available`·`worker_refused`·`ledger_refused` 면 **여기서 끝** — 모델 전환·AI 스위치 켜기 없음, MODE off 로 되돌림 |
| 6 | 모델 전환: `GEMINI_MODEL=gemini-3.5-flash-lite` 를 `wrangler.toml` Production `[vars]` 에 넣은 **별도 커밋**으로 Worker 배포 | `/health` · model-check(model 생략) `available` | 이전 Worker 버전으로 rollback |
| 7 | **■ 스위치 기능별**: `ai_master` → `feature_import_analyze` → 합성 계정 스모크 1건 → `feature_personalize` → `feature_writing` | 원장: 예약 ≥ 확정, `ai_ops_overrun` 로그 0 · 사용권 차감 1 | 해당 기능 스위치 off(즉시) · 전체는 `ai_master` off |

- 예산 값(일 $5·월 $60)은 바꾸지 않는다. Production 스모크 실호출은 별도 승인.
- 사진 단독 수정이 먼저 나가 있어도 V2 는 그 커밋을 포함한다(병합 f7d4bcc7) — 사진 동작은 한 가지다.

## 4. 중단 조건과 즉시 되돌림

- DB 적용 중 오류 → 다음 migration 으로 넘어가지 않는다(이미 적용된 것은 master 가 쓰지 않아 무해).
- Worker 배포 뒤 `/health` 이상, 또는 기존 기능(2.5)의 오류가 늘면 → Pages 병합 전에 멈추고 Worker 를 되돌린다.
- **3.5 전환 뒤 거절되면(가용성 확인 실패·404·403 등이 사용자 경로에서 반복)** — 순서대로:
  1. `ai_ops_switches` 의 `ai_master` 를 off(배포 없이 즉시 · provider 0).
  2. `wrangler rollback <6 직전 버전 id>` — 버전에 `GEMINI_MODEL` 이 함께 들어 있어 2.5 로 돌아간다(10-02 Preview 에서 rollback 으로 모델 복원 2회 실측).
  3. `wrangler.toml` 의 `GEMINI_MODEL` 커밋을 되돌려 다음 배포가 3.5 를 다시 싣지 않게 한다.
  4. `ai-model-check`(model 생략) 로 현재 모델이 `available` 인지 본 뒤에만 스위치를 다시 켠다.
- 스위치를 켠 뒤 아래가 보이면 해당 기능 스위치를 즉시 off:
  - 회사 원장 `unknown_billed` 반복(예: 1시간 10건 중 3건 이상). `fail_class` 는 Pages 콘솔 로그에만 있고 **보관되지 않는다**(실시간 tail).
  - 사용자 차감 불일치: committed 인데 결과가 없다.

## 5. 모델 — 근거와 남은 불확실성 (2026-10-02)

가격(공식 페이지 10-01 갱신본, 10-02 확인 · 유료 · 1M 토큰): 2.5 Flash $0.30/$2.50 · **3.5 Flash-Lite $0.30/$2.50** · 3.8 Flash $0.75/$3.75(2027-01-01부터 $1.50/$7.50).

| 기능(3.5 Flash-Lite · Preview) | 실측 |
|---|---|
| 가져오기 | 최종 프롬프트 분석 13/13 · 저장 5/5 · 핵심 장소 누락 0(영어 블로그 'Blueline Park' 1회 누락은 측정 기준 오류 — 실제 탄 'Haeundae Beach Train' 으로 나왔다) · 1.8~8.5초 · 건당 $0.001~0.005 |
| AI 개인화 | 화면 옵트인→적용→자동 저장→재방문 · 차감 1 · 같은 조건 재요청 provider 0·차감 0 · 이름·분류가 있는 선택 3곳 → 분류 가중치(명소 0.8·자연 0.7)·시간대·여유 반영 · 약 2초 · 건당 $0.0005~0.0009 |
| 전체 여행 글쓰기 | 사진 기록 3곳(첫 사진 3장) · 요청 1회 → 3가지 표현 · 직접 쓴 여행 제목·기록은 기본 해제·적용 뒤에도 그대로 · Story 반영 · 재열람 provider 0 · 약 7초 · $0.0036 |
| 전체 여행 글쓰기(10-02 사진 정합) | 광안리 1장소 기록 5개·사진 15장 → 계획 15/15 · 요청 1회 · 결과 15/15 · 기록마다 글 하나 · 입력 9,737 토큰 · 확정 $0.0069 / 예약 $0.033(10-02 오전, 고정값 — §11 에서 요청별로 바꿈). 이기대 5장소·기록 6개·사진 8장 → 8/8 · $0.0059. 동시 두 번 전송 → 1건 fallback_busy·원장 1·차감 1 · 같은 요청 재전송 cache_server(원장·차감 0) · 다시 열기 0 · 스위치 off 실패 → 원장 없음·사용권 released |
| 실패(모델 404 강제) | 세 기능 모두 사용자 횟수 되돌림 · 회사 원장 unknown_billed · 화면 안내가 실제와 일치 |

남은 불확실성: Production 키 프로젝트의 3.5 가용성(§3-5 로 확인), 2.5 와의 품질 비교(Preview 키로 2.5 생성 불가), 표본 크기(가져오기 입력 4종·각 1~5회, 개인화 3회, 글쓰기 1회), 시간 초과·형식 오류는 실제 모델로 일부러 만들 수 없어 처리기 시험(개인화 UP4)·코드 검토로만 확인.

## 6. 실패·정산 규칙 (10-02 코드 기준 · CORRECTION-V1 §2 유지)

| 실패 | 회사 원장 | 사용자 횟수 | 화면 |
|---|---|---|---|
| 모델에 보내기 전 차단(스위치·Worker 거절 `provider-called: 0`) | released | 되돌림 | 지금은 쓸 수 없어요 · 차감 없음 |
| 보낸 뒤 받은 HTTP 오류(400·404 모델 접근 거절·429·5xx 전부) | **unknown_billed**(예약액) | 되돌림 | 분석 실패 · 차감 없음 |
| 응답은 왔지만 형식 오류(MAX_TOKENS 등, 가져오기) | committed(실제 토큰) | 되돌림 | 분석 실패 · 차감 없음 |
| Cloudflare 52x · 모델 시간 초과 · 연결 오류 | unknown_billed | 되돌림 | 시간 초과 · 차감 없음 / 분석 실패 · 차감 없음 |
| 화면 쪽 연결 끊김(서버는 끝났을 수 있음) | 서버 결과대로 | 서버 결과대로 | 같은 내용(조건)으로 다시 누르면 두 번 차감 없음 |
| 서버가 중간에 멈춤 | 예약 유지 | 5분 뒤 자동 해제 | — |

- Google 문서는 "400 or 500 error … won't be charged" 만 명시한다. 404 등은 명시되지 않았고, 승인된 계약(CORRECTION-V1 §2)은 전송 후 오류를 모두 unknown_billed 로 둔다. 10-02 에 잠시 Google 오류 본문을 released 로 처리했던 규칙(3fbaae75·478ef6a3)은 계약과 맞지 않아 되돌렸다(47a56ce8). 그 사이 기록된 Staging 원장 1행(id 219, 2.5 404)은 released 로 남아 있다 — 감사 기록은 다시 쓰지 않는다.
- Cloud Billing 으로 실제 청구를 대조한 적은 없다. 404 의 실제 과금 0 은 **추정**이다(생성 토큰 0 · 사용량 메타데이터 없음).

## 7. 되돌림

| 대상 | 방법 | 비고 |
|---|---|---|
| 스위치 | `ai_ops_switches` 의 `ai_master`·기능 값을 off | 즉시 · 가장 먼저 |
| Worker(모델) | `wrangler rollback <이전 버전>` | 버전에 `GEMINI_MODEL` 포함 · Preview 실측 |
| Pages | 기록한 이전 배포로 rollback | DB 는 그대로 두어도 된다 |
| DB | **되돌리지 않는 것을 기본으로** | 추가만 한다. 제거는 별도 승인 SQL 로 |

## 8. 아직 확정하지 않은 것

- **Production 키의 3.5 Flash-Lite 가용성** — §3-5 확인 전까지 미확인.
- **520·시간 초과.** 09-30 에 관찰, 원인 미확정. 09-30 19시 KST 이후 표본(10-01·10-02)에서는 발생하지 않았다 — 해결 선언이 아니다.
- **회사 원장의 `model` 열**은 예약 때 적는 고정값이다(금액은 실제 모델 단가로 계산). 모델별 집계에는 쓸 수 없다.
- ~~개인화와 장소 선택~~ — **고침(031e7594)**: 고른·저장한 장소가 없으면 사용권·회사 예약·provider 이전에 `fallback_no_input` 으로 끝나고 화면이 "횟수는 차감되지 않았어요" 라고 알린다(Preview 실측: 요청 0·원장 0·사용권 0, API 직접도 동일).
- **Google 신규 로그인**(실제 계정 입력 이후)·**실제 휴대전화**(튜토리얼 의견·공유 창)·**iPhone Safari HEIC** — 미실측.

## 9. My Trip 사진 기록 한도 — 실제 계약과 총용량 권고 (2026-10-02 · 권고만, 미적용)

| 항목 | 실제 값(코드·Preview 실측) |
|---|---|
| 기록 사진 1장 | 화면에서 600px JPEG(품질 0.75)로 줄여 올린다 · 서버 상한 1MB(넘으면 413 `TOO_LARGE`) · 실측 저장 크기 4.7~7.9KB(단색 시험 사진) — 실제 풍경 사진은 대략 40~100KB 예상(미실측) |
| 여행당 | 사진 30장(첫 사진 + 추가 사진 합계, 400 `ITINERARY_LIMIT`) · **총 MB 상한 없음** |
| 기기당 | 사진 100장(`DEVICE_LIMIT`) |
| 기록당·장소당 | 상한 없음(여행 30장 안에서) — 한 장소에 기록 여러 개 가능(카드 "이 장소에 기록 추가") |
| 내 장소(My Places) | 장소당 3장 · 1920px·≤1MB · 기기당 100장(기록 사진과 별도 계산) |
| Story(비공개·공개) | 모든 기록 · 기록마다 모든 사진(일지 보기는 기록당 3장 + "+N") · 장소 안 기록은 남긴 시각 순 |
| 공유 카드 | 표지 + Day 카드 + 장소마다 카드 1장(그 장소 첫 기록의 첫 사진) + 여정 카드 — 기록 5개·사진 15장 장소도 카드 1장(코드 기준) |
| 전체 여행 글쓰기 | 요청 1회에 최대 15장(모든 기록의 1번 사진 → 2번 사진 … 순) · 결과는 기록마다 제목·글 하나 · MEDIUM · 예약은 요청마다 보낼 본문으로 계산(상한 95,000µ$ — §11) |

- **10-02 결함·교정(6ec2f9fd):** dcf874b4 이후 정상 온라인 저장에서 기록의 2번째 이후 사진이 서버에 올라가지 않았다(첫 장이 바로 올라가면 재동기화가 그 기록을 건너뜀). 기록 5개·사진 15장이 서버·다른 기기·공개 Story·AI 에 5장으로 보였다. 이제 첫 장 직후 바로 올리고, 재동기화도 남은 추가 사진을 올린다. **master/Production 에도 같은 결함이 있다** — 이 브랜치 병합 전까지 Production 사용자 기록의 추가 사진은 그 기기에만 있다(지운 적은 없음 · 새 코드가 그 기기에서 여행을 열면 올린다).
- **총용량 권고(Owner 결정 대기 · 적용 안 함):** 600px 압축 기준 여행 30장 ≈ 1.5~3MB 라 별도 MB 상한은 30장 상한 이상의 보호를 주지 않는다. 지금은 **장수(30) 상한 유지 + MB 상한 신설 안 함**을 권고한다. 다시 볼 조건: 압축 크기를 올릴 때(예: 1600px), 또는 My Places 사진(최대 1MB)을 기록 사진으로 그대로 옮기는 흐름이 생길 때 — 그때 여행당 상한 30장×1MB=30MB 가 이론 최대다. 화면에는 없는 총용량을 쓰지 않는다.

## 10. 예전 앱이 기기에 남긴 추가 사진 — 뒤늦은 업로드와 공개 범위 (2026-10-02 · d82a0509)

- **재현(Preview·합성 계정):** 수정 전 클라이언트(031e7594 storage.ts)로 기록 5개×사진 3장 → 서버 첫 사진 5장·기기 추가 10장. 수정 클라이언트로 다시 열기만 하면 추가 사진이 올라간다.
- **결함(공개 필터 전):** 이미 공개한 기록의 늦은 사진 2장이 익명 공개 Story(1→3장)·사진 주소(200)에 바로 나갔다. 비공개 기록·공개 후 비공개로 바꾼 기록은 나가지 않았다.
- **교정:** 공개 동의는 동의할 때 있던 사진까지 — 동의 시각 뒤에 올라온 추가 사진은 공개 Story·`/img/memory`(주소를 알아도 404)·커뮤니티 대표 사진에서 빠진다. 소유자 기록 관리에 "나중에 올라온 사진 n장은 아직 공개되지 않았어요 · 확인하고 함께 공개"(기존 동의 창). 첫 사진·메모의 공개 상태는 그대로. 공개 기록의 첫 사진을 지웠는데 남은 사진이 모두 동의 뒤 사진이면 그 기록을 비공개로 돌린다(확인 없는 사진이 공개 첫 장이 되지 않게).
- **중복 방지:** 추가 사진 파일 이름 = SHA-256(기록 id + 저장 바이트). 이미 있으면 한도 판정 전에 200(duplicate). 응답 유실·앱 중단·같은 기기 두 탭 동시·같은 계정 다른 기기 동시 → 파일 12 = 첫 사진 4 + 행 8 · 고유 경로 8(Preview 실측).
- **그 밖의 실측:** 서버 실패(업로드 차단) → 기기에 그대로·거짓 성공 없음 · 다른 기기에서 지운 기록 → 늦은 사진이 붙지 않고 기기에서도 사라짐 · 장소 순서 변경 → 같은 기록에 3장 · 한도 29장 여행 → 1장 저장·1장 ITINERARY_LIMIT(기기에 남음·카드 안내) · 로그아웃·같은 기기 다른 계정 → 열리지 않음·업로드 0 · 다른 계정이 그 기기를 연결 시도 409 · 다른 계정 직접 업로드 403.
- **알 수 없는 것:** Production 의 추가 사진 0장(10-02 읽기)은 영향받은 사용자가 0명이라는 증거가 **아니다.** 추가 사진은 그 기기 브라우저 저장소에만 있어 서버는 몇 장인지 알 수 없다. 앱 데이터를 지운 기기·다시 열지 않는 여행의 사진은 올라오지 않는다.

### 10-1. Production 에 사진 수정만 따로 내보낼 때 (조사 · 배포하지 않음)

- **필요한 것:** ① 클라이언트 업로드(6ec2f9fd 의 storage.ts 두 곳) ② 공개 필터·확인 UI·승격 보호·중복 방지(d82a0509 의 사진 부분). 031e7594 의 사진 저장 거절 코드·안내는 있으면 좋고 필수 아님.
- **의존:** DB 변경 없음 — Production 에 `trip_moment_photos.created_at`·`trip_moments.public_consent_at` 이 이미 있다(10-02 읽기 확인). Staging 전용 084~088·가져오기·사용권·AI 기능에 의존하지 않는다. master 와 이 브랜치의 해당 파일 차이는 위 변경 외에 Story 장소 결합(6411c1e1)이 섞여 있어 cherry-pick 이 아니라 **master 기준 별도 브랜치에 두 변경만 옮기는 방식**이 안전하다.
- **순서:** 서버(공개 필터·중복 방지)와 클라이언트를 **한 배포로**. 클라이언트만 먼저 나가면 위 결함이 Production 에서 그대로 생긴다.
- **되돌림:** Pages 이전 배포로 rollback(DB 없음). 단, 되돌린 뒤에는 이미 올라온 늦은 사진이 **필터 없는 옛 서버**에서 공개 기록에 나간다 — 되돌림이 필요하면 클라이언트만 되돌리는 것이 아니라 공개 필터가 있는 배포로 돌아가야 한다.

## 11. 전체 여행 글쓰기 비용 예약 — 경계 (2026-10-02 · c1e16dbe)

- **이전 33,000µ$ 의 근거:** 서버 자르기 상한을 한국어로 채운 사실의 countTokens 실측 30,265 토큰 + 사진 15×560 + 출력 8,192 = 32,080µ$. **최악값이 아니었다** — countTokens(무료) 재측정: 토큰 ≤ UTF-8 바이트(9종 문자 최대 1.000)이지만 글자당 토큰은 흔한 한글 1 · 드문 기호·사용자 정의 문자 3 · 제어 문자(JSON 이스케이프) 약 5.5. 날짜 칸(text)은 자르지도 않았다.
- **지금:** 요청마다 예약 = (사진 데이터를 뺀 본문 바이트 × 1 + 사진 × 560) × $0.30/1M + 8,192 × $2.50/1M. 서버가 받는 가장 큰 요청(모든 칸 제어 문자·14일×20곳·기록 30·사진 꼬리표 15) = 226,591 바이트 → 상한 240,000 → **예약 상한 95,000µ$**(넘는 요청은 사용권·예약 전에 거절). 날짜 10자·일차 0~999 로 자른다. 3.5 Flash-Lite·MEDIUM 그대로.
- **실측(Preview, 사진 15장):** 예약 24,972 · 확정 6,841µ$(입력 9,720·출력 1,570 토큰) — 여유 18,131µ$. 출력 상한 8,192 는 사고 토큰 포함(10-02 실측).
- **초과 처리:** 확정 > 예약인 행이 오늘(UTC) 그 기능에 하나라도 있으면 그날 그 기능은 예약을 거절한다(조회 실패도 거절). 상한 합계는 확정액으로 다시 계산되므로 생긴 초과도 이후 예약에 반영된다. 표에 없는 모델 이름은 가장 비싼 단가로 기록. 보낸 뒤 오류 = 과금 불확실(예약액 보존) 계약 그대로. Staging 원장 214행 중 확정 > 예약 0건.
- **동시성(자동 검사 `scripts/ai-ops-reserve-concurrency-check.mjs`, Staging 실제 예약 함수):** 기능 $1/일에 95,000µ$ 20건 동시 → 10건 · 기능 100회/일에 120건 → 100건 · 회사 일 $5 남은 금액 초과 → 남은 금액만큼만 · 같은 요청 열쇠 5건 → 1행. 시험 행은 모두 released.
- **10-02 오전 보고의 "예약 6건 중 1건"**: route `qa_concurrency` 에 33,000µ$ 6건을 **시험용 기능 상한 50,000µ$(함수 인자로만 넘김, 스위치 변경 없음)** 로 보낸 결과다. 그 행은 released 로 정리했다. 평소 상한(글쓰기 기능 $1/일·100회, 회사 $5/일·$60/월)에서 1건만 통과한다는 뜻이 아니다.
- **다른 기능(가져오기 12,100 · 개인화 2,500 · 기록 문장 9,500/22,000)의 예약액은 이번에 다시 계산하지 않았다** — 초과 차단은 공통으로 적용된다.

## 12. AI 비용 경로 전수 (2026-10-02 · ab7ccf87 · Preview Worker ba9a5d7e)

모든 경로의 예약은 **보낼 본문으로 계산한 상한**(\`src/lib/ai-cost/provider-bound.ts\`)이다:
입력 ≤ (사진 데이터를 뺀 본문 UTF-8 바이트) × 1 + 사진 × 280/560/1120(해상도, 지정 없으면 1120) · 출력 ≤ maxOutputTokens(≤ 8,192, 3.x 는 사고 포함) · 단가 = 받는 모델 중 최댓값($0.30/$2.50). 서울 Worker \`/provider\` 가 같은 함수로 다시 계산해 **예약액 < 상한·단가 없는 모델·도구(grounding)·출력 상한 없음·사고 무제한**이면 보내지 않는다(provider-called 0 → released). 본문 크기는 바이트로 잰다.

| 경로 | 엔드포인트 · 모델 경로 | 서버 입력 상한 · 출력 | 예약(최악 / Preview 실측 예약→확정) | 사용권 · 재전송 | 기능 상한 |
|---|---|---|---|---|---|
| 개인화 | POST /api/trip/personalize · Worker /provider(GEMINI_MODEL) | 장소 40+40·이름 60자·프롬프트 6,000자 · 700 | 13,184 / 2,935→877 | plan 풀 · request_id 재전송 replay(차감 0) | 200회·$1/일 |
| 가져오기 | POST /api/import/analyze · Worker /provider | 본문 18,000자·제목 300·설명 600·출처 2,048(이번에 자름) · 4,096 | 46,207 / 11,683→1,701 | plan 풀 · 같은 글/URL·같은 날 replay | 100회·$1.5/일 |
| 전체 여행 글쓰기 | POST /api/mytrip/writing-full · Worker /provider | §11 · 8,192 | 95,000 / 22,035→1,845 | writing 풀(월 2) · 같은 내용 cache_server(차감 0) | 100회·$1/일(기록 문장과 공유) |
| 레거시 일정 | POST /api/generate-itinerary · **직결** 2.5 Flash (env off·스위치 off) | 칸별 자르기·본문 512KB 실바이트(이번) · 8,192·사고 끔(이번) | 1회 상한 × 3회 ≈ 80,000(추정·미호출) | personalize 풀 | 20회·$0.5/일 |
| 관리자 모델 점검 | POST /api/admin/ai-model-check · Worker /model-check | 허용 모델만 · 8 | 100(원장 기록·스위치 무관, 이번) | — | 20회·2,000µ$/일 |
| Preview 진단 | GET /api/import/analyze?diag=probe·model-check (Production 차단) | **관리자 키 필요(이번)** · 700/8 | 5,000/100 원장 기록(이번) | — | 20회/일 |

- 공통: 회사 일 $5·월 $60(\`ai_ops_reserve\`, advisory lock) · 확정 > 예약이면 \`ai_ops_overrun\`(초과 지출) 기록 + 그날 그 기능 예약 거절(\`ai_ops_overrun_block\`) · 표에 없는 모델 이름은 최고 단가로 기록.
- 정산: 보내기 전 거절 = released · 보낸 뒤 HTTP 오류·시간 초과 = unknown_billed(예약액 보존) · 응답·사용량을 받은 형식 오류 = committed(실사용량, 전체 여행 글쓰기도 이번에 맞춤). 사용자 사용권은 실패마다 되돌림.
- **원장 밖 남은 경로:** Worker \`/canary\`·\`/generate\`(INTERNAL_KEY 보유자만, Pages 호출처 없음 — \`/generate\` 를 부르던 writing.ts 대상은 모두 은퇴) · trend curator Worker(별도 키·주 4회 슬롯·grounding 과금은 원장 밖, Staging CURATOR_MODE off).
- **Preview 관찰:** Preview Pages 에 ADMIN_KEY 가 없어 관리자 점검은 503(fail-closed, 원장 0) — 실제 점검은 Production 전환 직전에 운영 확인. 10-02 Staging 원장 411(writing·unknown_billed 9,500)은 같은 시각 photo-hotfix Preview(master 코드)의 기록 AI 제안 호출로 추정(스위치를 잠깐 켠 동안) — 정산 계약대로 예약액 보존.
- **상한의 성격:** "본문 바이트 ≥ 토큰" 은 countTokens 9가지 문자 종류 실측(최대 1.000)으로 확인한 전제이고 Google 문서가 보장한 값이 아니다. 사진 토큰은 공식 표 값, 출력은 maxOutputTokens(3.x 사고 포함은 실측). 이 전제 위에서는 허용되는 모든 입력에 대해 상한이 성립하고, 전제가 깨지면 \`ai_ops_overrun\` 이 그날 그 기능을 멈춘다.
- **Production 전환 순서:** §3(10-02 개정) — 섞인 조합은 모두 요청 전에 닫히므로 Pages·Worker 순서 무관. 예전의 'Pages 먼저'·'Worker 먼저' 문구는 폐기.
