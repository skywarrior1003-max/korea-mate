# Place Usage 월별 집계 자동 운영 (MONTHLY-AUTOMATION-V1)

작성 2026-09-26 · 적용: Staging(076) / Production 은 별도 Owner 승인 릴리스

## 1. Job 목록

| Job 이름 | UTC cron | KST 표시 | 명령 |
|---|---|---|---|
| `gokoreamate-place-usage-monthly-maintenance-v1` | `17 18 * * *` | 매일 03:17 | `SELECT public.place_usage_monthly_maintenance();` |
| `gokoreamate-cron-history-retention-90d-v1` | `47 18 * * 6` | 매주 일요일 03:47 | `SELECT public.cron_history_retention_90d();` |

DB timezone 은 UTC 그대로다 — cron 식만 UTC 로 적고, 월 경계 판단은 함수
내부의 `place_usage_kst_month`(Asia/Seoul)가 한다.

## 2. maintenance 처리 순서

① advisory lock(동시 실행 직렬화) → ② 종료된 미확정 KST 월 탐색 —
**monthly 에 open 으로 남은 과거 월 ∪ raw 에만 존재하는 과거 월**(cron 이
며칠 죽어도 사람이 월을 지정할 필요 없이 자동 복구) → ③ 각 월을
`place_usage_monthly_finalize()` 로 확정(하나라도 실패하면 **전체 롤백** —
반쪽 확정 없음, 다음 실행이 재시도) → ④ 현재 월 `refresh_open()` exact
스냅숏 → ⑤ 비식별 요약 반환(확정 월 수·refresh 행 수·시각).

## 3. 성공·실패 확인

```sql
-- 최근 실행 이력(성공: status='succeeded')
SELECT j.jobname, d.status, d.start_time, d.end_time, d.return_message
  FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
 ORDER BY d.start_time DESC LIMIT 20;

-- 수동 실행(관리 SQL 콘솔)
SELECT * FROM public.place_usage_monthly_maintenance();

-- 중복 job 확인(이름당 정확히 1행이어야 정상)
SELECT jobname, count(*) FROM cron.job GROUP BY 1;
```

## 4. 일시 중지 / 재활성화 / 제거

```sql
-- 일시 중지
UPDATE cron.job SET active = false WHERE jobname = 'gokoreamate-place-usage-monthly-maintenance-v1';
-- 재활성화
UPDATE cron.job SET active = true  WHERE jobname = 'gokoreamate-place-usage-monthly-maintenance-v1';
-- 완전 제거(rollback)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'gokoreamate-place-usage-monthly-maintenance-v1';
```

076 migration 은 재적용해도 안전하다(동일 정의면 그대로, 다르면 교체·
다른 이름의 job 무접촉) — 제거 후 재등록도 076 재실행이 아니라 위
`cron.schedule` 한 줄이면 된다.

## 5. 이력 보관

`cron.job_run_details` 는 자동 정리되지 않으므로 매주 90일 초과분만
삭제한다. 실행 중(`end_time IS NULL`)·90일 이내 기록·job 정의는 보존.
이 DB 의 cron job 은 전부 gokoreamate 소유(도입 시점 기존 job 0 실측)라
전체 이력에 적용한다.

## 6. 아직 하지 않는 것

- **원본 `place_usage` 1년 파기: 비활성** — 별도 Owner 승인 TASK 에서
  집계 검증·추천 원천 전환 후에만 스케줄을 만든다.
- 추천 RPC(071)는 여전히 raw 를 읽는다 — 전환은 다음 단계.
- 함수는 anon/authenticated 실행 불가(REVOKE), cron 테이블은 앱 API 에
  노출되지 않는다(REST 404 실측).
