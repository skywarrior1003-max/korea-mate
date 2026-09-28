-- 083: 일일 파기 활성화 관문 + 알림 경로 검증 (RETENTION-ROLLOUT-SAFETY-V1)
--
-- 082 만 있으면 설치 직후 첫 KST 03:27 부터 파기가 돈다 — Legal 시행일·알림 설정·
-- 알림 엔드포인트 배포와 무관하게, 알림 설정이 없어도(skipped_no_config) 지운다.
-- 083 은 082 파일을 바꾸지 않고 함수만 교체해 다음을 보장한다.
--
--   1) 비활성 설치: 설정 행(effective_from)이 없거나 KST 오늘이 그 날짜 전이면
--      아무것도 지우지 않고 원장에 inactive 만 남긴다. 082 직후·코드 배포 전·
--      시행일 전에는 cron 이 돌아도 파기 0.
--   2) 알림 없이는 파기 없음: Vault 의 알림 URL·키가 비어 있으면 blocked_no_alert.
--   3) 알림 경로 검증: 활성 이후 매 실행이 알림 엔드포인트에 probe(메일 없음)를
--      보내고, 30분 뒤 대조 작업이 응답 코드를 원장에 옮긴다(pg_net 응답은 6시간만
--      보관되므로). 최근 36시간 안에 확인된 적이 없으면 blocked_alert_unverified —
--      이날은 지우지 않고 probe 만 다시 보낸다(경로가 살아나면 다음 날 자동 재개).
--   4) 활성화: retention_purge_activate(date) 는 selftest(실제 운영자 메일 1통)가
--      202(= 발송 서비스가 수락)로 돌아온 뒤에만 설정 행을 쓴다. 운영자 수신 확인은
--      사람이 한다.
--
-- 원장 alert 값: 082 의 'sent' 는 '요청을 대기열에 넣음' 이었다. 이후 행은 'queued' 로
-- 쓰고, 실제 응답 코드는 alert_http_status 에 따로 남긴다. 원문·비밀값은 여전히 없다.
-- 의존: 082. 081 과 무관.

BEGIN;

-- ── 활성화 설정(단일 행) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.retention_purge_settings (
  id                   BOOLEAN     PRIMARY KEY DEFAULT true CHECK (id),
  effective_from       DATE,
  activated_at         TIMESTAMPTZ,
  alert_verified_at    TIMESTAMPTZ,
  selftest_request_id  BIGINT,
  selftest_requested_at TIMESTAMPTZ
);
ALTER TABLE public.retention_purge_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retention_purge_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.retention_purge_settings TO service_role;

-- ── 원장 확장 ────────────────────────────────────────────────────────────
ALTER TABLE public.retention_purge_runs
  ADD COLUMN IF NOT EXISTS alert_request_id  BIGINT,
  ADD COLUMN IF NOT EXISTS alert_http_status INTEGER,
  ADD COLUMN IF NOT EXISTS probe_request_id  BIGINT,
  ADD COLUMN IF NOT EXISTS probe_http_status INTEGER;

ALTER TABLE public.retention_purge_runs DROP CONSTRAINT IF EXISTS retention_purge_runs_status_check;
ALTER TABLE public.retention_purge_runs ADD CONSTRAINT retention_purge_runs_status_check
  CHECK (status IN ('ok', 'failed', 'inactive', 'blocked_no_alert', 'blocked_alert_unverified'));
ALTER TABLE public.retention_purge_runs DROP CONSTRAINT IF EXISTS retention_purge_runs_alert_check;
ALTER TABLE public.retention_purge_runs ADD CONSTRAINT retention_purge_runs_alert_check
  CHECK (alert IN ('none', 'sent', 'skipped_no_config', 'queued'));

-- ── 알림 요청(요청 id 반환, 설정 없으면 NULL) ─────────────────────────────
DROP FUNCTION IF EXISTS public.retention_purge_alert(TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.retention_alert_configured()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT (SELECT count(*) FROM vault.decrypted_secrets
           WHERE name IN ('retention_alert_url', 'retention_alert_key')
             AND nullif(btrim(decrypted_secret), '') IS NOT NULL) = 2;
$$;

CREATE OR REPLACE FUNCTION public.retention_purge_notify(p_kind TEXT, p_payload JSONB)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  SELECT nullif(btrim(decrypted_secret), '') INTO v_url FROM vault.decrypted_secrets WHERE name = 'retention_alert_url' LIMIT 1;
  SELECT nullif(btrim(decrypted_secret), '') INTO v_key FROM vault.decrypted_secrets WHERE name = 'retention_alert_key' LIMIT 1;
  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN net.http_post(
    url     := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-internal-auth', v_key),
    body    := jsonb_build_object('kind', p_kind) || p_payload
  );
END $$;

-- ── 일일 파기(082 교체) ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.retention_purge_daily()
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rep_eligible INTEGER := 0;
  v_rep_deleted  INTEGER := 0;
  v_rep_stale    INTEGER := 0;
  v_inq_eligible INTEGER := 0;
  v_inq_deleted  INTEGER := 0;
  v_inq_held     INTEGER := 0;
  v_status       TEXT := 'ok';
  v_error        TEXT;
  v_alert        TEXT := 'none';
  v_alert_req    BIGINT;
  v_probe_req    BIGINT;
  v_from         DATE;
  v_verified     TIMESTAMPTZ;
  v_run_id       BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('retention_purge_daily'));

  SELECT effective_from, alert_verified_at INTO v_from, v_verified
    FROM public.retention_purge_settings WHERE id;

  -- 1) 시행 전: 아무것도 지우지 않는다. 활성화 전에는 알림 엔드포인트가 아직 없을 수
  --    있어 호출도 없고, 활성화 후 시행일을 기다리는 동안에는 probe 로 경로만 유지한다.
  IF v_from IS NULL OR (now() AT TIME ZONE 'Asia/Seoul')::date < v_from THEN
    IF v_from IS NOT NULL THEN
      v_probe_req := public.retention_purge_notify('probe', '{}'::jsonb);
    END IF;
    INSERT INTO public.retention_purge_runs (status, probe_request_id)
      VALUES ('inactive', v_probe_req) RETURNING id INTO v_run_id;
    RETURN v_run_id;
  END IF;

  -- 2) 알림 설정이 없으면 지우지 않는다(실패해도 알릴 수 없으므로).
  IF NOT public.retention_alert_configured() THEN
    INSERT INTO public.retention_purge_runs (status) VALUES ('blocked_no_alert') RETURNING id INTO v_run_id;
    RETURN v_run_id;
  END IF;

  -- 3) 최근 36시간 안에 알림 경로가 확인되지 않았으면 지우지 않고 probe 만 다시 보낸다.
  IF v_verified IS NULL OR v_verified < now() - interval '36 hours' THEN
    v_probe_req := public.retention_purge_notify('probe', '{}'::jsonb);
    INSERT INTO public.retention_purge_runs (status, probe_request_id)
      VALUES ('blocked_alert_unverified', v_probe_req) RETURNING id INTO v_run_id;
    RETURN v_run_id;
  END IF;

  BEGIN
    SELECT count(*) INTO v_rep_eligible FROM public.place_reports
     WHERE status IN ('resolved_corrected','resolved_no_change','resolved_hidden','resolved_removed','rejected','duplicate')
       AND resolved_at IS NOT NULL
       AND resolved_at <= now() - interval '6 months';
    WITH d AS (
      DELETE FROM public.place_reports
       WHERE status IN ('resolved_corrected','resolved_no_change','resolved_hidden','resolved_removed','rejected','duplicate')
         AND resolved_at IS NOT NULL
         AND resolved_at <= now() - interval '6 months'
      RETURNING 1)
    SELECT count(*) INTO v_rep_deleted FROM d;

    SELECT count(*) INTO v_rep_stale FROM public.place_reports
     WHERE status IN ('pending','reviewing') AND created_at <= now() - interval '30 days';

    SELECT count(*) INTO v_inq_held FROM public.contact_inquiries
     WHERE created_at <= now() - interval '6 months'
       AND retention_hold_until IS NOT NULL AND retention_hold_until >= current_date;
    SELECT count(*) INTO v_inq_eligible FROM public.contact_inquiries
     WHERE created_at <= now() - interval '6 months'
       AND (retention_hold_until IS NULL OR retention_hold_until < current_date);
    WITH d AS (
      DELETE FROM public.contact_inquiries
       WHERE created_at <= now() - interval '6 months'
         AND (retention_hold_until IS NULL OR retention_hold_until < current_date)
      RETURNING 1)
    SELECT count(*) INTO v_inq_deleted FROM d;

    IF v_rep_deleted <> v_rep_eligible OR v_inq_deleted <> v_inq_eligible THEN
      RAISE EXCEPTION 'count_mismatch';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_status := 'failed';
    v_error := SQLSTATE || ':' || left(SQLERRM, 80);
    v_rep_deleted := 0;
    v_inq_deleted := 0;
  END;

  IF v_status = 'failed' THEN
    v_alert_req := public.retention_purge_notify('failed', jsonb_build_object('error_code', v_error));
  ELSIF v_rep_stale > 0 AND extract(isodow FROM now() AT TIME ZONE 'Asia/Seoul') = 1 THEN
    v_alert_req := public.retention_purge_notify('stale_open_reports', jsonb_build_object('count', v_rep_stale));
  END IF;
  IF v_alert_req IS NOT NULL THEN v_alert := 'queued'; END IF;
  v_probe_req := public.retention_purge_notify('probe', '{}'::jsonb);

  INSERT INTO public.retention_purge_runs
    (status, reports_eligible, reports_deleted, reports_stale_open,
     inquiries_eligible, inquiries_deleted, inquiries_held, error_code, alert,
     alert_request_id, probe_request_id)
  VALUES
    (v_status, v_rep_eligible, v_rep_deleted, v_rep_stale,
     v_inq_eligible, v_inq_deleted, v_inq_held, v_error, v_alert,
     v_alert_req, v_probe_req)
  RETURNING id INTO v_run_id;
  RETURN v_run_id;
END $$;

-- ── 응답 대조(파기 30분 뒤) — pg_net 응답을 원장으로 옮기고 경로 확인 시각 갱신 ──
CREATE OR REPLACE FUNCTION public.retention_purge_reconcile()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_n INTEGER := 0;
  v_ok_at TIMESTAMPTZ;
BEGIN
  UPDATE public.retention_purge_runs r
     SET alert_http_status = coalesce(h.status_code, 0)
    FROM net._http_response h
   WHERE r.alert_request_id = h.id AND r.alert_http_status IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE public.retention_purge_runs r
     SET probe_http_status = coalesce(h.status_code, 0)
    FROM net._http_response h
   WHERE r.probe_request_id = h.id AND r.probe_http_status IS NULL;

  SELECT max(r.run_at) INTO v_ok_at FROM public.retention_purge_runs r
   WHERE r.probe_http_status = 200;
  IF v_ok_at IS NOT NULL THEN
    UPDATE public.retention_purge_settings
       SET alert_verified_at = greatest(coalesce(alert_verified_at, v_ok_at), v_ok_at)
     WHERE id;
  END IF;
  RETURN v_n;
END $$;

-- ── 활성화 절차 ──────────────────────────────────────────────────────────
-- (1) selftest: 운영자에게 시험 메일 1통을 요청한다. 요청 id 를 설정 행에 남긴다.
CREATE OR REPLACE FUNCTION public.retention_alert_selftest()
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_req BIGINT;
BEGIN
  IF NOT public.retention_alert_configured() THEN
    RAISE EXCEPTION 'retention_alert_not_configured';
  END IF;
  v_req := public.retention_purge_notify('selftest', '{}'::jsonb);
  INSERT INTO public.retention_purge_settings (id, selftest_request_id, selftest_requested_at)
    VALUES (true, v_req, now())
  ON CONFLICT (id) DO UPDATE SET selftest_request_id = EXCLUDED.selftest_request_id,
                                 selftest_requested_at = EXCLUDED.selftest_requested_at;
  RETURN v_req;
END $$;

-- (2) activate: selftest 응답이 202(발송 서비스 수락)이고 1시간 이내일 때만 시행일을 쓴다.
CREATE OR REPLACE FUNCTION public.retention_purge_activate(p_effective_from DATE)
RETURNS DATE
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_req BIGINT;
  v_at  TIMESTAMPTZ;
  v_code INTEGER;
BEGIN
  IF p_effective_from IS NULL THEN
    RAISE EXCEPTION 'effective_from_required';
  END IF;
  IF NOT public.retention_alert_configured() THEN
    RAISE EXCEPTION 'retention_alert_not_configured';
  END IF;
  SELECT selftest_request_id, selftest_requested_at INTO v_req, v_at
    FROM public.retention_purge_settings WHERE id;
  IF v_req IS NULL OR v_at < now() - interval '1 hour' THEN
    RAISE EXCEPTION 'selftest_missing_or_stale';
  END IF;
  SELECT status_code INTO v_code FROM net._http_response WHERE id = v_req;
  IF v_code IS DISTINCT FROM 202 THEN
    RAISE EXCEPTION 'selftest_not_delivered_to_provider:%', coalesce(v_code::text, 'no_response');
  END IF;
  UPDATE public.retention_purge_settings
     SET effective_from = p_effective_from, activated_at = now(), alert_verified_at = v_at
   WHERE id;
  RETURN p_effective_from;
END $$;

REVOKE ALL ON FUNCTION public.retention_alert_configured()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retention_purge_notify(TEXT, JSONB)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retention_purge_daily()                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retention_purge_reconcile()              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retention_alert_selftest()               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retention_purge_activate(DATE)           FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retention_purge_daily() TO service_role;

-- ── 대조 스케줄(멱등 — 082·076 과 같은 방식) ─────────────────────────────
DO $sched$
DECLARE
  v_id BIGINT;
BEGIN
  -- 매일 KST 03:57 = UTC 18:57 (파기 30분 뒤, pg_net 응답 보관 6시간 안)
  SELECT jobid INTO v_id FROM cron.job WHERE jobname = 'gokoreamate-retention-alert-reconcile-v1';
  IF v_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM cron.job WHERE jobid = v_id
        AND schedule = '57 18 * * *'
        AND command  = 'SELECT public.retention_purge_reconcile();') THEN
    PERFORM cron.unschedule(v_id);
    v_id := NULL;
  END IF;
  IF v_id IS NULL THEN
    PERFORM cron.schedule(
      'gokoreamate-retention-alert-reconcile-v1',
      '57 18 * * *',
      'SELECT public.retention_purge_reconcile();');
  END IF;
END $sched$;

COMMIT;
