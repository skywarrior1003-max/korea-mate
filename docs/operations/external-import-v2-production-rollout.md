# 외부 일정 가져오기 V2 — Production 전환 순서·중단·되돌림 (검토본)

작성 2026-09-30 · 기준 브랜치 `feature/external-trip-import-v2` · **이 문서는 실행 지시가 아니다.** 병합·배포·DB 적용·스위치 변경은 Owner 승인 뒤 별도 작업에서 한다.

## 0. 지금 상태 (2026-09-30 확인)

| 대상 | Staging / Preview | Production |
|---|---|---|
| DB 084~087 | 적용됨 | **미적용** (읽기 확인: `ai_user_usage` 테이블·`ai_user_*` 함수·`user_spots.import_source` 모두 없음) |
| Pages 코드 | 이 브랜치 Preview | master (이 브랜치 미병합) |
| AI Worker | `gokoreamate-ai-writing-preview` (이 브랜치 코드, 모델 3.5 Flash-Lite) | `gokoreamate-ai-writing` (master 코드, 모델 2.5 Flash, 호출 제한 **8초 고정**) |
| AI 스위치 | ai_master·import·personalize live | **ai_master off · 모든 기능 off** · 일일 $5 · 월 $60 |

## 1. 바뀌는 것

- **DB**
  - 084: 사용자 무료 횟수 원장 `ai_user_usage`와 예약·정산·잔여 함수(service_role 전용).
  - 085: `user_spots.import_source` 선택 컬럼. 추가만 한다.
  - 086: 30일 공유 정책. 087이 대체하는 중간 단계다.
  - 087: 월 1회 + 신규 1회, 글쓰기 월 2회. `mytrip_ai_generations`의 기능 값을 확장한다.
- **Pages Functions:** 가져오기 분석(`/api/import/analyze`), 가져온 장소 보존(`/api/user-spots/from-import`), 여행 전체 글쓰기(`/api/mytrip/writing-full`), 개인화·글쓰기의 사용자 횟수 연결, 공유 Story 장소 결합, 개인화 회사 원장 열쇠 수정(6d796299), 관리자 canary의 막힘 표시.
- **AI Worker:** 아래 기능이 추가된다. 2.5 요청 본문은 그대로다.
  - 3.x 요청 설정 변환
  - 거절 응답에 `x-gkm-provider-called: 0` 표시
  - 실제로 부른 모델을 `x-gkm-model`로 알림
  - `x-provider-timeout-ms`(8~45초) · `x-provider-max-bytes`(12MB까지) 존중
  - `/models`(내부 인증 필요)
  - `/probe`(`WORKER_ENV=preview`에서만)
- **설정:** 루트 `wrangler.toml`의 `[env.preview]` 서비스 연결은 Preview 전용이다. Production 연결(`gokoreamate-ai-writing`)은 그대로다.

## 2. 적용 순서와 이유

1. **사전 기록.** Production 스위치 값을 기록해 둔다(현재 전부 off). 되돌릴 Pages 배포 id와 Worker 버전 id도 기록한다.
2. **DB 084 → 085 → 086 → 087**을 순서대로 각 1회만 적용한다.
   - master 코드는 이 테이블·함수를 부르지 않으므로 먼저 적용해도 현재 서비스에 영향이 없다.
   - 086·087은 084의 함수를 `CREATE OR REPLACE`로 교체하고 제약을 다시 만든다. 순서를 바꾸면 087 정책이 086으로 덮인다.
   - 적용 뒤에는 함수 3종의 존재와 grant(service_role만 실행 가능)를 읽기로 확인한다.
3. **Production Worker 배포** — Pages 코드보다 먼저.
   - master Worker는 8초에 끊는다. Preview에서 블로그 가져오기는 7~12초가 걸렸다(09-30 실측 13건).
   - 여행 전체 글쓰기(사진 포함)는 긴 제한과 큰 본문을 요청하는데, master Worker는 이 요청을 존중하지 않는다.
   - 새 Worker는 2.5 요청을 바꾸지 않으므로 master Pages와도 호환된다.
   - 배포 뒤 `/health`에서 `worker_env=production`을 확인한다(provider 호출 0).
4. **Pages 병합·배포.** 반드시 2·3 이후에 한다.
   - DB가 없으면 사용자 횟수를 셀 수 없다. 코드는 fail-closed라 AI 기능이 전부 "사용 불가"가 된다(안전하지만 장애다).
5. **스위치는 기능별로 따로 켠다.** `ai_master`를 켜기 전에 기능 스위치는 off로 둔다. 1차는 import만 live로 두고 스모크를 한 뒤, personalize·writing을 순서대로 켠다. 예산 값은 바꾸지 않는다.
6. **스모크(합성 계정).**
   - `scripts/qa/ai-user-path-check.mjs`의 기본 모드(AI 0)는 Staging·Preview 전용 도구다. Production에서 같은 확인을 하려면 별도 승인과 도구 조정이 필요하다.
   - 가져오기 1건(글) · 저장 · 재방문을 확인한다.

## 3. 중단 조건

- DB 적용 중 오류가 나면 다음 migration으로 넘어가지 않는다. 이미 적용된 084~085는 master가 쓰지 않으므로 그대로 두어도 무해하다.
- Worker 배포 뒤 `/health` 이상, 또는 기존 글쓰기(2.5)의 오류율이 오르면 Pages 병합 전에 멈추고 Worker를 되돌린다.
- 스위치를 켠 뒤 아래 중 하나가 보이면 해당 기능 스위치를 즉시 off로 돌린다. 배포 없이 적용된다.
  - 가져오기의 `fail_class`에서 `edge_52x`·`timeout`·`parse_max_tokens`가 반복된다(기준 예: 1시간 10건 중 3건 이상).
  - 회사 원장에서 `unknown_billed` 비율이 오른다.
  - 사용자 차감 불일치: committed인데 결과가 없다.

## 4. 되돌림

| 대상 | 방법 | 비고 |
|---|---|---|
| 스위치 | `ai_ops_switches`의 기능 값을 off로 | 즉시 · 가장 먼저 쓰는 수단 |
| Pages | 기록한 이전 배포로 rollback | DB는 그대로 두어도 된다 |
| Worker | `wrangler rollback`으로 기록한 버전 | master Pages는 새 헤더 없이도 동작 |
| DB | **되돌리지 않는 것을 기본으로** | 새 테이블·함수·선택 컬럼만 더한다. 제거가 꼭 필요하면 별도 승인된 SQL로(사용자 횟수 기록 보존 여부 먼저 결정) |

## 5. 아직 확정하지 않은 것 (이 검토로 판단하지 않는다)

- **모델.** Preview 13건 성공(3.5 Flash-Lite)은 표본이 작다. Production Worker 모델은 2.5 Flash이고, 가져오기 스키마·프롬프트 수정은 **2.5에서 검증하지 않았다**. Preview 키 프로젝트에서는 2.5를 쓸 수 없다(404). 전환 전 2.5 검증 방법 또는 모델 결정이 필요하다.
- **520·시간 초과.** 원인은 아직 확정하지 않았다. 재발하면 `fail_class`로 구분해 기록한다(1ad4314b).
- **관리자 AI canary.** provider 검증 도구로서는 퇴역했다. 로그인 계약 때문에 provider에 가지 못하고, 이제 `blocked_*`로 답한다. Production 키와 Production 환경에서의 실호출 검증은 이 도구로 할 수 없다. 합성 계정 사용자 경로 검사로 대신하려면 Production 합성 계정 정책을 결정해야 한다.
- **실측하지 않은 것.** 실제 휴대전화의 튜토리얼·공유 창, 신규 Google OAuth.
