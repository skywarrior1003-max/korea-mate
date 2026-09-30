-- 086_ai_user_usage_shared_30d.sql
-- (EXTERNAL-IMPORT-V2-POLICY-CORRECTION-AND-PREVIEW-CLOSEOUT · 2026-09-30)
--
-- 084 의 풀 정책(월 개인화 1·글쓰기 2·첫 가져오기 추가 1)은 Owner 승인 정책이 아니었다.
-- 확정 정책으로 바로잡는다 — **비용이 드는 AI 도움은 성공한 사용 시점부터 30일 이동 구간에 무료 1회**,
-- AI 일정 개인화·Story 의 명시적 AI 글쓰기·외부 일정 AI 분석이 **같은 1회**를 쓴다.
--  · 차감 = 사용자가 받은 완성 결과 1건(한 요청으로 3문체를 받아도 1회). 실패·timeout·무효·중복 = 0.
--  · 다음 무료 사용 가능 시각 = 그 성공의 확정 시각(settled_at) + 30일.
--  · 캐시에서 돌려준 결과·직접 편집·저장·재방문은 이 표에 행을 만들지 않는다.
--
-- 084 는 이미 Staging 에 적용됐다 — 파일을 고쳐 쓰지 않고 이 후속 migration 으로 바꾼다.
-- 표·기존 행·085(user_spots.import_source)는 그대로 둔다. additive(제약 확장) + 함수 교체만.
-- **Staging 전용 적용.** Production 은 Owner 승인 후 084 → 085 → 086 순서로.

-- 새 풀·기간 값 허용(기존 값은 과거 행 보존용으로 남긴다)
ALTER TABLE public.ai_user_usage DROP CONSTRAINT IF EXISTS ai_user_usage_pool_check;
ALTER TABLE public.ai_user_usage ADD CONSTRAINT ai_user_usage_pool_check
  CHECK (pool IN ('shared_30d','welcome_import','plan_import','writing'));
ALTER TABLE public.ai_user_usage DROP CONSTRAINT IF EXISTS ai_user_usage_period_check;
ALTER TABLE public.ai_user_usage ADD CONSTRAINT ai_user_usage_period_check
  CHECK (period = 'rolling' OR period = 'welcome' OR period ~ '^\d{4}-\d{2}$');
CREATE INDEX IF NOT EXISTS idx_ai_user_usage_user_settled ON public.ai_user_usage (user_id, status, settled_at);

-- 30일 무료 1회
CREATE OR REPLACE FUNCTION public.ai_user_free_window() RETURNS interval
LANGUAGE sql IMMUTABLE AS $$ SELECT interval '30 days' $$;

-- ── 원자 예약(공유 1회 · 30일 이동 구간) ─────────────────────────────────────
-- 반환(jsonb):
--   {status:'reserved', id, pool}          — provider 호출 가능
--   {status:'replay', id, pool, result}    — 같은 요청이 이미 완료됨(추가 차감 없음)
--   {status:'in_progress'}                 — 같은 사용자의 AI 요청이 처리 중(같은 입력 또는 다른 입력)
--   {status:'exhausted', pool, resets_at}  — 30일 안에 이미 1회 사용. resets_at = 성공 시각 + 30일(ISO)
CREATE OR REPLACE FUNCTION public.ai_user_reserve(p_user uuid, p_feature text, p_idem text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_row    public.ai_user_usage%ROWTYPE;
  v_exist  bigint;
  v_last   timestamptz;
  v_id     bigint;
BEGIN
  IF p_feature NOT IN ('import','personalize','writing') THEN RAISE EXCEPTION 'bad feature'; END IF;
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

  -- 처리 중인 다른 AI 요청이 있으면 두 번째를 부르지 않는다(동시 요청으로 1회를 넘지 않게)
  IF EXISTS (SELECT 1 FROM public.ai_user_usage
              WHERE user_id = p_user AND status = 'reserved' AND idem_key <> p_idem) THEN
    RETURN jsonb_build_object('status','in_progress');
  END IF;

  -- 30일 이동 구간 안의 성공 — 기능과 무관하게 하나의 권리
  SELECT max(settled_at) INTO v_last FROM public.ai_user_usage
   WHERE user_id = p_user AND status = 'committed' AND settled_at > now() - public.ai_user_free_window()
     AND idem_key <> p_idem;
  IF v_last IS NOT NULL THEN
    RETURN jsonb_build_object('status','exhausted','pool','shared_30d',
      'resets_at', to_char((v_last + public.ai_user_free_window()) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  END IF;

  IF v_exist IS NOT NULL THEN
    UPDATE public.ai_user_usage
       SET status = 'reserved', pool = 'shared_30d', period = 'rolling', feature = p_feature,
           result = NULL, created_at = now(), settled_at = NULL
     WHERE id = v_exist
     RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.ai_user_usage (user_id, feature, pool, period, idem_key)
    VALUES (p_user, p_feature, 'shared_30d', 'rolling', p_idem)
    RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('status','reserved','id',v_id,'pool','shared_30d');
END;
$$;

-- ── 남은 무료 횟수(화면 안내용) — 유료 잔액은 없다(결제 미구현) ──────────────────
CREATE OR REPLACE FUNCTION public.ai_user_balance(p_user uuid)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  WITH last AS (
    SELECT max(settled_at) AS at FROM public.ai_user_usage
     WHERE user_id = p_user AND status = 'committed' AND settled_at > now() - public.ai_user_free_window()
  )
  SELECT jsonb_build_object(
    'free_remaining', CASE WHEN (SELECT at FROM last) IS NULL THEN 1 ELSE 0 END,
    'next_free_at', (SELECT CASE WHEN at IS NULL THEN NULL
                     ELSE to_char((at + public.ai_user_free_window()) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') END FROM last),
    'window_days', 30
  )
$$;

REVOKE ALL ON FUNCTION public.ai_user_free_window() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_user_free_window() TO service_role;
-- ai_user_reserve · ai_user_settle · ai_user_balance 의 권한은 084 그대로(REVOKE 공용 · service_role 전용)
REVOKE ALL ON FUNCTION public.ai_user_reserve(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_user_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_user_reserve(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_user_balance(uuid) TO service_role;
