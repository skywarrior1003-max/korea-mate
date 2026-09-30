-- 084_ai_user_usage_ledger.sql
-- (GOKOREAMATE-EXTERNAL-TRIP-IMPORT-AND-GUIDED-JOURNEY-V2 · 2026-09-30)
--
-- 사용자별 무료 AI 이용 횟수 원장. 072(회사 비용 원장·비상정지)와 별개의 축이다 —
-- 072 는 "회사가 얼마를 쓸 수 있나", 이 표는 "이 사용자가 몇 번을 받았나"를 센다.
-- additive only · RLS on · 일반 클라이언트 접근 0 · service_role 전용.
-- **Staging 전용 적용.** Production 적용은 Owner 승인으로 별도 진행한다.
--
-- Owner 확정 정책(2026-09-30):
--  · 기본(월, KST 달력 기준): AI 일정 개인화 1회 + 전체 여행 글쓰기 2회(Story·My Trip 공유) = 3회
--  · 신규 사용자의 **첫 가져오기**(글·링크 → 일정) 1회는 추가로 무료(welcome_import, 평생 1회)
--  · 그 이후 개인화와 가져오기는 **월 1회를 공유**(plan_import 풀)
--  · 차감 단위 = 사용자가 받은 완성 작업 1건. 실패·timeout·무효 결과·중복 요청 = 차감 0
--  · 직접 수정·저장·재방문은 차감하지 않는다(이 표에 행이 생기지 않는다)
--
-- 원문(붙여넣은 글·링크 본문)은 저장하지 않는다. result 는 같은 요청을 다시 받았을 때
-- 추가 차감 없이 돌려주기 위한 추출 결과(장소 이름·순서·시간)이며 24시간 뒤 비운다
-- (reserve 호출 때 그 사용자의 오래된 결과를 지운다 — 별도 cron 없음).

CREATE TABLE IF NOT EXISTS public.ai_user_usage (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature     TEXT NOT NULL CHECK (feature IN ('import','personalize','writing')),
  pool        TEXT NOT NULL CHECK (pool IN ('welcome_import','plan_import','writing')),
  period      TEXT NOT NULL CHECK (period = 'welcome' OR period ~ '^\d{4}-\d{2}$'),
  idem_key    TEXT NOT NULL CHECK (char_length(idem_key) BETWEEN 8 AND 128),
  status      TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','committed','released')),
  result      JSONB CHECK (result IS NULL OR octet_length(result::text) <= 65536),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at  TIMESTAMPTZ,
  UNIQUE (user_id, idem_key)
);
CREATE INDEX IF NOT EXISTS idx_ai_user_usage_user_pool ON public.ai_user_usage (user_id, pool, period, status);
ALTER TABLE public.ai_user_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_user_usage FROM PUBLIC, anon, authenticated;

-- 풀별 한도 — 정책 값은 여기 한 곳(코드 상수 usage-policy.ts 와 가드 테스트로 대조)
CREATE OR REPLACE FUNCTION public.ai_user_pool_limit(p_pool text) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_pool WHEN 'welcome_import' THEN 1 WHEN 'plan_import' THEN 1 WHEN 'writing' THEN 2 ELSE 0 END
$$;

-- 이번 달(KST)
CREATE OR REPLACE FUNCTION public.ai_user_period_now() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') $$;

-- ── 원자 예약 ──────────────────────────────────────────────────────────────
-- 반환(jsonb):
--   {status:'reserved', id, pool}         — provider 호출 가능
--   {status:'replay', id, pool, result}   — 같은 요청이 이미 완료됨(추가 차감 없음)
--   {status:'in_progress'}                — 같은 요청이 처리 중
--   {status:'exhausted', pool, resets_at} — 이번 달 무료 횟수 소진
-- 같은 사용자의 동시 요청은 advisory xact lock 으로 직렬화된다.
CREATE OR REPLACE FUNCTION public.ai_user_reserve(p_user uuid, p_feature text, p_idem text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_row     public.ai_user_usage%ROWTYPE;
  v_pool    text;
  v_period  text;
  v_used    int;
  v_id      bigint;
  v_resets  text;
  v_exist   bigint;
BEGIN
  IF p_feature NOT IN ('import','personalize','writing') THEN RAISE EXCEPTION 'bad feature'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ai_user_usage:' || p_user::text));

  -- 멈춘 예약(5분) 해제 · 오래된 재사용 결과(24시간) 비우기 — 이 사용자 것만
  UPDATE public.ai_user_usage SET status = 'released', settled_at = now()
   WHERE user_id = p_user AND status = 'reserved' AND created_at < now() - interval '5 minutes';
  UPDATE public.ai_user_usage SET result = NULL
   WHERE user_id = p_user AND result IS NOT NULL AND settled_at < now() - interval '24 hours';

  SELECT * INTO v_row FROM public.ai_user_usage WHERE user_id = p_user AND idem_key = p_idem;
  v_exist := CASE WHEN FOUND THEN v_row.id ELSE NULL END;
  IF v_exist IS NOT NULL THEN
    IF v_row.status = 'committed' AND v_row.result IS NOT NULL THEN
      RETURN jsonb_build_object('status','replay','id',v_row.id,'pool',v_row.pool,'result',v_row.result);
    ELSIF v_row.status = 'reserved' THEN
      RETURN jsonb_build_object('status','in_progress');
    END IF;
    -- released(실패) 또는 결과가 비워진 committed → 새 시도로 다시 판정한다
  END IF;

  v_period := public.ai_user_period_now();
  IF p_feature = 'writing' THEN
    v_pool := 'writing';
  ELSIF p_feature = 'import' AND NOT EXISTS (
      SELECT 1 FROM public.ai_user_usage
       WHERE user_id = p_user AND pool = 'welcome_import' AND status IN ('reserved','committed')) THEN
    v_pool := 'welcome_import'; v_period := 'welcome';
  ELSE
    v_pool := 'plan_import';
  END IF;

  SELECT count(*) INTO v_used FROM public.ai_user_usage
   WHERE user_id = p_user AND pool = v_pool AND period = v_period AND status IN ('reserved','committed')
     AND idem_key <> p_idem;
  IF v_used >= public.ai_user_pool_limit(v_pool) THEN
    v_resets := to_char(date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') + interval '1 month', 'YYYY-MM-DD');
    RETURN jsonb_build_object('status','exhausted','pool',v_pool,'resets_at',v_resets);
  END IF;

  IF v_exist IS NOT NULL THEN
    UPDATE public.ai_user_usage
       SET status = 'reserved', pool = v_pool, period = v_period, feature = p_feature,
           result = NULL, created_at = now(), settled_at = NULL
     WHERE id = v_exist
     RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.ai_user_usage (user_id, feature, pool, period, idem_key)
    VALUES (p_user, p_feature, v_pool, v_period, p_idem)
    RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('status','reserved','id',v_id,'pool',v_pool);
END;
$$;

-- ── 확정/해제 — reserved 에서만 한 번 ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_user_settle(p_id bigint, p_user uuid, p_status text, p_result jsonb)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE v_ok int;
BEGIN
  IF p_status NOT IN ('committed','released') THEN RETURN false; END IF;
  UPDATE public.ai_user_usage
     SET status = p_status, settled_at = now(),
         result = CASE WHEN p_status = 'committed' THEN p_result ELSE NULL END
   WHERE id = p_id AND user_id = p_user AND status = 'reserved';
  GET DIAGNOSTICS v_ok = ROW_COUNT;
  RETURN v_ok = 1;
END;
$$;

-- ── 남은 횟수(화면 안내용) ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_user_balance(p_user uuid)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  WITH p AS (SELECT public.ai_user_period_now() AS period),
  used AS (
    SELECT pool, period, count(*) AS n FROM public.ai_user_usage
     WHERE user_id = p_user AND status IN ('reserved','committed')
     GROUP BY pool, period
  )
  SELECT jsonb_build_object(
    'welcome_import', greatest(0, 1 - coalesce((SELECT n FROM used WHERE pool='welcome_import' AND period='welcome'), 0)),
    'plan_import',    greatest(0, 1 - coalesce((SELECT n FROM used, p WHERE used.pool='plan_import' AND used.period=p.period), 0)),
    'writing',        greatest(0, 2 - coalesce((SELECT n FROM used, p WHERE used.pool='writing' AND used.period=p.period), 0)),
    'resets_at', to_char(date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') + interval '1 month', 'YYYY-MM-DD')
  )
$$;

REVOKE ALL ON FUNCTION public.ai_user_reserve(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_user_settle(bigint,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_user_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_user_reserve(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_user_settle(bigint,uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_user_balance(uuid) TO service_role;
