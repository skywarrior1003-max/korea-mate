-- 087_ai_user_usage_monthly_plan_writing.sql
-- (MYTRIP-FULL-TRIP-AI-WRITING-AND-ENTITLEMENT-CORRECTION · 2026-09-30)
--
-- Owner 교정(2026-09-30): 무료 사용권은 **2026-09-25 Owner 작업 지시**를 기준으로 한다.
--  · 일정 만들기(plan): 월 1회 — 글·링크 가져오기 분석과 AI 일정(개인화·레거시 생성)이 **공유**
--  · 신규 회원 최초 보너스: 일정 만들기 1회 추가(계정당 평생 1회, 가져오기 전용 아님, 매월 재지급 없음)
--  · 전체 여행 AI 글쓰기(writing): 월 2회 — My Trip·Story 공유. 3문체를 한 요청으로 받으면 1회
--  · 차감 = 사용자가 받은 완성 결과 1건. 실패·timeout·무효·중복·저장 결과 재열람·직접 수정 = 0
-- 09-21 인계서의 "30일 통합 1회"(086)는 다시 적용하지 않는다 — 086 의 함수 두 개를 이 파일이 교체한다.
--
-- 원문에 없는 규칙(Owner 결정 전 — 여기서 새로 만들지 않는다):
--  · '월' 갱신 시점: 확정 근거 없음. 084 에 이미 있던 ai_user_period_now()(서울 시각 달력 월)를
--    그대로 쓴다 — 바꿀 때는 이 함수 하나만 교체하면 된다.
--  · 최초 보너스 만료: 확정 근거 없음 → 만료 규칙을 두지 않는다(쓰기 전까지 남는다).
--
-- 084·085·086 은 Staging 에 적용된 파일 그대로 둔다. additive(제약 확장) + 함수 교체만.
-- 기존 행(shared_30d·rolling 등)은 이력으로 남고 새 집계에 포함되지 않는다.
-- **Staging 전용 적용.** Production 은 Owner 승인 후 084 → 085 → 086 → 087 순서로.

ALTER TABLE public.ai_user_usage DROP CONSTRAINT IF EXISTS ai_user_usage_pool_check;
ALTER TABLE public.ai_user_usage ADD CONSTRAINT ai_user_usage_pool_check
  CHECK (pool IN ('plan','writing','shared_30d','welcome_import','plan_import'));
-- period 제약은 086 그대로('rolling' | 'welcome' | 'YYYY-MM')

-- 전체 여행 AI 글쓰기 결과 보관(재열람 = 추가 요청 0) — 기존 feature 값은 유지
ALTER TABLE public.mytrip_ai_generations DROP CONSTRAINT IF EXISTS mytrip_ai_generations_feature_check;
ALTER TABLE public.mytrip_ai_generations ADD CONSTRAINT mytrip_ai_generations_feature_check
  CHECK (feature IN ('moment3','storyHero','fullTrip'));

CREATE INDEX IF NOT EXISTS idx_ai_user_usage_user_pool_period ON public.ai_user_usage (user_id, pool, period, status);

-- 이번 '월'이 끝나는 시각(ISO UTC) — ai_user_period_now() 와 같은 기준(서울 시각 달력 월)
CREATE OR REPLACE FUNCTION public.ai_user_period_resets_at() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT to_char(((date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') + interval '1 month') AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'UTC',
                 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
$$;

-- ── 원자 예약 ────────────────────────────────────────────────────────────────
-- 반환(jsonb):
--   {status:'reserved', id, pool, period}   — provider 호출 가능(period='welcome' 이면 최초 보너스 사용)
--   {status:'replay', id, pool, result}     — 같은 요청이 이미 완료됨(추가 차감 없음)
--   {status:'in_progress'}                  — 같은 사용자·같은 사용권의 AI 요청이 처리 중
--   {status:'exhausted', pool, resets_at}   — 이번 달 무료 사용권 소진. resets_at = 다음 달 시작(ISO UTC)
CREATE OR REPLACE FUNCTION public.ai_user_reserve(p_user uuid, p_feature text, p_idem text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_row     public.ai_user_usage%ROWTYPE;
  v_exist   bigint;
  v_pool    text;
  v_limit   int;
  v_month   text := public.ai_user_period_now();
  v_used    int;
  v_period  text;
  v_id      bigint;
BEGIN
  IF p_feature NOT IN ('import','personalize','writing') THEN RAISE EXCEPTION 'bad feature'; END IF;
  v_pool  := CASE WHEN p_feature = 'writing' THEN 'writing' ELSE 'plan' END;
  v_limit := CASE WHEN v_pool = 'writing' THEN 2 ELSE 1 END;
  PERFORM pg_advisory_xact_lock(hashtext('ai_user_usage:' || p_user::text));

  -- 멈춘 예약(5분) 해제 · 오래된 재응답 결과(24시간) 비우기 — 이 사용자 것만
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
  END IF;

  -- 같은 사용권의 다른 요청이 처리 중이면 두 번째를 부르지 않는다(동시 요청으로 한도를 넘지 않게)
  IF EXISTS (SELECT 1 FROM public.ai_user_usage
              WHERE user_id = p_user AND pool = v_pool AND status = 'reserved' AND idem_key <> p_idem) THEN
    RETURN jsonb_build_object('status','in_progress');
  END IF;

  SELECT count(*) INTO v_used FROM public.ai_user_usage
   WHERE user_id = p_user AND pool = v_pool AND period = v_month AND status = 'committed';

  IF v_used < v_limit THEN
    v_period := v_month;
  ELSIF v_pool = 'plan' AND NOT EXISTS (
          SELECT 1 FROM public.ai_user_usage
           WHERE user_id = p_user AND pool = 'plan' AND period = 'welcome' AND status = 'committed') THEN
    v_period := 'welcome';   -- 신규 회원 최초 보너스(계정당 1회)
  ELSE
    RETURN jsonb_build_object('status','exhausted','pool',v_pool,'resets_at', public.ai_user_period_resets_at());
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
  RETURN jsonb_build_object('status','reserved','id',v_id,'pool',v_pool,'period',v_period);
END;
$$;

-- ── 남은 무료 사용권(화면 안내용) — 유료 잔액은 없다(결제 미구현) ──────────────
CREATE OR REPLACE FUNCTION public.ai_user_balance(p_user uuid)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  WITH m AS (SELECT public.ai_user_period_now() AS month),
  u AS (
    SELECT
      count(*) FILTER (WHERE pool = 'plan'    AND period = (SELECT month FROM m)) AS plan_used,
      count(*) FILTER (WHERE pool = 'plan'    AND period = 'welcome')            AS bonus_used,
      count(*) FILTER (WHERE pool = 'writing' AND period = (SELECT month FROM m)) AS writing_used
      FROM public.ai_user_usage WHERE user_id = p_user AND status = 'committed'
  )
  SELECT jsonb_build_object(
    'period', (SELECT month FROM m),
    'resets_at', public.ai_user_period_resets_at(),
    'plan', jsonb_build_object('monthly_limit', 1, 'monthly_remaining', GREATEST(0, 1 - (SELECT plan_used FROM u)),
                               'bonus_remaining', CASE WHEN (SELECT bonus_used FROM u) > 0 THEN 0 ELSE 1 END),
    'writing', jsonb_build_object('monthly_limit', 2, 'monthly_remaining', GREATEST(0, 2 - (SELECT writing_used FROM u)))
  )
$$;

REVOKE ALL ON FUNCTION public.ai_user_period_resets_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_user_period_resets_at() TO service_role;
REVOKE ALL ON FUNCTION public.ai_user_reserve(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_user_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_user_reserve(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_user_balance(uuid) TO service_role;
