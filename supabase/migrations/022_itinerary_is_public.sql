-- 022: itineraries.is_public 컬럼 + 기존 행 백필 + get_shared_itinerary RPC 갱신
--
-- 백필 순서 (안전):
--   1. ADD COLUMN 기본값 없이 추가 → 기존 행은 NULL 유지
--   2. UPDATE SET is_public = true WHERE is_public IS NULL → 기존 공유 링크 보호
--   3. ALTER COLUMN SET DEFAULT false + NOT NULL → 신규 일정 비공개 기본
--
-- get_shared_itinerary RPC: is_public = true 조건 추가 (016 파일 미수정)

BEGIN;

-- ── 1. 컬럼 추가 (기존 행은 NULL) ────────────────────────────────────────────
ALTER TABLE public.itineraries ADD COLUMN IF NOT EXISTS is_public BOOLEAN;

-- ── 2. 기존 행 전부 공개 백필 ─────────────────────────────────────────────────
UPDATE public.itineraries
SET is_public = true
WHERE is_public IS NULL;

-- ── 3. 신규 기본값 false + NOT NULL 강제 ─────────────────────────────────────
ALTER TABLE public.itineraries
  ALTER COLUMN is_public SET DEFAULT false,
  ALTER COLUMN is_public SET NOT NULL;

-- ── 4. get_shared_itinerary RPC 재정의: is_public = true 조건 추가 ────────────
-- 016 원본 파일 미수정; CREATE OR REPLACE로 운영 중단 없이 교체
CREATE OR REPLACE FUNCTION public.get_shared_itinerary(p_id uuid)
RETURNS TABLE (
  id            uuid,
  city          text,
  start_date    text,
  end_date      text,
  travelers     text,
  travel_style  text,
  days          jsonb,
  trip_title    text,
  updated_at    timestamptz,
  view_count    integer,
  helpful_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.city::text,
    i.start_date::text,
    i.end_date::text,
    i.travelers::text,
    i.travel_style::text,
    i.days::jsonb,
    i.trip_title::text,
    i.updated_at,
    i.view_count,
    i.helpful_count
  FROM public.itineraries i
  WHERE i.id = p_id
    AND i.is_public = true
  LIMIT 1;
END;
$$;

REVOKE ALL     ON FUNCTION public.get_shared_itinerary(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_shared_itinerary(uuid) TO anon;
GRANT  EXECUTE ON FUNCTION public.get_shared_itinerary(uuid) TO authenticated;

COMMIT;
