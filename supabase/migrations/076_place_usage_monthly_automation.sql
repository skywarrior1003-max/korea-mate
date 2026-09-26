-- 076: 월별 집계 자동 운영 (PLACE-USAGE-MONTHLY-AUTOMATION-V1)
--
-- 구성: ① pg_cron 설치 ② maintenance wrapper(종료 월 catch-up 확정 + 현재 월
-- exact refresh, 단일 트랜잭션) ③ cron 이력 90일 정리 함수 ④ 스케줄 2건
-- (매일 KST 03:17 maintenance · 매주 일요일 KST 03:47 이력 정리).
--
-- 계약:
--  · DB timezone 은 UTC 그대로 — cron 식은 UTC 로 적고(17 18 * * * = KST 03:17,
--    47 18 * * 6 = 토 18:47 UTC = 일 03:47 KST), 월 경계 판단만 기존
--    place_usage_kst_month(Asia/Seoul) 를 쓴다.
--  · maintenance 1회 = 1 트랜잭션: 어느 finalize 든 실패하면 RAISE 로 전체
--    롤백 — 일부 월만 확정된 반쪽 상태가 없고, 다음 실행이 그대로 재시도한다.
--  · catch-up: monthly 에 open 으로 남은 과거 월 ∪ raw 에만 존재하는 과거 월
--    (cron 이 며칠 죽었다 살아나도 사람이 월을 지정할 필요가 없다).
--  · 스케줄 등록은 멱등: 같은 이름·같은 정의면 그대로, 정의가 다르면 교체,
--    다른 이름의 job 은 무접촉. secret·HTTP 호출·외부 의존 0.
--  · 반환은 비식별 요약(확정 월 수·refresh 행 수·실행 시각)뿐이다.

BEGIN;

-- ── ① pg_cron (재적용 안전) ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── ② maintenance wrapper ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.place_usage_monthly_maintenance()
RETURNS TABLE (finalized_months INT, refreshed_rows BIGINT, ran_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current DATE := public.place_usage_kst_month(now());
  v_month   DATE;
  v_fin     INT := 0;
  v_res     RECORD;
  v_ref     BIGINT := 0;
BEGIN
  -- 상위 maintenance lock — 동시 실행 직렬화(내부 refresh 의 lock 은 같은
  -- 트랜잭션에서 재획득 가능하므로 충돌하지 않는다)
  PERFORM pg_advisory_xact_lock(hashtext('place_usage_monthly_maintenance'));

  -- 종료된 미확정 월 = monthly open 과거 월 ∪ raw 에만 있는 과거 월(누락 복구)
  FOR v_month IN
    SELECT DISTINCT s.m FROM (
      SELECT month_start AS m FROM public.place_usage_monthly
       WHERE status = 'open' AND month_start < v_current
      UNION
      SELECT public.place_usage_kst_month(created_at) AS m FROM public.place_usage
       WHERE public.place_usage_kst_month(created_at) < v_current
    ) s
    WHERE NOT EXISTS (
      SELECT 1 FROM public.place_usage_monthly f
       WHERE f.month_start = s.m AND f.status = 'finalized')
    ORDER BY s.m
  LOOP
    SELECT * INTO v_res FROM public.place_usage_monthly_finalize(v_month);
    IF NOT v_res.ok THEN
      -- 전체 롤백 — 반쪽 확정 금지. 다음 실행에서 같은 월부터 재시도된다.
      RAISE EXCEPTION 'place_usage_monthly_maintenance: finalize % failed (%)', v_month, v_res.reason;
    END IF;
    v_fin := v_fin + 1;
  END LOOP;

  SELECT r.refreshed_rows INTO v_ref FROM public.place_usage_monthly_refresh_open() r;

  RETURN QUERY SELECT v_fin, v_ref, now();
END $$;

-- ── ③ cron 실행 이력 90일 정리 ─────────────────────────────────────────────
-- cron.job_run_details 는 자동 정리되지 않는다(공식 문서). 이 DB 의 cron job
-- 은 전부 gokoreamate 소유(도입 시점 기존 job 0 실측)이므로 전체 이력에
-- 적용한다. 실행 중(end_time IS NULL) 행과 90일 이내 기록은 보존하고,
-- job 정의(cron.job)는 건드리지 않는다.
CREATE OR REPLACE FUNCTION public.cron_history_retention_90d()
RETURNS TABLE (deleted_rows BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count BIGINT;
BEGIN
  DELETE FROM cron.job_run_details
   WHERE end_time IS NOT NULL
     AND end_time < now() - interval '90 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END $$;

-- ── 권한 — 외부 사용자 실행 금지(스케줄 실행 role 은 소유자 경유) ──────────
REVOKE ALL ON FUNCTION public.place_usage_monthly_maintenance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cron_history_retention_90d() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_usage_monthly_maintenance() TO service_role;
GRANT EXECUTE ON FUNCTION public.cron_history_retention_90d() TO service_role;

-- ── ④ 스케줄 등록(멱등) ────────────────────────────────────────────────────
DO $sched$
DECLARE
  v_id BIGINT;
BEGIN
  -- 매일 KST 03:17 = UTC 18:17 — maintenance
  SELECT jobid INTO v_id FROM cron.job
   WHERE jobname = 'gokoreamate-place-usage-monthly-maintenance-v1';
  IF v_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM cron.job WHERE jobid = v_id
        AND schedule = '17 18 * * *'
        AND command  = 'SELECT public.place_usage_monthly_maintenance();') THEN
    PERFORM cron.unschedule(v_id);
    v_id := NULL;
  END IF;
  IF v_id IS NULL THEN
    PERFORM cron.schedule(
      'gokoreamate-place-usage-monthly-maintenance-v1',
      '17 18 * * *',
      'SELECT public.place_usage_monthly_maintenance();');
  END IF;

  -- 매주 일요일 KST 03:47 = 토요일 UTC 18:47 — 이력 정리
  SELECT jobid INTO v_id FROM cron.job
   WHERE jobname = 'gokoreamate-cron-history-retention-90d-v1';
  IF v_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM cron.job WHERE jobid = v_id
        AND schedule = '47 18 * * 6'
        AND command  = 'SELECT public.cron_history_retention_90d();') THEN
    PERFORM cron.unschedule(v_id);
    v_id := NULL;
  END IF;
  IF v_id IS NULL THEN
    PERFORM cron.schedule(
      'gokoreamate-cron-history-retention-90d-v1',
      '47 18 * * 6',
      'SELECT public.cron_history_retention_90d();');
  END IF;
END $sched$;

COMMIT;
