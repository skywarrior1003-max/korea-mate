-- Production 전용 사전 단계 — 082 적용 **전에** 실행한다 (FINAL-RELEASE-GATES-V1)
--
-- 082·083 은 각자 BEGIN…COMMIT 을 가진 별도 트랜잭션이다. 한 요청으로 이어 보내도
-- 082 가 먼저 커밋되고, 083 이 실패하면 관문 없는 082 파기 함수와 활성 cron 이 남는다.
-- 이 파일은 082 가 등록할 것과 이름·시각·명령이 똑같은 작업을 먼저 '비활성'으로 만든다.
-- 082 의 멱등 블록은 셋이 같으면 기존 작업을 건드리지 않으므로 비활성이 유지된다.
-- 함수가 아직 없어도 된다(pg_cron 은 명령을 실행 시점에만 해석한다).
-- 재실행 안전: 작업이 있으면 비활성으로만 바꾼다.

DO $prestage$
DECLARE
  v_id BIGINT;
BEGIN
  SELECT jobid INTO v_id FROM cron.job WHERE jobname = 'gokoreamate-retention-purge-daily-v1';
  IF v_id IS NULL THEN
    v_id := cron.schedule(
      'gokoreamate-retention-purge-daily-v1',
      '27 18 * * *',
      'SELECT public.retention_purge_daily();');
  END IF;
  PERFORM cron.alter_job(v_id, active := false);
END $prestage$;

SELECT jobid, jobname, schedule, command, active
  FROM cron.job WHERE jobname = 'gokoreamate-retention-purge-daily-v1';
