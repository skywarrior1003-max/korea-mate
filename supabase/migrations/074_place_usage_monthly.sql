-- 074: 장소 월간 익명 활용 집계 (additive) — PLACE-USAGE-FOUNDATION-V2 §F·§G
--
-- 목적: 사용자 해시가 있는 원본(place_usage)을 장차 1년 후 파기해도, 장소별
-- 월간 활용 총량은 서비스 운영 기간 동안 보존한다. 이 테이블에는 사용자·
-- 기기를 구분하는 어떤 컬럼도 없다(device/actor/usage key/user id/email 금지).
--
-- usage_count 의 의미: 그 KST 월에 새로 발생한 raw 행 수 = "그 달에 이 장소를
-- 여행 일정에 처음(그 해 기준) 활용한 사람 수". raw 가 연도별 actor×장소
-- unique 라 COUNT(*) 자체가 고유 인원 의미를 가진다 — unique_actor_count
-- 별도 컬럼을 두지 않는다(§F).
--
-- 안전 계약(§G): open 월만 반복 재계산(멱등 UPSERT). finalized 월은 일반
-- 경로로 덮어쓸 수 없다 — 원본 파기 후 재계산이 0 으로 덮는 사고의 원천 차단.
-- 이번 단계에서 scheduler·원본 삭제는 활성화하지 않는다(§H).

BEGIN;

CREATE TABLE IF NOT EXISTS public.place_usage_monthly (
  target_type   TEXT        NOT NULL CHECK (target_type IN ('city_spot')),
  target_key    TEXT        NOT NULL CHECK (char_length(target_key) BETWEEN 1 AND 64),
  -- KST 기준 해당 월 1일
  month_start   DATE        NOT NULL CHECK (EXTRACT(DAY FROM month_start) = 1),
  usage_count   BIGINT      NOT NULL CHECK (usage_count >= 0),
  status        TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'finalized')),
  aggregated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (target_type, target_key, month_start)
);

ALTER TABLE public.place_usage_monthly ENABLE ROW LEVEL SECURITY;
-- 일반 사용자 직접 접근 불요(노출은 서버 API/RPC 경유) — SELECT 포함 전면 차단
REVOKE ALL ON public.place_usage_monthly FROM anon, authenticated;

-- ── KST 월 경계 helper ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.place_usage_kst_month(p_at TIMESTAMPTZ)
RETURNS DATE
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$ SELECT date_trunc('month', p_at AT TIME ZONE 'Asia/Seoul')::date $$;

-- ── ① Open Month Refresh — 현재 KST 월 전체 재계산(멱등) ───────────────────
--
-- 수동 증감이 아니라 raw COUNT(*) 재계산 UPSERT 다. 몇 번을 다시 돌려도 값이
-- 늘지 않고, 뒤늦게 들어온 행도 다음 실행에서 자연 반영된다. finalized 행은
-- WHERE 로 보호한다(현재 월이 finalized 일 수는 없지만 방어를 이중으로 둔다).
-- raw 0건 장소의 0행은 만들지 않는다 — 존재하는 활용만 집계한다.
CREATE OR REPLACE FUNCTION public.place_usage_monthly_refresh_open()
RETURNS TABLE (refreshed_rows BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month DATE := public.place_usage_kst_month(now());
  v_count BIGINT;
BEGIN
  INSERT INTO public.place_usage_monthly AS m
    (target_type, target_key, month_start, usage_count, status, aggregated_at, updated_at)
  SELECT u.target_type, u.target_key, v_month, count(*), 'open', now(), now()
    FROM public.place_usage u
   WHERE public.place_usage_kst_month(u.created_at) = v_month
   GROUP BY u.target_type, u.target_key
  ON CONFLICT (target_type, target_key, month_start) DO UPDATE
    SET usage_count = EXCLUDED.usage_count,
        aggregated_at = now(), updated_at = now()
    WHERE m.status = 'open';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END $$;

-- ── ② Past Month Finalization — 종료된 KST 월만, 1회 확정 ──────────────────
--
-- 현재·미래 월은 예외로 거부한다. 이미 finalized 인 월도 거부한다(멱등이
-- 아니라 **명시적 실패** — 원본 파기 이후의 우발 재계산이 0 으로 덮지 못하게).
-- 복구가 필요하면 이 함수가 아니라 별도의 admin 승인 절차(향후 TASK)로만.
CREATE OR REPLACE FUNCTION public.place_usage_monthly_finalize(p_month DATE)
RETURNS TABLE (ok BOOLEAN, reason TEXT, finalized_rows BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current DATE := public.place_usage_kst_month(now());
  v_count BIGINT;
BEGIN
  IF p_month IS NULL OR EXTRACT(DAY FROM p_month) <> 1 THEN
    RETURN QUERY SELECT false, 'invalid_month', 0::bigint; RETURN;
  END IF;
  IF p_month >= v_current THEN
    RETURN QUERY SELECT false, 'month_not_ended', 0::bigint; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.place_usage_monthly
              WHERE month_start = p_month AND status = 'finalized') THEN
    RETURN QUERY SELECT false, 'already_finalized', 0::bigint; RETURN;
  END IF;

  -- 마지막 재계산 후 확정 — open 상태의 기존 행은 갱신, 없던 장소는 삽입
  INSERT INTO public.place_usage_monthly AS m
    (target_type, target_key, month_start, usage_count, status, aggregated_at, finalized_at, updated_at)
  SELECT u.target_type, u.target_key, p_month, count(*), 'finalized', now(), now(), now()
    FROM public.place_usage u
   WHERE public.place_usage_kst_month(u.created_at) = p_month
   GROUP BY u.target_type, u.target_key
  ON CONFLICT (target_type, target_key, month_start) DO UPDATE
    SET usage_count = EXCLUDED.usage_count,
        status = 'finalized', aggregated_at = now(), finalized_at = now(), updated_at = now()
    WHERE m.status = 'open';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT true, 'finalized', v_count;
END $$;

-- 실행 권한 — service_role 전용(anon/authenticated 실행 차단)
REVOKE ALL ON FUNCTION public.place_usage_monthly_refresh_open() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.place_usage_monthly_finalize(DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.place_usage_kst_month(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_usage_monthly_refresh_open() TO service_role;
GRANT EXECUTE ON FUNCTION public.place_usage_monthly_finalize(DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.place_usage_kst_month(TIMESTAMPTZ) TO service_role;

-- 검증 — RLS·사용자 축 컬럼 부재
DO $v074$
DECLARE bad TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'place_usage_monthly' AND relrowsecurity = false) THEN
    RAISE EXCEPTION '[074] RLS 미적용';
  END IF;
  SELECT string_agg(column_name, ', ') INTO bad
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'place_usage_monthly'
     AND column_name ~ '(device|actor|usage_key|user_id|email|hash)';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '[074] 사용자 축 컬럼 금지 위반: %', bad;
  END IF;
END $v074$;

COMMIT;
