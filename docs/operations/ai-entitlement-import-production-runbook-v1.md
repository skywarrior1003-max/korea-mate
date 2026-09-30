# AI 무료 이용 권리 · 외부 일정 가져오기 — Production 전환 런북 v1

작성 2026-09-30 · 정책: 2026-09-25 Owner 작업 지시 기준(Owner 2026-09-30 확인) — 087 · '월' 갱신 시점과 최초 보너스 만료는 미정(0절) · 브랜치 `feature/external-trip-import-v2` · **Owner 가 Preview 화면을 확인하기 전에는 아래 어떤 단계도 실행하지 않는다.**

## 0. 정책 — 2026-09-25 Owner 작업 지시 기준(2026-09-30 Owner 확인) · 087

- 일정 만들기(plan) **월 1회** — 글·링크 가져오기 분석과 고코리아메이트 AI 스케줄러(개인화·레거시 생성)가 공유.
- **신규 회원 최초 보너스 1회** — plan 에 계정당 1회(가져오기 전용 아님, 매월 재지급 없음). "가져오기 1회 → AI 스케줄러 1회"를 둘 다 경험할 수 있다.
- 전체 여행 AI 글쓰기(writing) **월 2회** — My Trip·Story 공유. 한 번의 요청으로 여행 제목·Story·모든 기록의 제목·내용을 3가지 표현으로 받으면 1회.
- 차감 0: 기본 일정·추천 코스·직접 편집·사진 업로드·Story 열람·공유카드·실패·저장 결과 재열람.
- **원문에 없는 값(Owner 결정 대기)**: '월' 갱신 시점 — 084 의 `ai_user_period_now()`(서울 시각 달력 월)를 그대로 쓴다. 최초 보너스 만료 — 규칙 없음(쓰기 전까지 남음). 바꿀 때는 DB 함수 한 곳.
- 09-21 인계서의 "30일 통합 1회"(086)는 다시 적용하지 않는다.

### (기록) 정책 원문 대조 — 2026-09-30 오전 시점 "미확정" 판정

두 원문이 충돌하고, 둘 중 어느 쪽을 최신으로 승인했는지 Owner 기록이 확인되지 않았다. Staging 에 구현된 것은 아래 A안이며, **확정 정책이 아니라 현재 구현 상태**다. 결정 전에는 B안 전환도, A안의 Production 적용도 하지 않는다.

| | A. 30일 이동 구간 통합 1회 | B. 월 개인화 1 + 글쓰기 2 |
|---|---|---|
| 원문 | `gokoreamate-ai-cost-payment-system-handoff-2026-09-21.md` §0-2·3, §1.1: "무료 사용자는 비용이 발생하는 AI 기능을 30일 이동 구간당 1회", "무료 1회는 스케줄러와 스토리가 공유" | V2-HARDCAP TASK 본문(2026-09-25 14:43 KST, Owner 가 붙여넣은 지시) §2 "무료 이용 정책": "AI 일정 개인화: 월 1회 무료 / Story·My Trip 전체 여행 AI 글쓰기: 월 2회 무료(공유) / 합계 월 3회" + "과거 `30일당 통합 1회` 제안이 다시 적용되지 않도록" |
| 작성 주체 | 작성자 이름 없음. "전달 대상: 메인 개발 컴퓨터 / 구현 담당 AI" | Owner 가 대화에 붙여넣은 작업 지시(작성 도구 표기 없음) |
| 승인 표기 | 본문 표제는 "확정 정책". §18(메인 컴퓨터 실행 지시문) "감사 결과를 먼저 보고하고 Owner 승인 전에는 구현하지 않는다", §4 "정확한 시간 기준은 구현 전 제품 책임자가 최종 승인해야 한다" | "정책 충돌 시 아래 Owner 최신 결정을 최우선으로 적용한다" |
| 날짜 | 문서 작성일 2026-09-21(파일은 저장소 밖 Downloads, 09-23 저장) | 2026-09-25 |
| 저장소 반영 | 없음(2026-09-30 이전) | `src/lib/ai-policy/usage-policy.ts` d6991f9c(상수만, 차감 구현 없음) |
| 적용 범위 | AI 1~5일 전체 일정 생성, 여행 종료 후 스토리(3문체=1회). 직접 편집·사진·메모 0 | AI 일정 개인화, Story/My Trip 전체 여행 글쓰기. 기본 일정·직접 편집 0 |
| 외부 일정 가져오기 | **명시 없음** | **명시 없음**(§3 에서 `/api/import/analyze` 는 비용 게이트 대상 경로로만 등장) |
| 사진별 AI 제안 | **명시 없음**(사진 저장 0 만 명시) | **명시 없음** |

- 2026-09-30 두 차례 작업 지시에서 A안을 "2026-09-21 Owner 확정"으로 적었으나, 09-25 B안 이후에 A안을 다시 승인한 별도 기록은 확인되지 않았다.
- 적용된 `084` 머리말의 "월 3회 + 첫 가져오기 추가 1회"는 A·B 어느 원문에도 없는 구현 중 해석이다. 동작은 `086` 이 대체했다. 적용된 파일은 수정하지 않는다(체크섬 보존).

### Staging 현재 구현(A안 기준, 확정 아님)

- 마지막 성공 사용부터 30일에 무료 1회. 개인화(옵트인)·스토리 AI 글(표지·기록 문구)·사진별 AI 제안(버튼)·가져오기 분석·레거시 AI 일정 생성이 같은 1회를 쓴다(가져오기·사진 제안 포함은 원문에 없는 확장 — Owner 결정 항목).
- 차감 0: 기본 일정, 추천 코스, 직접 편집, 사진 저장, 재방문, 같은 요청 재전송, 실패·타임아웃·무효·중복.
- 결제 없음: 유료 잔액 표시 없음, 소진 뒤 다음 가능 날짜 안내.

### B안으로 결정될 때 필요한 후속(산출만 — 결정 전 실행 금지)

- DB `087`(Staging 먼저): `ai_user_reserve`·`ai_user_balance` 를 기능별 월 풀로 교체 — personalize 월 1, writing 월 2(Story·My Trip 공유), 월 기준 시각(KST 달력 등) 결정 필요. 084·086 은 그대로 두고 덮어쓴다. 기존 `shared_30d` 행은 이력으로 남긴다.
- 가져오기·사진별 제안의 풀: B안 원문에 없으므로 별도 결정 필요(글쓰기 풀 / 개인화 풀 / 별도 / 무료 제외).
- 코드: `functions/_lib/ai-user-quota.ts`(풀 이름·잔액 모양), `src/lib/ai-policy/usage-policy.ts`(`FREE_AI` → 월 상수), 잔액·소진 문구 4언어(`importer.balance*`·`errQuota`·`freeAi.*`: "30일에 1회" → 월 기준), `ImportClient`·`FreeAiUsedNote` 날짜 안내, 가드 테스트(`ai-safety-guard`·`import-quota-guard`).
- 영향 없는 부분: 가져오기 추출 방식(원문 보존), 무차감 규칙, 재응답, Preview 전용 Worker 경로.

### 정책·구현 이력

| 시점 | 무엇 | 상태 |
|---|---|---|
| 2026-09-21 | 인계서 A안 | 저장소 밖 문서. 승인 전 구현 금지 조건 포함 |
| 2026-09-25 | 작업 지시 B안 → `usage-policy.ts` 상수 | 차감 구현 없음 |
| 2026-09-30 | Staging 084(월 풀 + 첫 가져오기 1회, 미승인 해석) | 적용됨 · 086 이 대체 |
| 2026-09-30 | Staging 086 + 코드(A안) | 적용·검증 — 정책 미확정 |
| Production | 사용자별 원장·RPC 없음. 사용자 자격 확인은 항상 통과(`checkUserEntitlementPlaceholder`). 실제 차단은 회사 원장 072 스위치(전부 off) | 미적용 |

## 1. 적용 순서

| 단계 | 내용 | 실행 주체 | 되돌림 영향 |
|---|---|---|---|
| 1 | DB `084_ai_user_usage_ledger.sql` | Owner 승인 후 SQL Editor | 표·함수 추가만(기존 표 무변경). 코드가 아직 부르지 않으므로 사용자 영향 0 |
| 2 | DB `085_user_spots_import_source.sql` | 〃 | `user_spots.import_source` nullable 컬럼 추가. 기존 행 NULL |
| 3 | DB `086_ai_user_usage_shared_30d.sql` | 〃 | `ai_user_reserve`·`ai_user_balance` 교체(30일 이동 구간). 084 의 월 풀 함수는 남지만 호출처 0 |
| 3-1 | DB `087_ai_user_usage_monthly_plan_writing.sql` | 〃 | 086 의 두 함수를 월 사용권(plan 월1+최초1 · writing 월2)으로 교체 + `mytrip_ai_generations.feature` 에 `fullTrip` 허용. 086 단독 상태로 코드를 내보내지 않는다 |
| 4 | 코드 병합(master) → Pages 자동 배포 | Owner 승인 후 | 코드만 되돌리면 표·컬럼은 남는다. 이전 코드는 `import_source`·`ai_user_usage` 를 읽지 않으므로 동작 영향 0 |
| 5 | 환경·Worker·기능 스위치 | Owner 승인 후 | 스위치 off 로 즉시 차단(재배포 불필요) |

**085 는 반드시 4 보다 먼저** — 새 코드의 내 장소 목록 조회(`/api/user-spots` GET)가 `import_source` 를 select 한다. 컬럼이 없으면 목록 조회가 실패한다.

### 5단계 세부(순서대로, 한 번에 하나)

1. Production Worker `gokoreamate-ai-writing` 의 `AI_WRITING_WORKER_MODE` 를 `live` 로(현재 `off`). 이 Worker 는 개인화·스토리 글쓰기·가져오기 분석의 provider 경유지다.
2. Pages Production `AI_MODE=live` 확인(비밀값 — 값은 대시보드에서만 확인).
3. DB `ai_ops_switches`: `ai_master=live` → 기능별로 하나씩 `feature_import_analyze`·`feature_personalize`·`feature_writing` 을 `live`.
4. `feature_itinerary_legacy`·`feature_curator`·`feature_canary` 는 **off 유지**(이번 범위 밖).

## 2. 단계별 검증 쿼리(Production, 읽기 전용)

```sql
-- 1·3 적용 확인
select to_regclass('public.ai_user_usage') is not null as usage_table,
       (select pg_get_constraintdef(oid) from pg_constraint
         where conrelid = 'public.ai_user_usage'::regclass and conname = 'ai_user_usage_pool_check') as pool_check,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
         and proname in ('ai_user_reserve','ai_user_settle','ai_user_balance','ai_user_free_window')) as rpc_count;
-- 기대: true · pool_check 에 'shared_30d' 포함 · rpc_count = 4

-- 권한: 일반 클라이언트 실행 불가
select has_function_privilege('anon', 'public.ai_user_reserve(uuid,text,text)', 'execute') as anon_exec,
       has_function_privilege('authenticated', 'public.ai_user_reserve(uuid,text,text)', 'execute') as auth_exec;
-- 기대: false · false

-- 2 적용 확인
select count(*) from information_schema.columns
 where table_schema = 'public' and table_name = 'user_spots' and column_name = 'import_source';
-- 기대: 1

-- 5 스위치 상태
select ops_key, value_text from public.ai_ops_switches order by ops_key;

-- 운영 중 관찰(원문 없음 — 기능·상태만)
select feature, status, count(*) from public.ai_user_usage
 where created_at > now() - interval '1 day' group by 1, 2 order by 1, 2;
-- 087 이후 pool 은 plan | writing. 한 사용자·한 달에 plan committed(period=YYYY-MM) 2행 이상 또는 writing 3행 이상이면 이중 차감
-- 'reserved' 가 5분 넘게 남아 있으면 이상(다음 reserve 때 자동 release 되지만 원인 확인)
select route, status, count(*), sum(committed_usd_micro) from public.ai_ops_ledger
 where created_at > now() - interval '1 day' group by 1, 2 order by 1, 2;
```

## 3. 중단 조건(하나라도 해당하면 즉시 스위치 off 후 보고)

- 같은 사용자·같은 달에 plan `committed`(period=YYYY-MM) 2행 이상, 또는 writing 3행 이상(이중 차감). 최초 보너스(period='welcome')는 계정당 1행.
- `reserved` 가 5분 넘게 계속 쌓임, 또는 `ai_user_reserve` 오류로 AI 기능 전체가 `ai_paused`.
- 일일 비용이 `budget_daily_usd_micro`(현재 $5)의 50% 를 첫날에 넘김.
- `/api/user-spots` GET 5xx(085 누락 신호).
- 응답·로그에 키 형태 문자열(`AIza…`, 서비스 키) 노출.
- 무료 1회 소진 사용자에게 AI 결과가 계속 나감(스위치·원장 우회).

중단: `update public.ai_ops_switches set value_text = 'off' where ops_key = 'ai_master';` — 모든 AI 기능이 provider 호출 전에 막힌다(기본 일정·직접 편집·가져온 일정 보기는 계속 동작).

## 4. Production AI 스위치의 다른 기능 영향

| 스위치 | 켜면 영향받는 기능 |
|---|---|
| `ai_master` | 모든 AI 기능의 공통 전제. 단독으로는 아무 기능도 켜지 않는다(기능 스위치 AND) |
| `feature_personalize` | 일정 화면 "AI로 내 취향 반영하기"(옵트인·확인 후) |
| `feature_writing` | 전체 여행 AI 글쓰기(`/api/mytrip/writing-full`, 월 2회). 제목·기록별·표지 개별 AI 는 닫혀 있다(`retired_use_full_trip`) |
| `feature_import_analyze` | `/import` 글 붙여넣기·링크 분석 |
| Worker `AI_WRITING_WORKER_MODE` | 위 세 기능의 provider 경유지 — off 면 세 기능 모두 실패(무차감) |

Trend curator(별도 Worker·`feature_curator`)·canary·레거시 일정 생성은 이 전환과 무관하며 off 유지.

## 5. Preview 전용 AI 경로(검증용, Production 무관)

- Preview 배포는 `wrangler.toml [env.preview]` 로 `AI_WRITING` → `gokoreamate-ai-writing-preview`(서울 배치·`WORKER_ENV=preview`)만 부른다. Production 은 최상위 설정 그대로 `gokoreamate-ai-writing`.
- 연결 진단(비용 0): 로그인 후 `GET /api/import/analyze?diag=route`(Production 에서는 무시) → `worker_env·mode·has_key·colo`.
- Preview 전용 Worker 에 Preview 전용 Google 키(`GEMINI_API_KEY`)가 들어가면 Pages Preview 의 비밀값 `AI_PROVIDER_ROUTE` 를 삭제해 임시 직접 호출을 끝낸다.
- 비 Production 의 AI 게이트(`aiAllowed`)는 Pages 쪽에도 `GEMINI_API_KEY` 존재를 요구한다(Worker 경유여도). Preview Pages 에 이미 있는 값을 유지한다.
