-- [운영 적용 이력] 2026-07-03 / Supabase Studio SQL Editor 수동 실행
-- [소스 관리 편입 목적] "미실행 migration" 오인 방지 — 운영 DB에 이미 반영됨
-- [재실행 안전성] ADD COLUMN IF NOT EXISTS / UPDATE IS NULL 가드 /
--               constraint IF NOT EXISTS 구조로 재실행 안전 가드가 있음.
--               단, 운영 DB에는 임의 재실행 금지. Supabase CLI migration
--               tracking 등록 여부 확인 후에만 supabase db push 사용 가능.
-- ============================================================
-- 014_normalize_city_spot_categories.sql
-- city_spots.category 값을 표준 5종으로 정규화
-- + subcategory 컬럼 추가 (원본 22종 값 보존)
-- + CHECK constraint 추가 (이후 비표준 INSERT 자동 차단)
--
-- 실행 전 필수: supabase/seeds/verify_categories.sql 먼저 실행,
--              [4] 미리보기에 ⚠️ UNMAPPED 가 없는지 확인
-- ============================================================

BEGIN;

-- ── Step 1: subcategory 컬럼 추가 ───────────────────────────
ALTER TABLE city_spots
  ADD COLUMN IF NOT EXISTS subcategory TEXT;

-- ── Step 2: 비표준 category 값을 subcategory에 백업 ─────────
-- subcategory IS NULL 조건 → 재실행 시 덮어쓰기 방지
UPDATE city_spots
SET    subcategory = category
WHERE  lower(trim(category)) NOT IN (
         'attraction', 'restaurant', 'nature', 'event', 'accommodation'
       )
AND    subcategory IS NULL;

-- ── Step 3: nature 계열 정규화 ──────────────────────────────
UPDATE city_spots
SET    category = 'nature'
WHERE  lower(trim(category)) IN (
         'beach', 'island', 'nature', 'park', 'hiking', 'walking trail'
       )
AND    category NOT IN (
         'attraction', 'restaurant', 'nature', 'event', 'accommodation'
       );

-- ── Step 4: restaurant 계열 정규화 ─────────────────────────
UPDATE city_spots
SET    category = 'restaurant'
WHERE  lower(trim(category)) IN (
         'cafe', 'cafe street', 'market', 'restaurant'
       )
AND    category NOT IN (
         'attraction', 'restaurant', 'nature', 'event', 'accommodation'
       );

-- ── Step 5: attraction 계열 정규화 ─────────────────────────
UPDATE city_spots
SET    category = 'attraction'
WHERE  lower(trim(category)) IN (
         'culture', 'art', 'history', 'landmark', 'museum', 'observatory',
         'theme park', 'transit landmark', 'viewpoint', 'attraction',
         'temple', 'shopping', 'resort area'
       )
AND    category NOT IN (
         'attraction', 'restaurant', 'nature', 'event', 'accommodation'
       );

-- ── Step 6: 검증 — 비표준 category 잔존 시 자동 ROLLBACK ───
-- 매핑에서 누락된 값이 있으면 RAISE EXCEPTION → 전체 트랜잭션 ROLLBACK
DO $$
DECLARE
  remaining_count INT;
  remaining_list  TEXT;
BEGIN
  SELECT COUNT(*),
         string_agg(DISTINCT category, ', ' ORDER BY category)
  INTO   remaining_count, remaining_list
  FROM   city_spots
  WHERE  category NOT IN (
           'attraction', 'restaurant', 'nature', 'event', 'accommodation'
         );

  IF remaining_count > 0 THEN
    RAISE EXCEPTION
      '비표준 category % 건 잔존: [%] — migration ROLLBACK',
      remaining_count, remaining_list;
  END IF;
END $$;

-- ── Step 7: CHECK constraint 추가 (idempotent) ──────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname    = 'city_spots_category_check'
    AND    conrelid   = 'city_spots'::regclass
  ) THEN
    ALTER TABLE city_spots
      ADD CONSTRAINT city_spots_category_check
      CHECK (category IN (
        'attraction', 'restaurant', 'nature', 'event', 'accommodation'
      ));
  END IF;
END $$;

COMMIT;
-- ============================================================
-- 완료 후 확인 쿼리 (별도 실행)
-- SELECT category, COUNT(*) FROM city_spots GROUP BY category ORDER BY category;
-- SELECT subcategory, COUNT(*) FROM city_spots WHERE subcategory IS NOT NULL GROUP BY subcategory ORDER BY subcategory;
-- ============================================================