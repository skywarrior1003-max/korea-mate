# AI 비상정지 Runbook (V2-AI-HARDCAP §8)

작성 2026-09-25 · 적용 대상: Staging(072 적용됨) / Production(072 미적용 — Owner 승인 후 별도 릴리스)

## 1. 정지 수단 요약 (빠른 것부터)

| 수단 | 반영 | 배포 필요 | 범위 |
|------|------|-----------|------|
| **DB 스위치** `ai_ops_switches` UPDATE | ≤30초(isolate 캐시 TTL) | 없음 | Pages API 전 AI 경로 |
| env `AI_MODE=off` (Cloudflare 변수) | 재배포 1회 필요 | 있음 | 전 AI 경로(최상위 게이트) |
| Worker env (`AI_WRITING_WORKER_MODE`/`CURATOR_MODE`) | Worker 재배포 | 있음 | 해당 Worker |

기본값이 안전측이다: 스위치 행 부재·오타·조회 실패·env 누락 = **차단**.
현재 Production 은 `AI_MODE=off` 라 어떤 스위치와 무관하게 AI 전 경로가 이미 닫혀 있다.

## 2. 전체 비상정지 (배포 없음)

Supabase SQL Editor(또는 Management API)에서:

```sql
UPDATE public.ai_ops_switches SET value_text = 'off', updated_at = now()
WHERE ops_key = 'ai_master';
```

- 모든 AI 기능이 최대 30초 안에 차단된다(다음 isolate 캐시 만료 시).
- 기본 일정 생성·조회 등 비AI 기능은 영향 없다(사용자 문구: "AI 기능을 잠시 사용할 수 없어요").

## 3. 기능별 정지

```sql
UPDATE public.ai_ops_switches SET value_text = 'off', updated_at = now()
WHERE ops_key = 'feature_personalize';   -- 일정 개인화만
-- feature_writing / feature_import_analyze / feature_itinerary_legacy
-- / feature_curator / feature_canary 동일 패턴
```

## 4. 재개

`'live'` 로 UPDATE. **master 와 기능 스위치가 둘 다 'live'** 여야 해당 기능이 열린다.
(env `AI_MODE` 가 off 면 스위치가 live 여도 열리지 않는다 — env 가 최상위.)

## 5. 예산 상한 변경 (배포 없음)

```sql
UPDATE public.ai_ops_switches SET value_text = '5000000',  updated_at = now() WHERE ops_key = 'budget_daily_usd_micro';   -- $5/일
UPDATE public.ai_ops_switches SET value_text = '60000000', updated_at = now() WHERE ops_key = 'budget_monthly_usd_micro'; -- $60/월
```

상한 도달 시 예약(ai_ops_reserve)이 거부되어 provider 호출 자체가 일어나지 않는다.

## 6. 원장 점검 쿼리

```sql
-- 오늘 사용액(µ$) — released 제외(=미과금 확정만 제외, unknown 은 계상)
SELECT COALESCE(SUM(COALESCE(committed_usd_micro, reserved_usd_micro)),0) AS today_usd_micro
FROM public.ai_ops_ledger
WHERE status <> 'released' AND created_at::date = now()::date;

-- 정산 안 된 예약(요청 도중 죽은 것 — reserved 로 남아 예산에 계속 계상됨: 안전측)
SELECT id, route, reserved_usd_micro, created_at FROM public.ai_ops_ledger
WHERE status = 'reserved' AND created_at < now() - interval '10 minutes';
```

## 7. 주의

- `ai_ops_switches`/`ai_ops_ledger` 는 RLS on + service_role 전용이다. anon 키로는 읽기·쓰기 모두 불가(정상).
- 스위치 값은 소문자 `live`/`off` 만 의미 있다. 그 외 값은 전부 차단으로 해석된다.
- unknown_billed 는 "과금 여부 불명 — 예약액 보존"이다. 비용 0 으로 되돌리려면 provider 콘솔에서 실제 미과금을 확인한 뒤에만 수동 조정한다.
