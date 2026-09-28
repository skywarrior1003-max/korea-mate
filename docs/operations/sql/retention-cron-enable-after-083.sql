-- Production 전용 — 083 적용과 확인이 끝난 **뒤에만** 실행한다 (FINAL-RELEASE-GATES-V1)
--
-- 현재 파기 함수가 083 관문판(설정 행·알림 확인)인지 확인한 뒤에만 파기 작업을 켠다.
-- 082 를 083 뒤에 다시 실행하면 함수가 관문 없는 082 판으로 돌아간다 — 그 경우 여기서 멈춘다.
-- 켜도 설정 행(retention_purge_activate)이 없으면 매일 inactive 만 기록하고 지우지 않는다.

DO $enable$
DECLARE
  v_def TEXT := pg_get_functiondef('public.retention_purge_daily()'::regprocedure);
  v_id  BIGINT;
BEGIN
  IF position('retention_purge_settings' IN v_def) = 0
     OR position('blocked_no_alert' IN v_def) = 0
     OR position('blocked_alert_unverified' IN v_def) = 0 THEN
    RAISE EXCEPTION 'gate_missing: apply 083 before enabling the purge job';
  END IF;
  SELECT jobid INTO v_id FROM cron.job WHERE jobname = 'gokoreamate-retention-purge-daily-v1';
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'purge_job_missing';
  END IF;
  PERFORM cron.alter_job(v_id, active := true);
END $enable$;

SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'gokoreamate-retention-%' ORDER BY jobname;
