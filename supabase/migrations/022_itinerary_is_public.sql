-- ⛔ WARNING — SUPERSEDED BY 030. 이 파일을 단독으로 실행하지 마라.
--
--   여기의 get_shared_itinerary 정의는 `is_public = true` 를 갖고 있지만
--   030 보다 **오래된 계약**이다. 실측 차이(2026-08-06):
--     · 반환 컬럼 11개 — 현재 12개 계약에서 `copy_count` 가 빠진다
--       (Shared 페이지가 record.copy_count 를 읽는다 → 복사 수가 0 으로 보인다)
--     · ACL 이 anon·authenticated 두 역할뿐 — 030 의 postgres·service_role 이 없다
--
--   022 는 CREATE OR REPLACE 를 쓰는데, PostgreSQL 은 CREATE OR REPLACE 로
--   반환 타입을 바꾸지 못한다. 그래서 이 파일을 그대로 돌리면 그 지점에서 실패해
--   트랜잭션이 통째로 롤백된다. 문제는 그 오류를 피하려고 DROP FUNCTION 을 먼저
--   실행하는 경우다 — 그 순간 위 두 회귀가 실제로 반영된다.
--
--   현재 권위 있는 최종 정의는
--       supabase/migrations/030_shared_itinerary_copy_count.sql
--   이며 Production 과 일치한다(12컬럼 + is_public 강제 + 4개 역할 EXECUTE).
--
--   복구·재적용·수동 SQL 실행에는 022 가 아니라 030 을 쓴다.
--   현재 상태 확인과 복원도 030 을 기준으로 한다.
--
--   이 파일은 migration 이력이므로 실행 SQL 은 고치지 않는다. 경고만 남긴다.
--   (guard test: src/lib/migration-022-superseded-guard.test.ts)
-- ════════════════════════════════════════════════════════════════════════════
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
