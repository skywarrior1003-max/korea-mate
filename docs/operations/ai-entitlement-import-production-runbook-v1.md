# AI 무료 이용 권리 · 외부 일정 가져오기 — Production 전환 런북 v1

작성 2026-09-30 · 브랜치 `feature/external-trip-import-v2` · **Owner 가 Preview 화면을 확인하기 전에는 아래 어떤 단계도 실행하지 않는다.**

## 0. 정책(구현 기준)

- 비용이 드는 AI 도움은 **마지막 성공 사용부터 30일 이동 구간에 무료 1회**.
- 같은 1회를 쓰는 기능: AI 일정 개인화(옵트인), 스토리 AI 글쓰기(표지·기록 문구), 사용자가 누른 사진별 AI 제안, 외부 일정 가져오기 분석, 레거시 AI 일정 생성(스위치 off·도달 소비처 0).
- 차감 0: 기본(규칙 기반) 일정, 추천 코스, 직접 편집(이름·시간·메모), 사진 저장, 재방문, 같은 요청 재전송(저장 결과 재응답), 실패·타임아웃·무효 결과·중복 클릭.
- 결제 없음: 유료 잔액을 표시하지 않고, 무료 1회 소진 뒤 AI 호출을 막는다(다음 가능 날짜 안내).
- 주의: 적용된 `084` 파일 머리말의 "월 3회 + 첫 가져오기 추가 1회" 문구는 **승인되지 않은 초안의 기록**이다. 동작은 `086` 이 교정한다. 적용된 파일은 수정하지 않는다(체크섬 보존).

### 정책·구현 이력(대조 결과)

| 시점 | 무엇 | 근거 | 상태 |
|---|---|---|---|
| 2026-09-21 | Owner 확정: 비용 AI 30일 이동 구간 무료 1회, 스케줄러·Story 공유 | Owner 진술(2026-09-30 TASK). 저장소·세션 기록에 원문 없음 | 정책 확정(원문 미확인) |
| 2026-09-25 | `usage-policy.ts`(d6991f9c) — 월 개인화 1 + 글쓰기 2 = 3, "30일당 통합 1회" 금지값 처리 | V2-HARDCAP TASK 본문 | 코드 상수만(차감 구현 없음) — 이후 교정됨 |
| 2026-09-30 | Staging 084 — 월 풀 + 첫 가져오기 추가 1회 | 구현 중 해석(미승인) | Staging 적용 · 동작은 086 이 대체 |
| 2026-09-30 | Staging 086 + 코드(7aad5336 이후) — 30일 이동 구간 공유 1회 | Owner 교정 지시 | Staging 적용·검증 |
| Production | 사용자별 원장·RPC 없음. AI 엔드포인트의 사용자 자격 확인은 `checkUserEntitlementPlaceholder`(항상 통과). 실제 차단은 회사 원장 072 스위치(전부 off) | 2026-09-30 읽기 전용 대조 | 미적용 |

## 1. 적용 순서

| 단계 | 내용 | 실행 주체 | 되돌림 영향 |
|---|---|---|---|
| 1 | DB `084_ai_user_usage_ledger.sql` | Owner 승인 후 SQL Editor | 표·함수 추가만(기존 표 무변경). 코드가 아직 부르지 않으므로 사용자 영향 0 |
| 2 | DB `085_user_spots_import_source.sql` | 〃 | `user_spots.import_source` nullable 컬럼 추가. 기존 행 NULL |
| 3 | DB `086_ai_user_usage_shared_30d.sql` | 〃 | `ai_user_reserve`·`ai_user_balance` 교체(30일 이동 구간). 084 의 월 풀 함수는 남지만 호출처 0 |
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
-- 'reserved' 가 5분 넘게 남아 있으면 이상(다음 reserve 때 자동 release 되지만 원인 확인)
select route, status, count(*), sum(committed_usd_micro) from public.ai_ops_ledger
 where created_at > now() - interval '1 day' group by 1, 2 order by 1, 2;
```

## 3. 중단 조건(하나라도 해당하면 즉시 스위치 off 후 보고)

- 같은 사용자에게 30일 안 `committed` 가 2행 이상 생김(이중 차감).
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
| `feature_writing` | 스토리 표지 AI 글, 기록 사진별 AI 제안(버튼), 여행 제목·메모 AI 제안 — 모두 같은 무료 1회 |
| `feature_import_analyze` | `/import` 글 붙여넣기·링크 분석 |
| Worker `AI_WRITING_WORKER_MODE` | 위 세 기능의 provider 경유지 — off 면 세 기능 모두 실패(무차감) |

Trend curator(별도 Worker·`feature_curator`)·canary·레거시 일정 생성은 이 전환과 무관하며 off 유지.

## 5. Preview 전용 AI 경로(검증용, Production 무관)

- Preview 배포는 `wrangler.toml [env.preview]` 로 `AI_WRITING` → `gokoreamate-ai-writing-preview`(서울 배치·`WORKER_ENV=preview`)만 부른다. Production 은 최상위 설정 그대로 `gokoreamate-ai-writing`.
- 연결 진단(비용 0): 로그인 후 `GET /api/import/analyze?diag=route`(Production 에서는 무시) → `worker_env·mode·has_key·colo`.
- Preview 전용 Worker 에 Preview 전용 Google 키(`GEMINI_API_KEY`)가 들어가면 Pages Preview 의 비밀값 `AI_PROVIDER_ROUTE` 를 삭제해 임시 직접 호출을 끝낸다.
- 비 Production 의 AI 게이트(`aiAllowed`)는 Pages 쪽에도 `GEMINI_API_KEY` 존재를 요구한다(Worker 경유여도). Preview Pages 에 이미 있는 값을 유지한다.
