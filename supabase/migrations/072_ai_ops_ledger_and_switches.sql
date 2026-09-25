-- 072_ai_ops_ledger_and_switches.sql
-- (V2-AI-HARDCAP-EMERGENCY-SWITCH-AND-NON-AI-SCHEDULER-V1 §7·§8 · 2026-09-25)
--
-- 회사 비용 방어용 운영 원장 + 배포 없이 작동하는 비상정지 스위치.
-- 사용자 크레딧 원장이 아니다(그건 로그인·원장 TASK). additive only · RLS on ·
-- 일반 클라이언트 접근 0 · service_role 전용 · Staging 전용 적용(Production 은
-- AI 활성화 릴리스에서 Owner 승인으로).
--
-- 금액은 부동소수점 원화가 아니라 **정수 USD micro(1e-6 USD)** 로 저장한다.
-- prompt 원문·여행 메모·제목·사진·이메일·raw device ID 는 자리 자체가 없다.

-- ── ① 비상정지·운영 값 (key-value) ──────────────────────────────────────────
-- env 변경은 Pages 재배포가 필요해 "배포 없는 정지"가 안 된다(검토 결과) —
-- 이 표의 행 변경은 다음 요청부터 즉시 적용된다(guard 가 요청 시 조회).
CREATE TABLE IF NOT EXISTS public.ai_ops_switches (
  ops_key    TEXT PRIMARY KEY CHECK (char_length(ops_key) BETWEEN 2 AND 64),
  value_text TEXT NOT NULL CHECK (char_length(value_text) <= 128),
  note       TEXT CHECK (note IS NULL OR char_length(note) <= 200),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_ops_switches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_ops_switches FROM PUBLIC, anon, authenticated;

-- 초기 값: 전 기능 차단(fail-closed) + 예산 상한. 값 변경은 admin API/Owner 만.
INSERT INTO public.ai_ops_switches (ops_key, value_text, note) VALUES
  ('ai_master',              'off', '전체 AI 비상정지 — AI_MODE(env)와 AND 결합'),
  ('feature_personalize',    'off', 'AI 일정 개인화'),
  ('feature_writing',        'off', 'Story/My Trip writing'),
  ('feature_import_analyze', 'off', '가져오기 분석'),
  ('feature_itinerary_legacy','off','legacy 일정 생성(도달 소비처 0)'),
  ('feature_curator',        'off', 'trend curator cron'),
  ('feature_canary',         'off', 'admin canary'),
  ('budget_daily_usd_micro',  '5000000',  '전체 일일 상한 $5'),
  ('budget_monthly_usd_micro','60000000', '전체 월간 상한 $60')
ON CONFLICT (ops_key) DO NOTHING;

-- ── ② 비용 원장 ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_ops_ledger (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  route               TEXT NOT NULL CHECK (char_length(route) BETWEEN 2 AND 64),
  model               TEXT NOT NULL CHECK (char_length(model) BETWEEN 2 AND 64),
  status              TEXT NOT NULL DEFAULT 'reserved'
                      CHECK (status IN ('reserved','committed','released','unknown_billed')),
  reserved_usd_micro  BIGINT NOT NULL CHECK (reserved_usd_micro >= 0),
  committed_usd_micro BIGINT CHECK (committed_usd_micro IS NULL OR committed_usd_micro >= 0),
  input_tokens        INTEGER CHECK (input_tokens  IS NULL OR input_tokens  >= 0),
  output_tokens       INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  idempotency_key     TEXT NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  actor_hash          TEXT CHECK (actor_hash IS NULL OR char_length(actor_hash) = 64),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  committed_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ai_ops_ledger_created ON public.ai_ops_ledger (created_at);
CREATE INDEX IF NOT EXISTS idx_ai_ops_ledger_route_created ON public.ai_ops_ledger (route, created_at);
ALTER TABLE public.ai_ops_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_ops_ledger FROM PUBLIC, anon, authenticated;

-- ── ③ 원자 예약 — 상한 판정과 삽입을 한 트랜잭션·한 잠금 아래에서 ──────────
-- 비용으로 세는 상태 = reserved + committed + unknown_billed (released 만 제외).
-- 동시 요청은 advisory xact lock 으로 직렬화되어 상한 초과가 불가능하다.
CREATE OR REPLACE FUNCTION public.ai_ops_reserve(
  p_route text, p_model text, p_worst_usd_micro bigint,
  p_idem_key text, p_actor_hash text,
  p_feature_daily_calls int, p_feature_daily_usd_micro bigint
) RETURNS TABLE (ok boolean, reason text, ledger_id bigint)
LANGUAGE plpgsql
AS $$
DECLARE
  v_daily_cap   bigint := COALESCE((SELECT value_text::bigint FROM public.ai_ops_switches WHERE ops_key='budget_daily_usd_micro'), 0);
  v_monthly_cap bigint := COALESCE((SELECT value_text::bigint FROM public.ai_ops_switches WHERE ops_key='budget_monthly_usd_micro'), 0);
  v_day_spent   bigint;
  v_month_spent bigint;
  v_route_calls int;
  v_route_spent bigint;
  v_id          bigint;
BEGIN
  -- 중복 idempotency: 이미 있으면 추가 과금 없이 그 행을 돌려준다
  SELECT l.id INTO v_id FROM public.ai_ops_ledger l WHERE l.idempotency_key = p_idem_key;
  IF FOUND THEN
    RETURN QUERY SELECT false, 'duplicate_idempotency', v_id; RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ai_ops_budget'));

  SELECT COALESCE(SUM(COALESCE(l.committed_usd_micro, l.reserved_usd_micro)),0) INTO v_day_spent
    FROM public.ai_ops_ledger l
   WHERE l.status <> 'released' AND l.created_at >= date_trunc('day', now());
  SELECT COALESCE(SUM(COALESCE(l.committed_usd_micro, l.reserved_usd_micro)),0) INTO v_month_spent
    FROM public.ai_ops_ledger l
   WHERE l.status <> 'released' AND l.created_at >= date_trunc('month', now());
  SELECT COUNT(*), COALESCE(SUM(COALESCE(l.committed_usd_micro, l.reserved_usd_micro)),0)
    INTO v_route_calls, v_route_spent
    FROM public.ai_ops_ledger l
   WHERE l.status <> 'released' AND l.route = p_route AND l.created_at >= date_trunc('day', now());

  IF v_daily_cap   <= 0 OR v_day_spent   + p_worst_usd_micro > v_daily_cap   THEN
    RETURN QUERY SELECT false, 'daily_budget_exceeded', NULL::bigint; RETURN; END IF;
  IF v_monthly_cap <= 0 OR v_month_spent + p_worst_usd_micro > v_monthly_cap THEN
    RETURN QUERY SELECT false, 'monthly_budget_exceeded', NULL::bigint; RETURN; END IF;
  IF p_feature_daily_calls > 0 AND v_route_calls + 1 > p_feature_daily_calls THEN
    RETURN QUERY SELECT false, 'feature_daily_calls_exceeded', NULL::bigint; RETURN; END IF;
  IF p_feature_daily_usd_micro > 0 AND v_route_spent + p_worst_usd_micro > p_feature_daily_usd_micro THEN
    RETURN QUERY SELECT false, 'feature_daily_budget_exceeded', NULL::bigint; RETURN; END IF;

  INSERT INTO public.ai_ops_ledger (route, model, reserved_usd_micro, idempotency_key, actor_hash)
  VALUES (p_route, p_model, p_worst_usd_micro, p_idem_key, p_actor_hash)
  RETURNING id INTO v_id;
  RETURN QUERY SELECT true, 'reserved', v_id;
END;
$$;

-- ── ④ 상태 전이 — reserved 에서만 한 번 ────────────────────────────────────
-- release 는 "명확한 무과금 실패"만. timeout·연결단절은 unknown_billed 로 보존
-- (예약액을 돌려주지 않는다 — 비용 0 가정 금지).
CREATE OR REPLACE FUNCTION public.ai_ops_settle(
  p_ledger_id bigint, p_status text,
  p_committed_usd_micro bigint, p_input_tokens int, p_output_tokens int
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE v_ok int;
BEGIN
  IF p_status NOT IN ('committed','released','unknown_billed') THEN RETURN false; END IF;
  UPDATE public.ai_ops_ledger
     SET status = p_status,
         committed_usd_micro = CASE WHEN p_status='committed' THEN p_committed_usd_micro
                                    WHEN p_status='unknown_billed' THEN reserved_usd_micro
                                    ELSE NULL END,
         input_tokens = p_input_tokens, output_tokens = p_output_tokens,
         committed_at = CASE WHEN p_status='committed' THEN now() ELSE committed_at END
   WHERE id = p_ledger_id AND status = 'reserved';
  GET DIAGNOSTICS v_ok = ROW_COUNT;
  RETURN v_ok = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_ops_reserve(text,text,bigint,text,text,int,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_ops_settle(bigint,text,bigint,int,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_ops_reserve(text,text,bigint,text,text,int,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_ops_settle(bigint,text,bigint,int,int) TO service_role;
GRANT SELECT ON public.ai_ops_switches TO service_role;
